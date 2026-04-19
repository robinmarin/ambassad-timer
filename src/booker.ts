import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import path from "path";
import fs from "fs";
import type { Config } from "./config";
import { detectAvailableSlot, hasNoSlotsMessage } from "./detector";
import { notify } from "./notifier";

puppeteer.use(StealthPlugin());

const BOOKING_URL =
  "https://www.migrationsverket.se/ansokanbokning/valjtyp?0&enhet=U0586&sprak=sv&callback=https://www.swedenabroad.se";

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

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.setExtraHTTPHeaders({ "Accept-Language": "sv-SE,sv;q=0.9" });

    console.log("[booker] Navigating to booking page...");
    await page.goto(BOOKING_URL, { waitUntil: "networkidle2", timeout: 30000 });

    // Step 1: Select appointment type — samordningsnummer
    await page.waitForSelector("select", { timeout: 10000 });
    await page.select(
      "select",
      // The option value may be numeric; we find it by visible text
      await page.evaluate(() => {
        const opts = Array.from(document.querySelectorAll("option"));
        const match = opts.find((o) =>
          o.textContent?.toLowerCase().includes("samordningsnummer")
        );
        return match?.value ?? "";
      })
    );

    // Step 2: Tick the confirmation checkbox
    const checkbox = await page.$("input[type='checkbox']");
    if (checkbox) {
      const checked = await page.evaluate((el) => (el as HTMLInputElement).checked, checkbox);
      if (!checked) await checkbox.click();
    }

    // Step 3: Click Next / Submit
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle2", timeout: 20000 }),
      page.click("input[type='submit'], button[type='submit']"),
    ]);

    // Step 4: Check calendar for available slots
    if (await hasNoSlotsMessage(page)) {
      console.log("[booker] No slots available on calendar page.");
      return { status: "no_slots" };
    }

    const slotSelector = await detectAvailableSlot(page);
    if (!slotSelector) {
      console.log("[booker] Calendar loaded but no clickable slots found.");
      return { status: "no_slots" };
    }

    console.log(`[booker] Slot found! Clicking: ${slotSelector}`);
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle2", timeout: 20000 }),
      page.click(slotSelector),
    ]);

    // Step 5: Pick first available time
    await page.waitForSelector("input[type='radio'], a[href*='wicket']", {
      timeout: 10000,
    });
    const timeSlot = await page.$("input[type='radio']");
    if (timeSlot) {
      await timeSlot.click();
    } else {
      // Fallback: click first time link
      await page.click("a[href*='wicket']");
    }
    await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 20000 });

    // Step 6: Fill personal details
    await fillPersonalDetails(page, config);

    // Step 7: Submit
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle2", timeout: 20000 }),
      page.click("input[type='submit'], button[type='submit']"),
    ]);

    // Step 8: Capture confirmation
    const screenshotPath = path.join(
      screenshotDir,
      `confirmation-${Date.now()}.png`
    );
    await page.screenshot({ path: screenshotPath, fullPage: true });

    const pageText = await page.evaluate(() => document.body.innerText);
    const refMatch = pageText.match(/[A-Z0-9]{6,20}/);
    const reference = refMatch ? refMatch[0] : "see screenshot";

    console.log(`[booker] Booked! Reference: ${reference}`);
    await notify(
      config,
      `Ambassad-timer: BOOKED! Ref ${reference}`,
      `Your samordningsnummer appointment has been booked.\n\nReference: ${reference}\n\nFull confirmation attached.`,
      screenshotPath
    );

    // Keep browser open briefly so you can verify if running headed
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

async function fillPersonalDetails(
  page: ReturnType<typeof puppeteer.launch> extends Promise<infer B>
    ? Awaited<B> extends { newPage(): Promise<infer P> }
      ? P
      : never
    : never,
  config: Config
): Promise<void> {
  const fill = async (selector: string, value: string) => {
    const el = await page.$(selector);
    if (el) {
      await el.click({ clickCount: 3 });
      await el.type(value, { delay: 40 });
    }
  };

  // These selectors are best-guesses; they'll need tuning against the live form.
  await fill("input[name*='firstName'], input[id*='firstName']", config.personal.firstName);
  await fill("input[name*='lastName'], input[id*='lastName']", config.personal.lastName);
  await fill("input[name*='personnummer'], input[id*='personnr']", config.personal.personnummer);
  await fill("input[type='email'], input[name*='email']", config.personal.email);
  await fill("input[type='tel'], input[name*='phone'], input[name*='telefon']", config.personal.phone);
}
