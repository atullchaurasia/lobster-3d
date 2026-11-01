// §14: the 26 s tour captured frame by frame on a deterministic clock (never a screen recording), then encoded with
// ffmpeg to an H.264 mp4 and a two-pass palette GIF, plus a 4 × 2 contact sheet. Frames go to out/frames/.
//   node tools/record.js                          1280 × 720, 30 fps mp4 + 12 fps gif
//   node tools/record.js --size 1920x1080 --fps 60 --no-gif
// FFMPEG=<path> if ffmpeg is not on PATH. Without ffmpeg the frames are kept and the commands are printed.
const fs = require('fs');
const path = require('path');
const {execFileSync} = require('child_process');
const {ROOT, open, args} = require('./lib');

const A = args(process.argv.slice(2));
const [W, H] = String(A.size || '1280x720').split('x').map(Number);
const FPS = Number(A.fps || 30);
const DUR = Number(A.duration || 26.5);
const OUT = path.join(ROOT, 'out');
const FR = path.join(OUT, 'frames');
const FFMPEG = process.env.FFMPEG || 'ffmpeg';

const hasFfmpeg = () => {
  try {
    execFileSync(FFMPEG, ['-version'], {stdio: 'ignore'});
    return true;
  } catch {
    return false;
  }
};

(async () => {
  fs.rmSync(FR, {recursive: true, force: true});
  fs.mkdirSync(FR, {recursive: true});
  const {browser, page, errors} = await open({width: W, height: H});
  const n = Math.round(DUR * FPS);
  const t0 = Date.now();
  for (let i = 0; i < n; i++) {
    await page.evaluate((ms) => window.__step(ms), 1000 / FPS);
    await page.screenshot({path: path.join(FR, `f${String(i).padStart(4, '0')}.png`), timeout: 0});
    if (i % FPS === 0) process.stdout.write(`\r${(i / FPS).toFixed(0)} / ${DUR} s  (${((Date.now() - t0) / 1000).toFixed(0)} s wall)`);
  }
  console.log(`\n${n} frames → out/frames/`);
  if (errors.length) console.log('PAGE ERRORS\n' + errors.join('\n'));
  await browser.close();

  const inp = path.join(FR, 'f%04d.png');
  const mp4 = path.join(OUT, 'hx4.mp4');
  const gif = path.join(OUT, 'hx4.gif');
  const pal = path.join(OUT, 'palette.png');
  const gifFps = 12;
  const cmds = [
    ['-y', '-framerate', String(FPS), '-i', inp, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-movflags', '+faststart', mp4],
    ['-y', '-i', mp4, '-vf', "select='not(mod(n,40))',scale=480:-1,tile=4x2", '-frames:v', '1', path.join(OUT, 'contact.png')],
  ];
  if (!A['no-gif'])
    cmds.push(
      ['-y', '-i', mp4, '-vf', `fps=${gifFps},scale=900:-1:flags=lanczos,palettegen=max_colors=128:stats_mode=diff`, pal],
      ['-y', '-i', mp4, '-i', pal, '-lavfi', `fps=${gifFps},scale=900:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`, gif],
    );
  if (!hasFfmpeg()) {
    console.log('ffmpeg not found (set FFMPEG=<path>). Run these yourself:');
    for (const c of cmds) console.log('  ffmpeg ' + c.map((a) => (/[\s;'\[]/.test(a) ? `"${a}"` : a)).join(' '));
    return;
  }
  for (const c of cmds) execFileSync(FFMPEG, c, {stdio: ['ignore', 'ignore', 'inherit']});
  console.log('wrote out/hx4.mp4' + (A['no-gif'] ? '' : ', out/hx4.gif') + ', out/contact.png');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
