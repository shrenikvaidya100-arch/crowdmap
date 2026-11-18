import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Components copied from Motion Primitives and KokonutUI: kept close to the
  // originals, so a few of our stricter React rules don't apply there.
  {
    files: ["src/components/core/**"],
    rules: {
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/exhaustive-deps": "off",
      "react-hooks/refs": "off",
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Copied from node_modules at install time (scripts/copy-map-worker.mjs).
    "public/maplibre-gl-worker.js",
  ]),
]);

export default eslintConfig;
