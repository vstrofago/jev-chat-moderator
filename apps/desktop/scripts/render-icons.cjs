// Renders the app and tray icons from the logo emoji (Noto Color Emoji), one icon per run:
//   for f in icon.png icon@2x.png tray.png tray@2x.png; do
//     xvfb-run -a -s "-screen 0 2048x2048x24" pnpm exec electron --no-sandbox scripts/render-icons.cjs build $f; done
const { app, BrowserWindow } = require("electron");
const fs = require("fs");
const out = process.argv.at(-2);
const only = process.argv.at(-1);
const jobs = [
  { file: "icon.png", size: 512, bg: true },
  { file: "icon@2x.png", size: 1024, bg: true },
  { file: "tray.png", size: 32, bg: false },
  { file: "tray@2x.png", size: 64, bg: false },
];
const html = (size, bg) => `<!doctype html><html><body style="margin:0;background:transparent;overflow:hidden">
<div style="width:${size}px;height:${size}px;display:grid;place-items:center;${bg ? `background:#0f1726;border-radius:${size * 0.22}px;` : ""}">
<span style="font:${Math.round(size * (bg ? 0.62 : 0.86))}px/1 'Noto Color Emoji';${bg ? "" : "margin-top:" + Math.round(size * 0.04) + "px;"}">🦇</span></div></body></html>`;
app.whenReady().then(async () => {
  for (const j of jobs.filter((j) => j.file === only)) {
    const w = new BrowserWindow({ width: j.size, height: j.size, show: false, transparent: true, frame: false, useContentSize: true, webPreferences: { offscreen: true } });
    const tmp = `${out}/.render-${j.size}.html`;
    fs.writeFileSync(tmp, html(j.size, j.bg).replace("<html>", '<html><head><meta charset="utf-8"></head>'));
    await w.loadFile(tmp);
    fs.unlinkSync(tmp);
    await new Promise((r) => setTimeout(r, 500));
    const img = await w.webContents.capturePage({ x: 0, y: 0, width: j.size, height: j.size });
    fs.writeFileSync(`${out}/${j.file}`, img.resize({ width: j.size, height: j.size }).toPNG());
    w.destroy();
  }
  app.exit(0);
});
