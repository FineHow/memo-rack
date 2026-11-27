import { build } from "esbuild";
import { spawnSync } from "node:child_process";
import { mkdir, cp } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const project = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const mac = path.join(project, "desktop-macos");
if (!process.argv.includes("--host-only")) {
  const result = spawnSync(
    process.execPath,
    ["node_modules/next/dist/bin/next", "build", "--webpack"],
    { cwd: project, stdio: "inherit" },
  );
  if (result.status !== 0) process.exit(result.status || 1);
  await cp(path.join(project, "out"), path.join(mac, "dist/web"), {
    recursive: true,
  });
  for (const name of [
    "react",
    "react-dom",
    "scheduler",
    "next",
    "lucide-react",
  ]) {
    const file = name === "next" ? "license.md" : "LICENSE";
    await cp(
      path.join(project, "node_modules", name, file),
      path.join(mac, "dist/web/licenses", name + "-LICENSE.txt"),
    );
  }
}
await mkdir(path.join(mac, "dist"), { recursive: true });
for (const entry of ["main", "preload", "core", "pursuit"])
  await build({
    entryPoints: [path.join(mac, `src/${entry}.ts`)],
    outfile: path.join(mac, `dist/${entry}.cjs`),
    bundle: true,
    platform: "node",
    target: "node22",
    format: "cjs",
    external: ["electron"],
    tsconfig: path.join(project, "tsconfig.json"),
    sourcemap: true,
  });
console.log("macOS host built.");
