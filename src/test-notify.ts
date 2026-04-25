import { loadConfig } from "./config";
import { notify } from "./notifier";

async function main() {
  const config = loadConfig();
  console.log("[test-notify] Sending test Telegram message...");
  await notify(
    config,
    "Ambassad-timer: test notification",
    "If you're reading this, Telegram notifications are working correctly."
  );
  console.log("[test-notify] Done.");
}

main().catch((err) => {
  console.error("[test-notify] Error:", err);
  process.exit(1);
});
