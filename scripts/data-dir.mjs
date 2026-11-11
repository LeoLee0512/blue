/**
 * Where 蓝稿 keeps its database and the per-install encryption secret.
 *
 * Packaged app: Electron sets LANGAO_DATA_DIR to %APPDATA%/蓝稿 (Windows)
 * before the server starts. Dev (`npm run dev`) points it at `<repo>/.data`.
 * A direct server start with no env uses the platform data directory.
 */
import os from "node:os";
import path from "node:path";

export const INSTALL_SECRET_FILE = "install-secret";

/**
 * @param {NodeJS.ProcessEnv} env
 * @param {NodeJS.Platform} platform
 * @param {string} home
 */
export function dataDirFrom(env, platform, home) {
  const fromEnv = env.LANGAO_DATA_DIR?.trim();
  if (fromEnv) return fromEnv;
  if (platform === "win32") {
    const base = env.APPDATA?.trim() || path.win32.join(home, "AppData", "Roaming");
    return path.win32.join(base, "蓝稿");
  }
  if (platform === "darwin") {
    return path.join(home, "Library", "Application Support", "蓝稿");
  }
  const xdg = env.XDG_DATA_HOME?.trim() || path.join(home, ".local", "share");
  return path.join(xdg, "蓝稿");
}

export function dataDir() {
  return dataDirFrom(process.env, process.platform, os.homedir());
}

export function pgliteDir() {
  return path.join(dataDir(), "pglite");
}

export function installSecretPath() {
  return path.join(dataDir(), INSTALL_SECRET_FILE);
}
