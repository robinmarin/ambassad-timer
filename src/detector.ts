import type { Page } from "puppeteer";

/**
 * Checks the calendar page for any available (non-disabled) date.
 * Returns the selector of the first available date cell, or null if none found.
 */
export async function detectAvailableSlot(
  page: Page
): Promise<string | null> {
  // Wicket renders the calendar as a table; available dates are clickable links,
  // disabled dates are plain text or have a "disabled" class.
  // We look for any <a> or <td> that is NOT marked disabled and contains a date number.
  const selector = await page.evaluate(() => {
    // Try common patterns used by the Migrationsverket Wicket calendar
    const candidates = Array.from(
      document.querySelectorAll(
        "td.wicket-datepicker-day:not(.wicket-datepicker-disabled) a, " +
        "td[class*='day']:not([class*='disabled']) a, " +
        "td.available a, " +
        "td:not(.disabled):not(.empty) a[href*='wicket']"
      )
    );
    if (candidates.length === 0) return null;
    const el = candidates[0] as HTMLElement;
    // Build a unique enough selector using the element's id or text
    if (el.id) return `#${el.id}`;
    const text = el.textContent?.trim();
    if (text) return `a[href*='wicket']:has-text("${text}")`;
    return null;
  });

  return selector;
}

/**
 * Returns true if the page contains a "no available appointments" message.
 */
export async function hasNoSlotsMessage(page: Page): Promise<boolean> {
  const text = await page.evaluate(() => document.body.innerText.toLowerCase());
  return (
    text.includes("inga lediga tider") ||
    text.includes("no available") ||
    text.includes("fully booked") ||
    text.includes("inga tider")
  );
}
