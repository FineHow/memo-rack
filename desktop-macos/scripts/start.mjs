import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import electron from "electron";
const mac = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
if (!existsSync(path.join(mac, "dist/web/widget.html"))) {
  console.error("请先运行 npm run mac:build");
  process.exit(1);
}
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(electron, [mac, ...process.argv.slice(2)], {
  cwd: mac,
  env,
  stdio: "inherit",
});
child.on("exit", (code) => process.exit(code ?? 0));
