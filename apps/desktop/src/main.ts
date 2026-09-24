/**
 * Vigia for streamers: a window to set it up, then the dashboard, and a tray icon while
 * streaming. Everything runs on this computer; the host only listens on 127.0.0.1.
 */
import { createWriteStream } from "node:fs";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { detectProvider } from "@vigia/core";
import { jevEvaluator } from "@vigia/engine";
import { createSetupFlow, createUsageMeter, NeedsLogin, nextStep, openSecrets, sourceFromSettings, startVigia, type Secrets, type SetupFlow, type Vigia } from "@vigia/server";
import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, nativeImage, net, protocol, safeStorage, session, shell, Tray, type IpcMainInvokeEvent } from "electron";
import electronUpdater from "electron-updater";
import { pickPort } from "./ports";

const SMOKE = process.env.VIGIA_SMOKE === "1";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const RESOURCES = app.isPackaged ? process.resourcesPath : "";
const UI_DIR = app.isPackaged ? join(RESOURCES, "ui") : resolve(ROOT, "../../packages/ui/dist");
const EXAMPLE_RULES = app.isPackaged ? join(RESOURCES, "vigia.yaml") : resolve(ROOT, "../../packages/engine/examples/vigia.yaml");
const SPOILER_PACKS = app.isPackaged ? join(RESOURCES, "spoiler-packs") : resolve(ROOT, "../../spoiler-packs");
const ICONS = app.isPackaged ? join(RESOURCES, "icons") : join(ROOT, "build");
const SETUP_URL = "vigia://setup/setup.html";

const es = app.getLocale().startsWith("es");
const T = es
  ? {
      open: "Abrir Vigia",
      copyOverlay: "Copiar dirección del overlay",
      pause: "Pausar moderación",
      loginItem: "Iniciar con el equipo",
      packsFolder: "Abrir carpeta de packs de spoilers",
      setupAgain: "Configurar de nuevo…",
      quit: "Salir",
      stillRunning: "Vigia sigue funcionando en la bandeja del sistema.",
      startFailed: "Vigia no pudo iniciar",
      retry: "Reintentar",
    }
  : {
      open: "Open Vigia",
      copyOverlay: "Copy overlay address",
      pause: "Pause moderation",
      loginItem: "Start with the computer",
      packsFolder: "Open spoiler packs folder",
      setupAgain: "Set up again…",
      quit: "Quit",
      stillRunning: "Vigia keeps running in the system tray.",
      startFailed: "Vigia could not start",
      retry: "Try again",
    };

protocol.registerSchemesAsPrivileged([{ scheme: "vigia", privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

if (SMOKE) {
  app.setPath("userData", await mkdtemp(join(tmpdir(), "vigia-smoke-")));
  // CI machines have no GPU; a software-rendered window can still be captured.
  app.disableHardwareAcceleration();
}
if (!SMOKE && !app.requestSingleInstanceLock()) app.exit(0);

let secrets: Secrets;
let win: BrowserWindow | null = null;
let tray: Tray | null = null;
let vigia: Vigia | null = null;
let quitting = false;
let toldAboutTray = false;

const logFile = createWriteStream(join(app.getPath("userData"), "vigia.log"), { flags: "w" });
const log = (line: string) => {
  logFile.write(`${new Date().toISOString()} ${line}\n`);
  if (!app.isPackaged) console.log(line);
};

// ---------- window ----------

/** Pages the window may show: the setup page, and the dashboard once the host runs. */
function allowed(url: string) {
  if (url.startsWith("vigia://setup/")) return true;
  return vigia !== null && (url === vigia.url || url.startsWith(`${vigia.url}/`));
}

function createWindow() {
  const w = new BrowserWindow({
    width: 1120,
    height: 780,
    minWidth: 720,
    minHeight: 540,
    show: false,
    title: "Vigia",
    backgroundColor: "#0e1116",
    icon: join(ICONS, "icon.png"),
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(ROOT, "dist", "preload.cjs"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webviewTag: false,
      spellcheck: false,
    },
  });
  w.webContents.on("will-navigate", (e, url) => {
    if (allowed(url)) return;
    e.preventDefault();
    if (/^https:\/\//.test(url)) void shell.openExternal(url);
  });
  w.webContents.on("will-redirect", (e, url) => {
    if (!allowed(url)) e.preventDefault();
  });
  w.webContents.setWindowOpenHandler(({ url }) => {
    // The overlay preview opens in the real browser, like every outside link.
    if (/^https:\/\//.test(url) || allowed(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  w.on("close", (e) => {
    if (quitting || !tray) return;
    e.preventDefault();
    w.hide();
    if (!toldAboutTray && process.platform === "win32") {
      toldAboutTray = true;
      tray.displayBalloon({ title: "Vigia", content: T.stillRunning });
    }
  });
  w.once("ready-to-show", () => {
    if (SMOKE || !startedHidden()) w.show();
  });
  return w;
}

function show() {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function startedHidden() {
  return process.argv.includes("--hidden");
}

// ---------- setup page ----------

/** Serves setup.html and its assets from the UI build, and nothing else. */
function serveSetupPage() {
  const root = resolve(UI_DIR);
  protocol.handle("vigia", async (req) => {
    const url = new URL(req.url);
    const rel = decodeURIComponent(url.pathname).replace(/^\/+/, "");
    const path = resolve(root, rel);
    if (url.host !== "setup" || !(rel === "setup.html" || rel.startsWith("assets/")) || !path.startsWith(root + sep)) {
      return new Response("Not found", { status: 404 });
    }
    const res = await net.fetch(pathToFileURL(path).toString());
    if (!res.ok) return new Response("Not found", { status: 404 });
    const headers = new Headers(res.headers);
    headers.set(
      "Content-Security-Policy",
      "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'",
    );
    return new Response(res.body, { status: 200, headers });
  });
}

let flow: SetupFlow;

/** Every setup call must come from the setup page itself. */
function handle(channel: string, fn: (...args: any[]) => unknown) {
  ipcMain.handle(`setup:${channel}`, (e: IpcMainInvokeEvent, ...args: unknown[]) => {
    if (!e.senderFrame?.url.startsWith("vigia://setup/")) throw new Error("Not allowed");
    return fn(...args);
  });
}

function registerSetupCalls() {
  flow = createSetupFlow({
    secrets,
    onLogin: (r) => win?.webContents.send("setup:twitchLogin", r),
    openExternal: (url) => void shell.openExternal(url),
  });
  handle("state", () => flow.state());
  handle("chooseSource", (source: unknown, channel: unknown) => flow.chooseSource(source, channel));
  handle("saveClientId", (clientId: unknown) => flow.saveClientId(clientId));
  handle("startTwitchLogin", () => flow.startTwitchLogin());
  handle("saveJevKey", (key: unknown) => flow.saveJevKey(key));
  handle("back", () => flow.back());
  handle("finish", async () => {
    if (flow.state().step === "done") await startHostOrAsk();
  });
  handle("openExternal", async (url: unknown) => {
    if (typeof url === "string" && /^https:\/\//.test(url)) await shell.openExternal(url);
  });
}

function showSetup() {
  if (!win) win = createWindow();
  void win.loadURL(SETUP_URL);
}

// ---------- the host ----------

async function startHost() {
  const s = secrets.get();
  const port = await pickPort(s.port);
  if (port !== s.port) await secrets.update({ port });

  let source;
  try {
    source = await sourceFromSettings(secrets, { log });
  } catch (e) {
    // The saved Twitch login stopped working (revoked, or new scopes): log in again in setup.
    if (!(e instanceof NeedsLogin)) throw e;
    return showSetup();
  }

  const usage = createUsageMeter();
  vigia = await startVigia({
    configPath: join(app.getPath("userData"), "vigia.yaml"),
    dataDir: join(app.getPath("userData"), "data"),
    uiDir: UI_DIR,
    exampleText: await readFile(EXAMPLE_RULES, "utf8"),
    source,
    evaluate: jevEvaluator({ apiKey: s.jevKey!, provider: detectProvider(s.jevKey!) }, { onUsage: (n) => usage.tokens(n) }),
    usage,
    host: "127.0.0.1",
    port,
    authMode: "local",
    spoilerPackDirs: [userPacksDir(), SPOILER_PACKS],
    log,
  });
  log(`Vigia is running at ${vigia.url}`);
  vigia.engine.on((e) => {
    if (e.type === "state") updateTray();
  });
  createTray();
  if (!win) win = createWindow();
  await win.loadURL(`${vigia.url}/`);
}

async function stopHost() {
  const v = vigia;
  vigia = null;
  tray?.destroy();
  tray = null;
  await v?.close();
}

// ---------- tray ----------

/** The streamer's own spoiler packs; they win over the bundled ones. */
const userPacksDir = () => join(app.getPath("userData"), "data", "spoiler-packs");

function createTray() {
  if (tray) return updateTray();
  const icon = nativeImage.createFromPath(join(ICONS, "tray.png"));
  if (process.platform === "darwin") icon.setTemplateImage(true);
  tray = new Tray(icon);
  tray.setToolTip("Vigia");
  tray.on("click", show);
  updateTray();
}

function updateTray() {
  if (!tray || !vigia) return;
  const v = vigia;
  const loginItems = process.platform === "win32" || process.platform === "darwin";
  const menu = Menu.buildFromTemplate([
    { label: T.open, click: show },
    { label: T.copyOverlay, click: () => clipboard.writeText(v.overlayUrl) },
    { type: "separator" },
    { label: T.pause, type: "checkbox", checked: v.engine.state().paused, click: (item) => v.engine.setPaused(item.checked) },
    {
      label: T.loginItem,
      type: "checkbox",
      visible: loginItems,
      checked: loginItems && app.getLoginItemSettings().openAtLogin,
      click: (item) => app.setLoginItemSettings({ openAtLogin: item.checked, args: ["--hidden"] }),
    },
    {
      label: T.packsFolder,
      click: async () => {
        const dir = userPacksDir();
        await mkdir(dir, { recursive: true });
        await shell.openPath(dir);
      },
    },
    { type: "separator" },
    {
      label: T.setupAgain,
      click: async () => {
        await stopHost();
        // Keep the Jev key and the port (the OBS overlay address); ask for the rest again.
        await flow.reset();
        showSetup();
        show();
      },
    },
    { label: T.quit, click: () => app.quit() },
  ]);
  tray.setContextMenu(menu);
}

// ---------- app lifecycle ----------

async function boot() {
  secrets = await openSecrets(join(app.getPath("userData"), "secrets.json"), {
    available: () => safeStorage.isEncryptionAvailable(),
    encrypt: (text) => safeStorage.encryptString(text),
    decrypt: (data) => safeStorage.decryptString(data),
  });
  // No web page may ask for the camera, notifications or anything else.
  session.defaultSession.setPermissionRequestHandler((_wc, _perm, done) => done(false));
  serveSetupPage();
  registerSetupCalls();

  if (SMOKE) return smoke();
  if (nextStep(secrets.get()) !== "done") return showSetup();
  await startHostOrAsk();
  if (app.isPackaged) electronUpdater.autoUpdater.checkForUpdatesAndNotify().catch((e: Error) => log(`Update check failed: ${e.message}`));
}

async function startHostOrAsk(): Promise<void> {
  try {
    await startHost();
  } catch (e) {
    log(`Could not start: ${(e as Error).message}`);
    await stopHost();
    const r = await dialog.showMessageBox({
      type: "error",
      title: "Vigia",
      message: T.startFailed,
      detail: (e as Error).message,
      buttons: [T.retry, T.setupAgain, T.quit],
      defaultId: 0,
    });
    if (r.response === 0) return startHostOrAsk();
    if (r.response === 1) return showSetup();
    app.quit();
  }
}

/** VIGIA_SMOKE=1: load the setup page and the dashboard, save screenshots, quit. Needs a display (Xvfb in CI). */
async function smoke() {
  const out = process.env.VIGIA_SMOKE_OUT ?? process.cwd();
  // Fail loudly instead of hanging a CI job.
  setTimeout(() => {
    console.error("smoke: failed: timed out after 90 s");
    app.exit(1);
  }, 90_000).unref();
  const capture = async (name: string) => {
    await new Promise((r) => setTimeout(r, 1500));
    const image = await win!.webContents.capturePage();
    const file = join(out, `smoke-${name}.png`);
    await writeFile(file, image.toPNG());
    console.log(`smoke: ${name} → ${file} (${win!.webContents.getURL()})`);
  };
  try {
    showSetup();
    await new Promise<void>((r) => win!.webContents.once("did-finish-load", () => r()));
    await capture("setup");
    await secrets.update({ source: "observe", observeChannel: process.env.VIGIA_SMOKE_CHANNEL ?? "twitchdev", jevKey: "vck_smoke_not_a_real_key" });
    await startHost();
    await capture("dashboard");
    console.log("smoke: ok");
  } catch (e) {
    console.error(`smoke: failed: ${(e as Error).stack}`);
    process.exitCode = 1;
  }
  quitting = true;
  await stopHost();
  app.exit(Number(process.exitCode ?? 0));
}

app.on("second-instance", show);
app.on("activate", show);
app.on("before-quit", () => {
  quitting = true;
});
app.on("will-quit", (e) => {
  if (!vigia) return;
  e.preventDefault();
  void stopHost().finally(() => app.quit());
});
app.on("window-all-closed", () => {
  // Before setup is done there is no tray, so closing the window ends the app.
  if (!tray) app.quit();
});

app.whenReady().then(boot, (e) => log(`Startup failed: ${e.message}`));
