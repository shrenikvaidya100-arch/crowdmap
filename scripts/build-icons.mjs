// Writes every icon in src/components/icons/icon-data.ts to public/icons/svg/<name>.svg,
// plus an index.html preview sheet. Run: node scripts/build-icons.mjs
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { ICONS } from "../src/components/icons/icon-data.ts";

const out = new URL("../public/icons/svg/", import.meta.url);
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const wrap = (inner) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>\n`;
for (const [name, inner] of Object.entries(ICONS)) writeFileSync(new URL(`${name}.svg`, out), wrap(inner));
const cells = Object.entries(ICONS).map(([n, inner]) => `<figure>${wrap(inner)}<figcaption>${n}</figcaption></figure>`).join("");
writeFileSync(new URL("index.html", out), `<!doctype html><meta charset="utf-8"><title>CrowdMap icons</title>
<style>body{font:13px system-ui;margin:24px;background:#0b1220;color:#dbeafe}main{display:grid;grid-template-columns:repeat(auto-fill,minmax(112px,1fr));gap:12px}
figure{margin:0;padding:16px 8px;border:1px solid #1e3a5f;border-radius:10px;text-align:center}svg{width:32px;height:32px;color:#60a5fa}figcaption{margin-top:8px;color:#94a3b8}</style>
<h1>CrowdMap icons (${Object.keys(ICONS).length})</h1><main>${cells}</main>\n`);
console.log(`Wrote ${Object.keys(ICONS).length} icons to public/icons/svg/`);
