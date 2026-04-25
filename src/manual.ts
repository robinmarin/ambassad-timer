import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import path from "path";
import fs from "fs";
import readline from "readline";
import { loadConfig } from "./config";
import {
  BOOKING_URL,
  wicketSelect,
  dumpSelects,
  commitEmbassy,
  selectAppointmentType,
  setAntalPersoner,
  tickCheckbox,
  clickFortsatt,
  checkCalendar,
  clickSlot,
  pickTimeSlot,
  fillContactInfo,
} from "./steps";

puppeteer.use(StealthPlugin());

function screenshotPath(step: string): string {
  const screenshotDir = path.resolve(process.cwd(), "screenshots");
  if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir);
  return path.join(screenshotDir, `manual-step${step}-${Date.now()}.png`);
}

function prompt(question: string): Promise<void> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, () => {
      rl.close();
      resolve();
    });
  });
}

async function main() {
  const config = loadConfig();
  const browser = await puppeteer.launch({ headless: false, args: ["--no-sandbox"] });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  await page.setExtraHTTPHeaders({ "Accept-Language": "sv-SE,sv;q=0.9" });

  const log = (msg: string) => console.log(`[manual] ${msg}`);
  const screenshot = (step: string) => page.screenshot({ path: screenshotPath(step), fullPage: true });

  console.log("[manual] Starting manual booking flow...");

  // Step 1: Navigate
  await page.goto(BOOKING_URL, { waitUntil: "networkidle2", timeout: 30000 });
  await dumpSelects(page, "Initial selects", log);
  await screenshot("1-initial");
  log("Step 1/10: Navigated.");
  await prompt("Step 1/10 done. Press Enter to commit embassy...\n");

  // Step 2: Commit embassy
  await commitEmbassy(page, log);
  await dumpSelects(page, "After embassy AJAX", log);
  await screenshot("2-embassy");
  log("Step 2/10: Embassy committed.");
  await prompt("Step 2/10 done. Press Enter to select appointment type...\n");

  // Step 3: Select appointment type
  await selectAppointmentType(page, log);
  await dumpSelects(page, "After appointment type AJAX", log);
  await screenshot("3-appointment-type");
  log("Step 3/10: Appointment type selected.");
  await prompt("Step 3/10 done. Press Enter to set antal personer...\n");

  // Step 4: Set antal personer (0-based: n-1 for human-readable count)
  await setAntalPersoner(page, config.booking.numberOfPeople - 1, log);
  await screenshot("4-antal");
  log("Step 4/10: Antal personer set.");
  await prompt("Step 4/10 done. Press Enter to tick checkbox...\n");

  // Step 5: Tick checkbox
  await tickCheckbox(page);
  await screenshot("5-checkbox");
  log("Step 5/10: Checkbox ticked.");
  await prompt("Step 5/10 done. Press Enter to click Fortsätt...\n");

  // Step 6: Click Fortsätt
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle2", timeout: 20000 }),
    clickFortsatt(page) as Promise<unknown>,
  ]);
  await screenshot("6-fortsatt");
  log(`Step 6/10: URL after submit: ${page.url()}`);

  // Step 7: Calendar check
  const slotSelector = await checkCalendar(page, log);
  await screenshot("7-calendar");
  log("Step 7/10: Calendar check complete.");
  await prompt("Step 7/10 done. Press Enter to click slot...\n");

  // Step 8: Click slot (skip if none found — still test contact form fill)
  if (!slotSelector) {
    log("Step 8/10: No slot available — skipping slot click and time pick. Proceeding to contact info for testing.");
  } else {
    await clickSlot(page, slotSelector, log);
    await screenshot("8-slot-clicked");
    log("Step 8/10: Slot clicked.");
    await prompt("Step 8/10 done. Press Enter to pick time...\n");

    // Step 9: Pick time slot
    await pickTimeSlot(page, log);
    await screenshot("9-time-picked");
    log("Step 9/10: Time slot picked.");
    await prompt("Step 9/10 done. Press Enter to fill contact info...\n");
  }

  // Step 10: Fill contact info
  await fillContactInfo(page, config, log);
  await screenshot("10-contact-filled");
  log("Step 10/10: Contact info filled.");
  await prompt("Step 10/10 done. Review the form and press Enter to close browser...\n");

  await browser.close();
  log("Done. Browser closed.");
}

main().catch((err) => {
  console.error("[manual] Error:", err);
  process.exit(1);
});