import cron from "node-cron";
import type { Config } from "./config";
import { attemptBooking } from "./booker";

let running = false;

/**
 * Returns true if we are currently in the Wednesday sniper window.
 * Day-of-week: 0=Sun, 1=Mon, ..., 3=Wed
 */
function inSniperWindow(config: Config): boolean {
  const now = new Date();
  const day = now.getDay();
  const hour = now.getHours();
  return (
    day === config.polling.sniperDayOfWeek &&
    hour >= config.polling.sniperWindowStartHour &&
    hour < config.polling.sniperWindowEndHour
  );
}

/** Returns true during overnight hours when nothing is ever released. */
function isNightTime(): boolean {
  const hour = new Date().getHours();
  return hour >= 23 || hour < 7;
}

/** Adds ±20% jitter to a millisecond interval. */
function jitter(ms: number): number {
  return ms * (0.8 + Math.random() * 0.4);
}

async function poll(config: Config): Promise<boolean> {
  if (running) return false;
  running = true;
  console.log(`[scheduler] Polling at ${new Date().toISOString()}`);
  try {
    const result = await attemptBooking(config);
    if (result.status === "booked") {
      console.log(`[scheduler] SUCCESS — reference: ${result.reference}`);
      return true;
    }
    if (result.status === "error") {
      console.warn(`[scheduler] Attempt error: ${result.message}`);
    }
    return false;
  } finally {
    running = false;
  }
}

export function startScheduler(config: Config): void {
  console.log("[scheduler] Started. Slots release every Wednesday ~10am UK time.");

  // Every minute, decide whether to fire a poll based on current timing mode.
  // This avoids managing multiple cron jobs and lets us adjust dynamically.
  let nextPollAt = Date.now();

  cron.schedule("* * * * *", async () => {
    const now = new Date();
    const waitSec = Math.round((nextPollAt - Date.now()) / 1000);

    if (Date.now() < nextPollAt) {
      console.log(
        `[scheduler] tick ${now.toISOString()} — waiting ${waitSec}s until next poll`
      );
      return;
    }

    if (isNightTime()) {
      nextPollAt = Date.now() + jitter(30 * 60 * 1000); // check again in ~30min
      console.log(
        `[scheduler] ${now.toISOString()} — night time, next check in ~30min`
      );
      return;
    }

    const mode = inSniperWindow(config) ? "SNIPER" : "normal";
    console.log(`[scheduler] [${mode}] ${now.toISOString()} — firing poll`);

    const booked = await poll(config);
    if (booked) {
      console.log("[scheduler] Booking secured — shutting down.");
      process.exit(0);
    }

    const intervalMs = inSniperWindow(config)
      ? config.polling.sniperIntervalSec * 1000
      : config.polling.normalIntervalMin * 60 * 1000;

    nextPollAt = Date.now() + jitter(intervalMs);

    console.log(
      `[scheduler] [${mode}] Next poll in ${Math.round((nextPollAt - Date.now()) / 1000)}s`
    );
  });
}
