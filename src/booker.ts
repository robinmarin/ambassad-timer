import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import path from "path";
import fs from "fs";
import type { Config } from "./config";
import { hasNoSlotsMessage } from "./detector";
import { notify } from "./notifier";
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

export type BookingResult =
  | { status: "booked"; reference: string; screenshotPath: string }
  | { status: "no_slots" }
  | { status: "error"; message: string };

export async function attemptBooking(config: Config): Promise<BookingResult> {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const screenshotDir = path.resolve(process.cwd(), "screenshots");
  if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir);

  const log = (msg: string) => console.log(`[booker] ${msg}`);

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.setExtraHTTPHeaders({ "Accept-Language": "sv-SE,sv;q=0.9" });

    log("Navigating to booking page...");
    await page.goto(BOOKING_URL, { waitUntil: "networkidle2", timeout: 30000 });
    log(`Landed on: ${page.url()}`);

    await dumpSelects(page, "Initial selects", log);

    // Step 1: Commit embassy (with retry on revert)
    await commitEmbassy(page, log);
    await dumpSelects(page, "After embassy AJAX", log);

    // Step 2: Select appointment type (with retry on revert)
    await selectAppointmentType(page, log);
    await dumpSelects(page, "After appointment type AJAX", log);

    // Step 3: Set antal personer
    // setAntalPersoner expects a 0-based index (Wicket select uses 0=1person, 1=2person, etc.)
    await setAntalPersoner(page, config.booking.numberOfPeople - 1, log);

    // Step 4: Tick checkbox
    await tickCheckbox(page);

    // Debug screenshot before submitting
    const preSubmitPath = path.join(screenshotDir, `debug-pre-submit-${Date.now()}.png`);
    await page.screenshot({ path: preSubmitPath, fullPage: true });
    log(`Pre-submit screenshot: ${preSubmitPath}`);

    // Step 5: Click Fortsätt (with navigation wait)
    log("Clicking Fortsätt...");
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle2", timeout: 20000 }),
      clickFortsatt(page),
    ]);

    const debugPath = path.join(screenshotDir, `debug-after-fortsatt-${Date.now()}.png`);
    await page.screenshot({ path: debugPath, fullPage: true });
    log(`Post-submit screenshot: ${debugPath}`);
    log(`After submit, URL: ${page.url()}`);

    // Step 6: Check calendar
    const slotSelector = await checkCalendar(page, log);
    const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 600));
    log(`Page text preview:\n${bodyText}\n---`);

    if (!slotSelector || await hasNoSlotsMessage(page)) {
      log("No slots available.");
      return { status: "no_slots" };
    }

    // Step 7: Click slot
    log(`Slot found! Clicking: ${slotSelector}`);
    await clickSlot(page, slotSelector, log);

    // Step 8: Pick time slot
    await pickTimeSlot(page, log);

    // Step 9: Fill contact info
    await fillContactInfo(page, config, log);

    // Step 10: Submit
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle2", timeout: 20000 }),
      clickFortsatt(page),
    ]);

    // Capture confirmation
    const screenshotPath = path.join(screenshotDir, `confirmation-${Date.now()}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });

    const pageText = await page.evaluate(() => document.body.innerText);
    const refMatch = pageText.match(/[A-Z0-9]{6,20}/);
    const reference = refMatch ? refMatch[0] : "see screenshot";

    log(`Booked! Reference: ${reference}`);
    await notify(
      config,
      `Ambassad-timer: BOOKED! Ref ${reference}`,
      `Your samordningsnummer appointment has been booked.\n\nReference: ${reference}\n\nFull confirmation attached.`,
      screenshotPath
    );

    await new Promise((r) => setTimeout(r, 5000));

    return { status: "booked", reference, screenshotPath };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[booker] Error: ${message}`);
    return { status: "error", message };
  } finally {
    await browser.close();
  }
}