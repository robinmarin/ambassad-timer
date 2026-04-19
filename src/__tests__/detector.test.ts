import { detectAvailableSlot, hasNoSlotsMessage } from "../detector";
import type { Page } from "puppeteer";

/** Build a minimal Page mock whose evaluate() runs the given fn against a fake document state */
function makePage(evaluateResult: unknown): Page {
  return {
    evaluate: jest.fn().mockResolvedValue(evaluateResult),
  } as unknown as Page;
}

describe("hasNoSlotsMessage", () => {
  it("returns true when page contains Swedish no-slots text", async () => {
    const page = makePage("inga lediga tider finns för tillfället.");
    expect(await hasNoSlotsMessage(page)).toBe(true);
  });

  it("returns true for English no-slots text", async () => {
    const page = makePage("no available appointments at this time.");
    expect(await hasNoSlotsMessage(page)).toBe(true);
  });

  it("returns false when slots may be available", async () => {
    const page = makePage("välj ett datum för din bokning");
    expect(await hasNoSlotsMessage(page)).toBe(false);
  });
});

describe("detectAvailableSlot", () => {
  it("returns null when no available slots", async () => {
    const page = makePage(null);
    expect(await detectAvailableSlot(page)).toBeNull();
  });

  it("returns the selector string when a slot is found", async () => {
    const page = makePage("#slot-6");
    const result = await detectAvailableSlot(page);
    expect(result).toBe("#slot-6");
  });
});
