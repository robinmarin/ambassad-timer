import type { Page } from "puppeteer";
import type { Config } from "./config";
import { detectAvailableSlot } from "./detector";

export const BOOKING_URL =
  "https://www.migrationsverket.se/ansokanbokning/valjtyp?0&enhet=U0586&sprak=sv&callback=https://www.swedenabroad.se";

type LogFn = (msg: string) => void;

const defaultLog: LogFn = (msg) => console.log(msg);

export async function wicketSelect(page: Page, selector: string, value: string): Promise<void> {
  await page.evaluate(
    (sel: string, val: string) => {
      const el = document.querySelector(sel) as HTMLSelectElement | null;
      if (!el) throw new Error(`wicketSelect: element not found: ${sel}`);
      el.value = val;
      el.dispatchEvent(new Event("change", { bubbles: true }));
      el.dispatchEvent(new Event("input", { bubbles: true }));
      if (typeof el.onchange === "function") {
        el.onchange(new Event("change"));
      }
    },
    selector,
    value
  );
  await page.waitForNetworkIdle({ timeout: 10000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 500));
}

export async function dumpSelects(page: Page, label: string, log: LogFn = defaultLog): Promise<void> {
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
  log(`[steps] ${label}: ${JSON.stringify(info, null, 2)}`);
}

export async function tickCheckbox(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const cb = document.querySelector("input[type='checkbox']") as HTMLInputElement | null;
    if (!cb) return false;
    if (!cb.checked) {
      cb.checked = true;
      cb.dispatchEvent(new Event("change", { bubbles: true }));
      cb.dispatchEvent(new Event("click", { bubbles: true }));
    }
    return cb.checked;
  });
}

export async function clickFortsatt(page: Page): Promise<"clicked-button" | "form-submit" | null> {
  return page.evaluate(() => {
    const btn = document.querySelector(
      "input[type='submit'], button[type='submit'], input[value*='ortsätt']"
    ) as HTMLElement | null;
    if (btn) {
      btn.click();
      return "clicked-button";
    }
    const form = document.querySelector("form") as HTMLFormElement | null;
    if (form) {
      form.submit();
      return "form-submit";
    }
    return null;
  });
}

export async function setAntalPersoner(page: Page, numberOfPeople: number, log: LogFn = defaultLog): Promise<void> {
  const debugInfo = await page.evaluate(() => {
    const selects = Array.from(document.querySelectorAll("select"));
    for (const sel of selects) {
      const hasAntal =
        sel.id?.toLowerCase().includes("antal") ||
        sel.name?.toLowerCase().includes("antal") ||
        sel.closest("div, label, span")?.textContent?.toLowerCase().includes("antal");
      if (hasAntal) {
        return Array.from(sel.options).map((o) => ({ value: o.value, text: o.text.trim(), selected: o.selected }));
      }
    }
    return null;
  });
  log(`[steps] antalpersoner options: ${JSON.stringify(debugInfo)}`);

  const result = await page.evaluate((n: number) => {
    const selects = Array.from(document.querySelectorAll("select"));
    for (const sel of selects) {
      if (sel.id === "mottagningsenhet") continue;
      const hasAntal =
        sel.id?.toLowerCase().includes("antal") ||
        sel.name?.toLowerCase().includes("antal") ||
        sel.closest("div, label, span")?.textContent?.toLowerCase().includes("antal");
      if (hasAntal) {
        sel.value = String(n);
        sel.dispatchEvent(new Event("change", { bubbles: true }));
        if (typeof sel.onchange === "function") sel.onchange(new Event("change"));
        return { type: "select", id: sel.id, value: sel.value };
      }
    }
    const inputs = Array.from(document.querySelectorAll("input"));
    for (const inp of inputs) {
      const hasAntal =
        inp.id?.toLowerCase().includes("antal") ||
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
  }, numberOfPeople);

  if (result) {
    log(`[steps] Set antal personer: ${JSON.stringify(result)}`);
    await page.waitForNetworkIdle({ timeout: 5000 }).catch(() => {});
  } else {
    log("[steps] No antal personer field found");
  }
}

export async function commitEmbassy(page: Page, log: LogFn = defaultLog): Promise<string> {
  await page.waitForSelector("#mottagningsenhet", { timeout: 10000 });
  let embassyValue = await page.$eval("#mottagningsenhet", (el) => (el as HTMLSelectElement).value);
  log(`[steps] Committing embassy: "${embassyValue}"`);
  await wicketSelect(page, "#mottagningsenhet", embassyValue);

  const afterAjaxValue = await page.$eval("#mottagningsenhet", (el) => (el as HTMLSelectElement).value);
  if (afterAjaxValue !== embassyValue) {
    log(`[steps] Embassy selection reverted to "${afterAjaxValue}" — retrying once...`);
    await new Promise((r) => setTimeout(r, 1000));
    await wicketSelect(page, "#mottagningsenhet", embassyValue);
    const afterRetryValue = await page.$eval("#mottagningsenhet", (el) => (el as HTMLSelectElement).value);
    if (afterRetryValue !== embassyValue) {
      log(`[steps] Embassy still reverted to "${afterRetryValue}" — accepting and continuing.`);
    }
    return afterRetryValue;
  }

  return embassyValue;
}

export async function selectAppointmentType(page: Page, log: LogFn = defaultLog): Promise<{ value: string; selector: string }> {
  const appointmentInfo = await page.evaluate(() => {
    const selects = Array.from(document.querySelectorAll("select"));
    for (const sel of selects) {
      if (sel.id === "mottagningsenhet") continue;
      const match = Array.from(sel.options).find((o) =>
        o.textContent?.toLowerCase().includes("samordningsnummer")
      );
      if (match) {
        return { value: match.value, selector: sel.id ? `#${sel.id}` : `select[name="${sel.name}"]` };
      }
    }
    return null;
  });

  if (!appointmentInfo) throw new Error("samordningsnummer option not found");
  log(`[steps] Selecting appointment type: "${appointmentInfo.value}"`);

  await page.select(appointmentInfo.selector, appointmentInfo.value);
  await page.waitForNetworkIdle({ timeout: 10000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 800));

  const afterTypeValue = await page.$eval(appointmentInfo.selector, (el) => (el as HTMLSelectElement).value);
  if (afterTypeValue !== appointmentInfo.value) {
    log(`[steps] Appointment type reverted to "${afterTypeValue}" — retrying with wicketSelect...`);
    await new Promise((r) => setTimeout(r, 1000));
    await wicketSelect(page, appointmentInfo.selector, appointmentInfo.value);
  }

  return appointmentInfo;
}

export async function checkCalendar(page: Page, log: LogFn = defaultLog): Promise<string | null> {
  if (!page.url().includes("kalender") && !page.url().includes("bokning")) {
    log(`[steps] Did not navigate to calendar page. Current URL: ${page.url()}`);
    return null;
  }

  const slotSelector = await detectAvailableSlot(page);
  if (slotSelector) {
    log(`[steps] Slots found! Selector: ${slotSelector}`);
  } else {
    log("[steps] No available slots detected.");
  }
  return slotSelector;
}

export async function clickSlot(page: Page, slotSelector: string, log: LogFn = defaultLog): Promise<void> {
  log(`[steps] Clicking slot: ${slotSelector}`);
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle2", timeout: 20000 }),
    page.click(slotSelector),
  ]);
}

export async function pickTimeSlot(page: Page, log: LogFn = defaultLog): Promise<void> {
  try {
    await page.waitForSelector("input[type='radio'], a[href*='wicket']", { timeout: 10000 });
    const timeSlot = await page.$("input[type='radio']");
    if (timeSlot) {
      await timeSlot.click();
      log("[steps] Time slot selected.");
    } else {
      const firstLink = await page.$("a[href*='wicket']");
      if (firstLink) await firstLink.click();
      log("[steps] Time link clicked.");
    }
    await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 20000 });
  } catch {
    log("[steps] No time slot selector — may have reached contact page directly.");
  }
}

export async function fillContactInfo(page: Page, config: Config, log: LogFn = defaultLog): Promise<void> {
  const fields = [
    { selector: "input[name*='firstName'], input[id*='firstName']", value: config.personal.firstName },
    { selector: "input[name*='lastName'], input[id*='lastName']", value: config.personal.lastName },
    { selector: "input[name*='personnummer'], input[id*='personnr']", value: config.personal.personnummer },
    { selector: "input[type='tel'], input[name*='phone'], input[name*='telefon']", value: config.personal.phone },
  ];
  for (const field of fields) {
    const el = await page.$(field.selector);
    if (el) {
      await el.click({ clickCount: 3 });
      await el.type(field.value, { delay: 40 });
      log(`[steps] Filled: ${field.selector}`);
    } else {
      log(`[steps] Field not found: ${field.selector}`);
    }
  }
  // Fill all email inputs (handles both e-post and "fyll i e-post igen")
  const emailEls = await page.$$("input[type='email'], input[name*='email'], input[id*='email']");
  for (const el of emailEls) {
    await el.click({ clickCount: 3 });
    await el.type(config.personal.email, { delay: 40 });
    const fieldName = await el.evaluate((n) => (n as HTMLInputElement).name || (n as HTMLInputElement).id);
    log(`[steps] Filled email field: ${fieldName}`);
  }
}

export async function submitForm(page: Page, log: LogFn = defaultLog): Promise<void> {
  const submitted = await clickFortsatt(page);
  if (!submitted) throw new Error("Submit mechanism not found");
  log(`[steps] Form submitted via: ${submitted}`);
  await page.waitForNetworkIdle({ timeout: 20000, idleTime: 1500 }).catch(() => {});
}