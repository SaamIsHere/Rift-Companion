import { spawn } from "node:child_process";
import * as os from "node:os";
import * as path from "node:path";

const targetDir = process.env.CARGO_TARGET_DIR || path.join(os.homedir(), ".cargo_target_rift");
process.env.CARGO_TARGET_DIR = targetDir;

const tauriCmd = process.platform === "win32" ? "npx.cmd" : "npx";
const child = spawn(tauriCmd, ["tauri", "build", ...process.argv.slice(2)], {
  stdio: "inherit",
  shell: true,
  env: process.env,
});

child.on("exit", (code: number | null) => {
  process.exit(code ?? 0);
});
