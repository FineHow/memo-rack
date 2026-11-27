import { spawnSync } from "node:child_process";
import executablePath from "electron";
import { packager } from "@electron/packager";
import { mkdir, cp, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const mac = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const built = spawnSync(
  process.execPath,
  [path.join(mac, "scripts/build.mjs")],
  { stdio: "inherit" },
);
if (built.status !== 0) process.exit(built.status || 1);
const staging = path.join(mac, "dist/package");
await mkdir(staging, { recursive: true });
await cp(path.join(mac, "dist/web"), path.join(staging, "dist/web"), {
  recursive: true,
});
for (const file of ["main.cjs", "preload.cjs"])
  await cp(path.join(mac, "dist", file), path.join(staging, "dist", file));
await writeFile(
  path.join(staging, "package.json"),
  JSON.stringify({
    name: "clothesline-macos",
    productName: "晾一晾",
    version: "0.1.0",
    main: "dist/main.cjs",
  }),
);
const electronPackage = JSON.parse(
  await readFile(path.join(mac, "node_modules/electron/package.json")),
);
// Package from the installed, verified runtime; no second network download.
const runtimeCache = path.join(mac, "dist/electron-cache");
await mkdir(runtimeCache, { recursive: true });
const zip = path.join(
  runtimeCache,
  `electron-v${electronPackage.version}-darwin-arm64.zip`,
);
const runtime = path.resolve(executablePath, "../../../..");
const zipped = spawnSync("/usr/bin/ditto", ["-c", "-k", runtime, zip], {
  stdio: "inherit",
});
if (zipped.status !== 0) process.exit(zipped.status || 1);
const iconset = path.join(mac, "dist/Clothesline.iconset");
await mkdir(iconset, { recursive: true });
for (const size of [16, 32, 128, 256, 512])
  for (const multiplier of [1, 2]) {
    const target = path.join(
      iconset,
      `icon_${size}x${size}${multiplier === 2 ? "@2x" : ""}.png`,
    );
    const converted = spawnSync(
      "/usr/bin/sips",
      [
        "-z",
        String(size * multiplier),
        String(size * multiplier),
        path.join(mac, "../public/brand/app-icon.png"),
        "--out",
        target,
      ],
      { stdio: "ignore" },
    );
    if (converted.status !== 0)
      throw Error("Unable to prepare the existing app icon");
  }
const icon = path.join(mac, "dist/Clothesline.icns");
const iconResult = spawnSync(
  "/usr/bin/iconutil",
  ["-c", "icns", iconset, "-o", icon],
  { stdio: "inherit" },
);
if (iconResult.status !== 0) throw Error("Unable to build macOS icon");
const results = await packager({
  dir: staging,
  name: "晾一晾",
  icon,
  platform: "darwin",
  arch: "arm64",
  electronVersion: electronPackage.version,
  electronZipDir: runtimeCache,
  out: path.join(mac, "release"),
  overwrite: true,
  asar: true,
  asarIntegrityDigest: false,
  appBundleId: "studio.pixelinfinity.clothesline.prototype",
  appVersion: "0.1.0",
  darwinDarkModeSupport: true,
  prune: false,
});
console.log(results.join("\n"));
