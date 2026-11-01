// §13: one still per state (hero, every isolate preset, exploded, the flip at 0.5 s and 1.0 s), a contact sheet of them,
// and a scrub of the flip at 0.1 s steps. The tour is stopped; each state is set, then the clock runs until the camera
// has settled. Output in renders/.
//   node tools/stills.js            all of it
//   node tools/stills.js --no-scrub skip the flip scrub
const fs = require('fs');
const path = require('path');
const {ROOT, open, args} = require('./lib');

const A = args(process.argv.slice(2));
const OUT = path.join(ROOT, 'renders');
const FPS = 30;
const MS = 1000 / FPS;

const STATES = [
  ['hero', 'hero'],
  ['crusher', 'clawL'],
  ['tail-fan', 'tail'],
  ['leg-l2', 'legL2'],
  ['carapace', 'carapace'],
  ['antennae', 'sensors'],
  ['exploded', 'explode'],
];

// a contact sheet from PNGs: a grid page written next to them (about:blank may not load file:// images), screenshotted
async function sheet(browser, files, cols, out, tileW) {
  const rows = Math.ceil(files.length / cols);
  const tileH = Math.round((tileW * 9) / 16);
  const page = await browser.newPage({viewport: {width: cols * tileW, height: rows * (tileH + 22)}});
  const cells = files.map((f) => `<figure><img src="${path.basename(f)}"><figcaption>${path.basename(f, '.png')}</figcaption></figure>`).join('');
  const html = path.join(OUT, '_sheet.html');
  fs.writeFileSync(html, `<!doctype html><style>body{margin:0;display:grid;grid-template-columns:repeat(${cols},${tileW}px);background:#222}
    figure{margin:0}img{width:${tileW}px;height:${tileH}px;display:block;object-fit:cover}
    figcaption{font:12px monospace;color:#eee;padding:3px 6px;height:16px}</style>${cells}`);
  await page.goto('file:///' + html.replace(/\\/g, '/'));
  await page.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0));
  await page.screenshot({path: out});
  await page.close();
}

(async () => {
  fs.mkdirSync(OUT, {recursive: true});
  const {browser, page, errors} = await open();
  await page.evaluate(() => window.__lx.stop());
  await page.evaluate(([ms]) => window.__run(30, ms), [MS]);
  const shots = [];
  const shoot = async (name) => {
    const f = path.join(OUT, `${name}.png`);
    await page.screenshot({path: f, timeout: 0});
    shots.push(f);
    console.log('still', name);
  };

  for (const [name, id] of STATES) {
    await page.evaluate((id) => (id === 'explode' ? window.__lx.setExplode(true) : window.__lx.setAsm(id)), id);
    // 1.3 s camera move + parts easing at 3.6/s (and 2.6/s for exploded): 3 s of sim time settles both
    await page.evaluate(([ms]) => window.__run(90, ms), [MS]);
    await shoot(name);
    if (id === 'explode') await page.evaluate(() => window.__lx.setExplode(false));
  }

  // the flip: wait for the camera, then catch the start of the next cycle and stop at the times asked for
  await page.evaluate(() => window.__lx.setAsm('flip'));
  await page.evaluate(([ms]) => {
    const S = window.__lx.S;
    let prev = S.strikeT;
    for (let i = 0; i < 400; i++) {
      window.__step(ms);
      if (S.strikeT < prev) return; // wrapped: a new flip has just begun
      prev = S.strikeT;
    }
  }, [MS]);
  const stepTo = (u) =>
    page.evaluate(([u, ms]) => {
      const S = window.__lx.S;
      while (S.strikeT < u - 1e-6) window.__step(Math.min(ms, (u - S.strikeT) * 1000));
      return S.strikeT;
    }, [u, MS]);
  const scrub = [];
  for (let u = 0.1; u <= 1.31; u += 0.1) {
    const at = await stepTo(Math.round(u * 10) / 10);
    const tag = at.toFixed(1);
    if (tag === '0.5' || tag === '1.0') await shoot(`flip-${tag}s`);
    else if (!A['no-scrub']) {
      const f = path.join(OUT, `scrub-${tag}s.png`);
      await page.screenshot({path: f, timeout: 0});
      scrub.push(f);
    }
  }
  const vals = await page.evaluate(() => {
    const S = window.__lx.S;
    return {curl: Math.round(S.tailAng), thrust: +S.thrust.toFixed(2), strikeT: +S.strikeT.toFixed(2)};
  });
  console.log('flip state at end of scrub', vals);

  await sheet(browser, shots, 3, path.join(OUT, 'contact.png'), 640);
  console.log('sheet renders/contact.png');
  if (scrub.length) {
    const all = [...scrub, ...shots.filter((f) => /flip-/.test(f))].sort((a, b) => parseFloat(a.match(/(\d\.\d)s/)[1]) - parseFloat(b.match(/(\d\.\d)s/)[1]));
    await sheet(browser, all, 4, path.join(OUT, 'flip-scrub.png'), 480);
    console.log('sheet renders/flip-scrub.png');
  }
  if (errors.length) console.log('PAGE ERRORS\n' + errors.join('\n'));
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
