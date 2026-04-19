import type { Config } from "./config";

jest.mock("puppeteer-extra");
jest.mock("puppeteer-extra-plugin-stealth");
jest.mock("./detector");
jest.mock("./notifier");
jest.mock("fs");
jest.mock("path");

const mockConfig: Config = {
  personal: {
    firstName: "John",
    lastName: "Doe",
    personnummer: "198001011234",
    email: "john@example.com",
    phone: "+46123456789",
  },
  notification: { telegram: { botToken: "123:ABC", chatId: "456" } },
  booking: { unitCode: "U0586", appointmentType: "samordning", numberOfPeople: 1 },
  polling: {
    sniperIntervalSec: 30,
    normalIntervalMin: 5,
    sniperWindowStartHour: 9,
    sniperWindowEndHour: 17,
    sniperDayOfWeek: 3,
  },
};

describe("booker.ts", () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.resetModules();
  });

  describe("attemptBooking", () => {
    it("returns booked result on successful booking", async () => {
      const originalSetTimeout = global.setTimeout;
      global.setTimeout = ((fn: () => void) => { fn(); }) as typeof setTimeout;

      jest.doMock("puppeteer-extra", () => ({
        __esModule: true,
        default: {
          launch: jest.fn().mockResolvedValue({
            newPage: jest.fn().mockResolvedValue({
              setViewport: jest.fn(),
              setExtraHTTPHeaders: jest.fn(),
              goto: jest.fn().mockResolvedValue(undefined),
              waitForSelector: jest.fn().mockResolvedValue(undefined),
              select: jest.fn().mockResolvedValue(undefined),
              $: jest.fn().mockResolvedValue(null),
              evaluate: jest.fn().mockResolvedValue("ABC123XYZ"),
              click: jest.fn().mockResolvedValue(undefined),
              waitForNavigation: jest.fn().mockResolvedValue(undefined),
              screenshot: jest.fn().mockResolvedValue(undefined),
            }),
            close: jest.fn().mockResolvedValue(undefined),
          }),
          use: jest.fn(),
        },
      }));

      jest.doMock("puppeteer-extra-plugin-stealth", () => ({
        __esModule: true,
        default: jest.fn(),
      }));

      jest.doMock("./detector", () => ({
        detectAvailableSlot: jest.fn().mockResolvedValue("a.slot"),
        hasNoSlotsMessage: jest.fn().mockResolvedValue(false),
      }));

      const { attemptBooking } = require("./booker");
      const result = await attemptBooking(mockConfig);

      expect(result.status).toBe("booked");
      const booked = result as { status: "booked"; reference: string; screenshotPath: string };
      expect(booked.reference).toBe("ABC123XYZ");

      global.setTimeout = originalSetTimeout;
    });

    it("returns no_slots when detector returns null", async () => {
      const originalSetTimeout = global.setTimeout;
      global.setTimeout = ((fn: () => void) => { fn(); }) as typeof setTimeout;

      jest.doMock("puppeteer-extra", () => ({
        __esModule: true,
        default: {
          launch: jest.fn().mockResolvedValue({
            newPage: jest.fn().mockResolvedValue({
              setViewport: jest.fn(),
              setExtraHTTPHeaders: jest.fn(),
              goto: jest.fn().mockResolvedValue(undefined),
              waitForSelector: jest.fn().mockResolvedValue(undefined),
              select: jest.fn().mockResolvedValue(undefined),
              $: jest.fn().mockResolvedValue(null),
              evaluate: jest.fn().mockResolvedValue(""),
              click: jest.fn().mockResolvedValue(undefined),
              waitForNavigation: jest.fn().mockResolvedValue(undefined),
            }),
            close: jest.fn().mockResolvedValue(undefined),
          }),
          use: jest.fn(),
        },
      }));

      jest.doMock("puppeteer-extra-plugin-stealth", () => ({
        __esModule: true,
        default: jest.fn(),
      }));

      jest.doMock("./detector", () => ({
        detectAvailableSlot: jest.fn().mockResolvedValue(null),
        hasNoSlotsMessage: jest.fn().mockResolvedValue(false),
      }));

      const { attemptBooking } = require("./booker");
      const result = await attemptBooking(mockConfig);

      expect(result.status).toBe("no_slots");

      global.setTimeout = originalSetTimeout;
    });

    it("returns error when browser operations fail", async () => {
      jest.doMock("puppeteer-extra", () => ({
        __esModule: true,
        default: {
          launch: jest.fn().mockResolvedValue({
            newPage: jest.fn().mockRejectedValue(new Error("Page error")),
            close: jest.fn().mockResolvedValue(undefined),
          }),
          use: jest.fn(),
        },
      }));

      jest.doMock("puppeteer-extra-plugin-stealth", () => ({
        __esModule: true,
        default: jest.fn(),
      }));

      jest.doMock("./detector", () => ({
        detectAvailableSlot: jest.fn(),
        hasNoSlotsMessage: jest.fn(),
      }));

      const { attemptBooking } = require("./booker");
      const result = await attemptBooking(mockConfig);

      expect(result.status).toBe("error");
      if (result.status === "error") {
        expect(result.message).toBe("Page error");
      }
    });
  });
});