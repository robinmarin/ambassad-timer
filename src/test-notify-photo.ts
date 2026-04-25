import fs from "fs";
import path from "path";
import { loadConfig } from "./config";
import { notify } from "./notifier";

// Minimal valid 1×1 PNG — just enough to test the sendPhoto path
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64"
);

async function main() {
  const config = loadConfig();
  const tmpPath = path.resolve(process.cwd(), "screenshots", `test-photo-${Date.now()}.png`);

  const screenshotDir = path.dirname(tmpPath);
  if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir);
  fs.writeFileSync(tmpPath, TINY_PNG);

  console.log("[test-notify-photo] Sending test photo to Telegram...");
  try {
    await notify(config, "Ambassad-timer: test photo", "Photo send path is working.", tmpPath);
    console.log("[test-notify-photo] Done.");
  } finally {
    fs.unlinkSync(tmpPath);
  }
}

main().catch((err) => {
  console.error("[test-notify-photo] Error:", err);
  process.exit(1);
});
