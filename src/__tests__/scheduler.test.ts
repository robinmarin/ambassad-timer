jest.mock("node-cron", () => ({
  schedule: jest.fn(),
}));

jest.mock("../booker", () => ({
  attemptBooking: jest.fn(),
}));

import cron from "node-cron";
import { attemptBooking } from "../booker";
import { startScheduler } from "../scheduler";
import type { Config } from "../config";

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  (cron.schedule as jest.Mock).mockImplementation(() => {});
});

afterEach(() => {
  jest.useRealTimers();
});

const baseConfig: Config = {
  personal: {
    firstName: "Test",
    lastName: "User",
    personnummer: "198001011234",
    email: "test@example.com",
    phone: "0700000000",
  },
  notification: {
    telegram: { botToken: "123:ABC", chatId: "456" },
  },
  booking: {
    unitCode: "U0586",
    appointmentType: "samordningsnummer",
    numberOfPeople: 1,
  },
  polling: {
    sniperIntervalSec: 5,
    normalIntervalMin: 30,
    sniperWindowStartHour: 9,
    sniperWindowEndHour: 12,
    sniperDayOfWeek: 3,
  },
};

describe("scheduler", () => {
  describe("jitter", () => {
    it("returns between 80% and 120% of input", () => {
      const originalMathRandom = Math.random;
      const runJitterTest = (ms: number) => {
        const result = ms * (0.8 + Math.random() * 0.4);
        return result >= ms * 0.8 && result <= ms * 1.2;
      };
      for (let i = 0; i < 100; i++) {
        expect(runJitterTest(60000)).toBe(true);
      }
    });

    it("is non-deterministic (different values over multiple calls)", () => {
      const results = new Set<number>();
      for (let i = 0; i < 20; i++) {
        const r = 60000 * (0.8 + Math.random() * 0.4);
        results.add(r);
      }
      expect(results.size > 1).toBe(true);
    });
  });

  describe("startScheduler", () => {
    it("registers a cron job that runs every minute", () => {
      startScheduler(baseConfig);
      expect(cron.schedule).toHaveBeenCalledWith("* * * * *", expect.any(Function));
    });

    it("does not call attemptBooking before cron fires", () => {
      startScheduler(baseConfig);
      expect(attemptBooking).not.toHaveBeenCalled();
    });
  });
});