#!/usr/bin/env node
/**
 * Nitro bundles PGLite's JS but loads the wasm next to that file at runtime.
 * Copy the three artifacts into the server output after `vite build`.
 */
import { copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const from = join(root, "node_modules/@electric-sql/pglite/dist");
const to = join(root, ".output/server/_libs");
for (const name of ["pglite.wasm", "pglite.data", "initdb.wasm"]) {
  copyFileSync(join(from, name), join(to, name));
  console.log(`[pglite] staged ${name}`);
}
