// Test-only resolver: lets `node --experimental-strip-types --test` load app
// modules that use the `@/` alias and extensionless relative imports, the way
// Vite does in the app. Not used by the app or the build.
import { existsSync, statSync } from "node:fs";
import { dirname, join, resolve as resolvePath } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { registerHooks } from "node:module";

const root = resolvePath(dirname(fileURLToPath(import.meta.url)), "..");
const EXT = [".ts", ".tsx", ".mjs", ".js"];

function withExtension(path) {
  if (existsSync(path) && statSync(path).isFile()) return path;
  for (const ext of EXT) if (existsSync(path + ext)) return path + ext;
  for (const ext of EXT) if (existsSync(join(path, `index${ext}`))) return join(path, `index${ext}`);
  return null;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      const hit = withExtension(join(root, "src", specifier.slice(2)));
      if (hit) return { url: pathToFileURL(hit).href, shortCircuit: true };
    }
    if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL?.startsWith("file:")) {
      const base = dirname(fileURLToPath(context.parentURL));
      const hit = withExtension(resolvePath(base, specifier));
      if (hit) return { url: pathToFileURL(hit).href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});
