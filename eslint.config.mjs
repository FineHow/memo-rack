import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypeScript,
  globalIgnores([
    ".next/**",
    "node_modules/**",
    "out/**",
    "desktop/dist/**",
    "desktop/dist-*/**",
    "desktop/test-data/**",
    "releases/**",
    "outputs/**",
    "public/ort/**",
    "desktop-macos/dist/**",
    "desktop-macos/release/**",
    "desktop-macos/test-results/**",
  ]),
]);
