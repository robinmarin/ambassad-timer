import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import type { Page } from "puppeteer";
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

/**
 * Set a <select> value and trigger Wicket's AJAX behaviour.
 *
 * Puppeteer's page.select() dispatches change/input events on the
 * element, but Wicket often binds its AJAX behaviours via its own
 * event system (Wicket.Event) or inline onchange attributes.  When
 * Wicket replaces DOM nodes after an AJAX round-trip the listeners
 * set up by Puppeteer may no longer match. This helper:
 *
 *  1. Sets the value directly on the HTMLSelectElement
 *  2. Fires both 'change' and 'input' events (bubbling)
 *  3. If the element has an inline onchange handler, invokes it
 *  4. Falls back to calling any Wicket.Ajax.ajax() call found in
 *     the element's attributes.
 *
 * After triggering we wait for the Wicket AJAX round-trip to settle.
 */
async function wicketSelect(page: Page, selector: string, value: string): Promise<void> {
  await page.evaluate(
    (sel: string, val: string) => {
      const el = document.querySelector(sel) as HTMLSelectElement | null;
      if (!el) throw new Error(`wicketSelect: element not found: ${sel}`);

      // Set the value
      el.value = val;

      // Dispatch native events so any listener picks it up
      el.dispatchEvent(new Event("change", { bubbles: true }));
      el.dispatchEvent(new Event("input", { bubbles: true }));

      // Wicket inline onchange — e.g. onchange="var wcall=wicketAjaxPost(…)"
      if (typeof el.onchange === "function") {
        el.onchange(new Event("change"));
      }
    },
    selector,
    value
  );

  // Wait for the Wicket AJAX round-trip to complete
  await page.waitForNetworkIdle({ timeout: 10000 }).catch(() => {});
  // Extra settle time for Wicket DOM replacement
  await new Promise((r) => setTimeout(r, 500));
}

/**
 * Re-query the DOM for all <select> elements and their options.
 * Call this after every Wicket AJAX round-trip because Wicket may
 * have replaced DOM nodes.
 */
async function dumpSelects(page: Page, label: string) {
  const info = await page.evaluate(() => {
    return Array.from(document.querySelectorAll("select")).map((s) => ({
      id: s.id,
      name: s.name,
      value: s.value,
      options: Array.from(s.options).map((o) => ({
        value: o.value,
        text: o.text.trim(),
        selected: o.selected,
      })),
    }));
  });
  console.log(`[booker] ${label}:`, JSON.stringify(info, null, 2));
  return info;
}

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
    console.log(`[booker] Landed on: ${page.url()}`);

    await dumpSelects(page, "Initial selects");

    // ── Step 1a: Commit embassy selection ──────────────────────────
    // The URL pre-selects London (enhet=U0586) in the HTML, but Wicket's
    // server-side model may still hold a default.  Fire the change event
    // to sync server state — Wicket will AJAX-replace parts of the form.
    await page.waitForSelector("#mottagningsenhet", { timeout: 10000 });
    const embassyValue = await page.$eval(
      "#mottagningsenhet",
      (el) => (el as HTMLSelectElement).value
    );
    console.log(`[booker] Committing embassy: "${embassyValue}"`);
    await wicketSelect(page, "#mottagningsenhet", embassyValue);

    await dumpSelects(page, "After embassy AJAX");

    // ── Step 1b: Select appointment type (samordningsnummer) ──────
    // IMPORTANT: Re-query the DOM *after* embassy AJAX — Wicket may have
    // replaced the appointment type <select> with new options.
    const appointmentInfo = await page.evaluate(() => {
      const selects = Array.from(document.querySelectorAll("select"));
      for (const sel of selects) {
        if (sel.id === "mottagningsenhet") continue; // skip embassy dropdown
        const match = Array.from(sel.options).find((o) =>
          o.textContent?.toLowerCase().includes("samordningsnummer")
        );
        if (match) {
          return { value: match.value, selector: sel.id ? `#${sel.id}` : `select[name="${sel.name}"]` };
        }
      }
      return null;
    });

    if (!appointmentInfo) {
      const html = await page.evaluate(() => document.body.innerHTML.slice(0, 2000));
      console.log(`[booker] Cannot find samordningsnummer option after embassy AJAX. HTML:\n${html}`);
      return { status: "error", message: "samordningsnummer option not found" };
    }

    console.log(`[booker] Selecting appointment type: "${appointmentInfo.value}" via "${appointmentInfo.selector}"`);
    await wicketSelect(page, appointmentInfo.selector, appointmentInfo.value);

    await dumpSelects(page, "After appointment type AJAX");

    // Verify the selection stuck
    const appointmentStuck = await page.evaluate((sel: string, val: string) => {
      const el = document.querySelector(sel) as HTMLSelectElement | null;
      return el?.value === val;
    }, appointmentInfo.selector, appointmentInfo.value);
    console.log(`[booker] Appointment type selection stuck: ${appointmentStuck}`);

    // ── Step 1c: Set antal personer (number of people) ────────────
    // This field appears via AJAX after selecting the appointment type.
    // It may be a <select> or an <input>.
    const antalSet = await page.evaluate((n: number) => {
      // Try select first
      const selects = Array.from(document.querySelectorAll("select"));
      for (const sel of selects) {
        if (sel.id === "mottagningsenhet") continue;
        const hasAntal = sel.id?.toLowerCase().includes("antal") ||
          sel.name?.toLowerCase().includes("antal") ||
          sel.closest("div, label, span")?.textContent?.toLowerCase().includes("antal");
        if (hasAntal) {
          sel.value = String(n);
          sel.dispatchEvent(new Event("change", { bubbles: true }));
          if (typeof sel.onchange === "function") sel.onchange(new Event("change"));
          return { type: "select", id: sel.id, value: sel.value };
        }
      }
      // Try input
      const inputs = Array.from(document.querySelectorAll("input"));
      for (const inp of inputs) {
        const hasAntal = inp.id?.toLowerCase().includes("antal") ||
          inp.name?.toLowerCase().includes("antal") ||
          inp.closest("div, label, span")?.textContent?.toLowerCase().includes("antal");
        if (hasAntal && (inp.type === "number" || inp.type === "text")) {
          inp.value = String(n);
          inp.dispatchEvent(new Event("change", { bubbles: true }));
          inp.dispatchEvent(new Event("input", { bubbles: true }));
          return { type: "input", id: inp.id, value: inp.value };
        }
      }
      return null;
    }, config.booking.numberOfPeople);

    if (antalSet) {
      console.log(`[booker] Set antal personer: ${JSON.stringify(antalSet)}`);
      await page.waitForNetworkIdle({ timeout: 5000 }).catch(() => {});
    } else {
      console.log("[booker] No antal personer field found — may not be required");
    }

    // ── Step 2: Tick confirmation checkbox ─────────────────────────
    const checkboxTicked = await page.evaluate(() => {
      const cb = document.querySelector("input[type='checkbox']") as HTMLInputElement | null;
      if (!cb) return null;
      if (!cb.checked) {
        cb.checked = true;
        cb.dispatchEvent(new Event("change", { bubbles: true }));
        cb.dispatchEvent(new Event("click", { bubbles: true }));
      }
      return cb.checked;
    });
    console.log(`[booker] Checkbox: ${checkboxTicked === null ? "not found" : checkboxTicked}`);

    // Debug screenshot before submitting
    const preSubmitPath = path.join(screenshotDir, `debug-pre-submit-${Date.now()}.png`);
    await page.screenshot({ path: preSubmitPath, fullPage: true });
    console.log(`[booker] Pre-submit screenshot: ${preSubmitPath}`);

    // ── Step 3: Submit the form ───────────────────────────────────
    // Find the submit button/link and click it.  Wicket forms often
    // use a plain <input type="submit"> but may also use <button> or <a>.
    console.log("[booker] Clicking Fortsätt...");

    // Try to submit via Wicket's form submission mechanism directly
    const submitted = await page.evaluate(() => {
      // First try: find submit button and click it natively
      const btn = document.querySelector(
        "input[type='submit'], button[type='submit'], input[value*='ortsätt']"
      ) as HTMLElement | null;
      if (btn) {
        btn.click();
        return "clicked-button";
      }
      // Second try: submit the form directly
      const form = document.querySelector("form") as HTMLFormElement | null;
      if (form) {
        form.submit();
        return "form-submit";
      }
      return null;
    });

    if (!submitted) {
      const html = await page.evaluate(() => document.body.innerHTML.slice(0, 1500));
      console.log(`[booker] Could not submit form. HTML:\n${html}`);
      return { status: "error", message: "Submit mechanism not found" };
    }
    console.log(`[booker] Form submitted via: ${submitted}`);

    // Wait for navigation or AJAX response
    await page.waitForNetworkIdle({ timeout: 20000, idleTime: 1500 });
    console.log(`[booker] After submit, URL: ${page.url()}`);

    // Debug: take a screenshot to see what page we landed on
    const debugPath = path.join(screenshotDir, `debug-after-fortsatt-${Date.now()}.png`);
    await page.screenshot({ path: debugPath, fullPage: true });
    console.log(`[booker] Post-submit screenshot: ${debugPath}`);

    // ── Step 4: Check calendar for available slots ────────────────
    const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 600));
    console.log(`[booker] Page text preview:\n${bodyText}\n---`);
    if (await hasNoSlotsMessage(page)) {
      console.log("[booker] No slots available on calendar page.");
      return { status: "no_slots" };
    }

    const slotSelector = await detectAvailableSlot(page);
    if (!slotSelector) {
      console.log("[booker] Calendar loaded but no clickable slots found.");
      return { status: "no_slots" };
    }

    console.log(`[booker] Slot found! Clicking selector: ${slotSelector}`);
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
