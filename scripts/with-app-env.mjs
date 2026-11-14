#!/usr/bin/env node
/**
 * Run a command with `.grok/app-env.json` merged into its environment, and
 * point an unset `LANGAO_DATA_DIR` at `<repo>/.data` so `npm run dev` does not
 * write into the machine-wide data directory.
 *
 * Only `VITE_`-prefixed keys from the file are honored. A real `process.env`
 * entry always wins.
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { constants as osConstants } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const APP_ENV_REL_PATH = ".grok/app-env.json";

const VITE_PREFIX = "VITE_";

/**
 * Parse an app-env document, keeping only `VITE_`-prefixed string entries.
 * Anything unparseable is an empty environment — a workspace without the file
 * must behave exactly like today (auth on, no overrides).
 */
export function parseAppEnv(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return {};
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  const env = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (!key.startsWith(VITE_PREFIX)) continue;
    if (typeof value !== "string") continue;
    env[key] = value;
  }
  return env;
}

/** The app env recorded under `root`, or `{}` when the file is absent. */
export function readAppEnv(root) {
  try {
    return parseAppEnv(readFileSync(join(root, APP_ENV_REL_PATH), "utf8"));
  } catch {
    return {};
  }
}

/** File values under the process environment: an explicit override wins. */
export function mergeAppEnv(appEnv, processEnv) {
  return { ...appEnv, ...processEnv };
}

/**
 * Translate a child's `exit` `(code, signal)` into this process's exit status.
 *
 * Do not re-raise the signal with `process.kill(process.pid, signal)`: under
 * qemu-user (amd64 image builds on an arm host) a self-directed signal is
 * routinely delivered as SIGSEGV to the wrong process, which takes down the
 * test worker and fails the image build. `128 + signo` is what a shell reports
 * for a signal-killed command, so a cancelled `vite build` is still a failure.
 */
export function exitStatusFromChild(code, signal) {
  if (signal) {
    const signo = osConstants.signals[signal];
    return 128 + (typeof signo === "number" ? signo : 1);
  }
  return code ?? 1;
}

/** The workspace root (this file lives in `<root>/scripts/`). */
export function projectRoot() {
  return dirname(dirname(fileURLToPath(import.meta.url)));
}

/**
 * Whether `moduleUrl` is the script node was asked to run.
 *
 * Both sides are resolved through symlinks: node realpaths `import.meta.url`
 * but leaves `process.argv[1]` as typed, so comparing them raw makes a CLI
 * launched through a symlinked path (`/tmp` on macOS) a silent no-op.
 */
export function isMainModule(moduleUrl) {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return realpathSync(entry) === fileURLToPath(moduleUrl);
  } catch {
    return false;
  }
}

/**
 * Node-based CLIs that npm exposes as `node_modules/.bin/<name>` shims. On
 * Windows those shims are `.cmd` files, which `spawn()` cannot start without a
 * shell (`spawn vite ENOENT`). Running the package's JS entry with this very
 * Node (`process.execPath`) works the same on every platform and needs no shell.
 */
export const NODE_BINS = {
  vite: "vite/bin/vite.js",
  electron: "electron/cli.js",
  "electron-builder": "electron-builder/cli.js",
};

/**
 * How to start `command args…` without depending on PATH shims.
 *
 * - A known Node CLI (see NODE_BINS) found under `<root>/node_modules` runs as
 *   `process.execPath <entry> args…`.
 * - Anything else on Windows goes through the shell so `.cmd`/`.bat` resolve.
 * - Elsewhere the command is spawned directly, as before.
 *
 * @param {string} command
 * @param {string[]} args
 * @param {{ platform?: string, root?: string, execPath?: string, exists?: (p: string) => boolean }} [opts]
 * @returns {{ file: string, args: string[], shell: boolean }}
 */
export function resolveCommand(command, args, opts = {}) {
  const platform = opts.platform ?? process.platform;
  const root = opts.root ?? projectRoot();
  const execPath = opts.execPath ?? process.execPath;
  const exists = opts.exists ?? existsSync;
  const rel = Object.prototype.hasOwnProperty.call(NODE_BINS, command) ? NODE_BINS[command] : "";
  if (rel) {
    const entry = join(root, "node_modules", ...rel.split("/"));
    if (exists(entry)) return { file: execPath, args: [entry, ...args], shell: false };
  }
  if (platform === "win32") return { file: command, args, shell: true };
  return { file: command, args, shell: false };
}

function main(argv) {
  const [command, ...args] = argv;
  if (!command) {
    console.error("usage: node scripts/with-app-env.mjs <command> [args…]");
    process.exit(2);
  }
  const env = mergeAppEnv(readAppEnv(projectRoot()), process.env);
  if (!String(env.LANGAO_DATA_DIR ?? "").trim()) {
    env.LANGAO_DATA_DIR = join(projectRoot(), ".data");
  }
  const run = resolveCommand(command, args);
  const child = spawn(run.file, run.args, { stdio: "inherit", env, shell: run.shell, windowsHide: true });
  // The dev server is long-running and is stopped by signalling this wrapper.
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
    process.on(signal, () => child.kill(signal));
  }
  child.on("error", (err) => {
    console.error(`[with-app-env] failed to run ${command}:`, err?.message || err);
    process.exit(127);
  });
  child.on("exit", (code, signal) => {
    process.exit(exitStatusFromChild(code, signal));
  });
}

if (isMainModule(import.meta.url)) {
  main(process.argv.slice(2));
}
