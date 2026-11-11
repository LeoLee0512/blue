/**
 * Electron shell for 蓝稿.
 *
 * Starts the production Nitro server (not the Vite dev server) and opens one
 * window titled 蓝稿. Node on the end-user machine is the Node bundled inside
 * Electron; nothing else has to be installed.
 */
import { app, BrowserWindow, dialog, Menu, shell } from "electron";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ensureInstallKey } from "../scripts/install-key.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

app.setName("蓝稿");

const dataRoot = path.join(app.getPath("appData"), "蓝稿");
app.setPath("userData", dataRoot);
process.env.LANGAO_DATA_DIR = dataRoot;
ensureInstallKey({ force: true });

/** @type {import("node:child_process").ChildProcess | null} */
let server = null;
/** @type {BrowserWindow | null} */
let win = null;
let quitting = false;

function serverEntry() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "langao", "server", "index.mjs");
  }
  return path.join(repoRoot, ".output", "server", "index.mjs");
}

function nodePath() {
  const bundled = app.isPackaged
    ? path.join(process.resourcesPath, "node_modules")
    : path.join(repoRoot, "node_modules");
  return [bundled, process.env.NODE_PATH].filter(Boolean).join(path.delimiter);
}

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      const port = typeof address === "object" && address ? address.port : 0;
      probe.close(() => resolve(port));
    });
    probe.on("error", reject);
  });
}

function redact(text) {
  const secret = process.env.KEY_ENCRYPTION_SECRET ?? "";
  if (!secret) return text;
  return text.split(secret).join("[redacted]");
}

function stopServer() {
  const child = server;
  server = null;
  if (!child || child.killed) return;
  child.kill();
  setTimeout(() => {
    if (child.exitCode == null) child.kill("SIGKILL");
  }, 3000).unref();
}

/**
 * @param {string} url
 * @param {import("node:child_process").ChildProcess} child
 * @param {() => string} log
 */
async function waitUntilUp(url, child, log) {
  const deadline = Date.now() + 45000;
  let last = "";
  while (Date.now() < deadline) {
    if (child.exitCode != null) {
      throw new Error(`本地服务已退出（${child.exitCode}）。\n${redact(log())}`);
    }
    try {
      const res = await fetch(url, { redirect: "manual" });
      if (res.status < 500) return;
      last = `HTTP ${res.status}`;
    } catch (err) {
      last = err instanceof Error ? err.message : String(err);
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`本地服务没有在预期时间内启动。${last}\n${redact(log())}`);
}

async function openWindow(url) {
  win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 880,
    minHeight: 640,
    title: "蓝稿",
    backgroundColor: "#f4f7fb",
    autoHideMenuBar: true,
    icon: path.join(repoRoot, "electron", "icon.png"),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.setTitle("蓝稿");
  const origin = new URL(url).origin;
  win.webContents.setWindowOpenHandler(({ url: target }) => {
    if (target.startsWith("https://") || target.startsWith("http://")) {
      shell.openExternal(target);
    }
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, target) => {
    if (new URL(target).origin !== origin) {
      event.preventDefault();
      if (target.startsWith("https://")) shell.openExternal(target);
    }
  });
  win.webContents.on("before-input-event", (event, input) => {
    if (input.type === "keyDown" && input.key === "F12") {
      win?.webContents.toggleDevTools();
      event.preventDefault();
    }
  });
  win.on("closed", () => {
    win = null;
  });
  await win.loadURL(url);
  win.setTitle("蓝稿");
}

async function start() {
  const port = await freePort();
  const entry = serverEntry();
  const url = `http://127.0.0.1:${port}/`;
  let tail = "";
  const child = spawn(process.execPath, [entry], {
    cwd: path.dirname(path.dirname(entry)),
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      HOST: "127.0.0.1",
      NITRO_HOST: "127.0.0.1",
      PORT: String(port),
      NITRO_PORT: String(port),
      NODE_ENV: "production",
      LANGAO_DATA_DIR: dataRoot,
      KEY_ENCRYPTION_SECRET: process.env.KEY_ENCRYPTION_SECRET,
      NODE_PATH: nodePath(),
    },
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  server = child;
  const append = (chunk) => {
    tail = `${tail}${chunk.toString()}`.slice(-4000);
  };
  child.stdout?.on("data", append);
  child.stderr?.on("data", append);
  child.on("exit", (code) => {
    if (!quitting && code && code !== 0) {
      dialog.showErrorBox("蓝稿", redact(`写作服务意外退出（${code}）。\n${tail}`));
    }
  });
  try {
    await waitUntilUp(url, child, () => tail);
    await openWindow(url);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    dialog.showErrorBox("蓝稿", redact(message));
    app.quit();
  }
}

Menu.setApplicationMenu(null);

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });
  app.whenReady().then(start);
  app.on("before-quit", () => {
    quitting = true;
    stopServer();
  });
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => {
      quitting = true;
      stopServer();
      app.quit();
    });
  }
  app.on("window-all-closed", () => {
    stopServer();
    app.quit();
  });
}
