/** Copy locale assets beside the compiled ESM entry point. */
import { cp, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));

await rm(`${packageRoot}/dist/locales`, { recursive: true, force: true });
await cp(`${packageRoot}/src/locales`, `${packageRoot}/dist/locales`, { recursive: true });
