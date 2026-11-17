// Copies MapLibre's web worker into public/ so the browser can load it.
// Runs automatically after npm install and before dev/build.
import { copyFileSync, mkdirSync } from "node:fs";
mkdirSync("public", { recursive: true });
copyFileSync("node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs", "public/maplibre-gl-worker.js");
