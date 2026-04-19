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
  const result = await page.evaluate(() => {
    const query =
      "td.wicket-datepicker-day:not(.wicket-datepicker-disabled) a, " +
      "td[class*='day']:not([class*='disabled']) a, " +
      "td.available a, " +
      "td:not(.disabled):not(.empty) a[href*='wicket']";
    const candidates = Array.from(document.querySelectorAll(query));
    const debugInfo = {
      count: candidates.length,
      firstHtml: candidates[0]?.outerHTML ?? null,
    };
    if (candidates.length === 0) return { selector: null, debugInfo };
    const el = candidates[0] as HTMLElement;
    let selector: string | null = null;
    if (el.id) selector = `#${el.id}`;
    else {
      const text = el.textContent?.trim();
      if (text) selector = `a[href*='wicket']:has-text("${text}")`;
    }
    return { selector, debugInfo };
  });

  console.log(
    `[detector] Calendar scan: ${result.debugInfo.count} candidate(s) found`
  );
  if (result.debugInfo.firstHtml) {
    console.log(`[detector] First candidate: ${result.debugInfo.firstHtml}`);
  }

  return result.selector;
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
