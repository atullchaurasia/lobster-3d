// Shared by stills.js and record.js: an offline test copy of index.html, a Chromium with a GL that works headless,
// and a deterministic clock. The page never sees real time: performance.now and requestAnimationFrame are stubbed, and
// window.__step(ms) advances the clock and runs one frame, so every still and every video frame is reproducible.
const fs = require('fs');
const path = require('path');
const {chromium} = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const CDN = {
  'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js': 'vendor/three.min.js',
  'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/utils/BufferGeometryUtils.js': 'vendor/BufferGeometryUtils.js',
  'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/environments/RoomEnvironment.js': 'vendor/RoomEnvironment.js',
};

/** writes tools/_test.html: index.html with the three.js CDN URLs pointed at tools/vendor/ */
function testPage() {
  let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  for (const [url, local] of Object.entries(CDN)) {
    if (!html.includes(url)) throw new Error(`index.html no longer loads ${url}; update tools/lib.js`);
    html = html.split(url).join(local);
  }
  const out = path.join(__dirname, '_test.html');
  fs.writeFileSync(out, html);
  return 'file:///' + out.replace(/\\/g, '/');
}

const CLOCK = () => {
  let now = 0;
  const q = [];
  // the page skips its adaptive quality step under this clock: a fixed 30 fps step would read as a slow GPU
  window.__CAPTURE = true;
  performance.now = () => now;
  window.requestAnimationFrame = (cb) => (q.push(cb), q.length);
  // reading one pixel waits for the GPU, so queued frames never pile up behind a screenshot
  const sync = () => {
    const c = document.getElementById('gl');
    const gl = c && (c.getContext('webgl2') || c.getContext('webgl'));
    if (gl) gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
  };
  window.__step = (ms) => {
    now += ms;
    q.splice(0).forEach((cb) => cb(now));
    sync();
  };
  // n frames of ms each, in one round trip
  window.__run = (n, ms) => {
    for (let i = 0; i < n; i++) window.__step(ms);
  };
};

async function open({width = 1600, height = 900, dpr = 1} = {}) {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM || undefined,
    // GL=gpu renders on the machine's GPU through ANGLE/D3D11 (Windows): many times faster and the same image the page
    // shows a visitor. The default is SwiftShader, which runs anywhere, including machines with no GPU.
    args: process.env.GL === 'gpu'
      ? ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-webgl']
      : ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'],
  });
  const page = await browser.newPage({viewport: {width, height}, deviceScaleFactor: dpr});
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.addInitScript(CLOCK);
  await page.goto(testPage(), {waitUntil: 'load'});
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => window.__lx && window.__step);
  return {browser, page, errors};
}

const args = (argv) => {
  const o = {};
  for (let i = 0; i < argv.length; i++) if (argv[i].startsWith('--')) o[argv[i].slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
  return o;
};

module.exports = {ROOT, open, args};
