// The page shows which build it is (in the menu), so you can tell at a glance whether the browser has the latest.
import { defineConfig } from "vite";
import { execSync } from "node:child_process";

const git = (cmd: string): string => {
  try { return execSync(cmd, { encoding: "utf8" }).trim(); } catch { return "unknown"; }
};
export default defineConfig({
  define: { __BUILD__: JSON.stringify(`${git("git rev-parse --short HEAD")} ${git("git log -1 --format=%cd --date=format:%m-%d_%H:%M")}`) },
});
