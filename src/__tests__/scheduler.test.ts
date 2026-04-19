import type { Config } from "../config";

// Must mock before importing scheduler
jest.mock("node-cron", () => ({ schedule: jest.fn() }));
jest.mock("../booker", () => ({ attemptBooking: jest.fn() }));

import cron from "node-cron";
import { attemptBooking } from "../booker";
import { startScheduler } from "../scheduler";
import type { BookingResult } from "../booker";

const mockCron = cron as jest.Mocked<typeof cron>;
const mockAttemptBooking = attemptBooking as jest.MockedFunction<typeof attemptBooking>;

const baseConfig: Config = {
  personal: { firstName: "A", lastName: "B", personnummer: "19900101-1234", email: "a@b.com", phone: "+44" },
  notification: { smtp: { host: "smtp.example.com", port: 587, user: "u", pass: "p" }, to: "a@b.com" },
  booking: { unitCode: "U0586", appointmentType: "samordningsnummer", numberOfPeople: 1 },
  polling: { sniperIntervalSec: 25, normalIntervalMin: 10, sniperWindowStartHour: 9, sniperWindowEndHour: 11, sniperDayOfWeek: 3 },
};

describe("startScheduler", () => {
  it("registers a cron job on startup", () => {
    startScheduler(baseConfig);
    expect(mockCron.schedule).toHaveBeenCalledWith("* * * * *", expect.any(Function));
  });
});

describe("poll behaviour", () => {
  let cronCallback: () => Promise<void>;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    // Wednesday at 10am — inside sniper window
    jest.setSystemTime(new Date("2026-04-22T10:00:00Z")); // Wednesday UTC
    startScheduler(baseConfig);
    const call = (mockCron.schedule as jest.Mock).mock.calls[0];
    cronCallback = call[1] as () => Promise<void>;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("calls attemptBooking when polled", async () => {
    mockAttemptBooking.mockResolvedValue({ status: "no_slots" });
    await cronCallback();
    expect(mockAttemptBooking).toHaveBeenCalledWith(baseConfig);
  });

  it("does not double-poll if already running", async () => {
    let resolveFirst!: () => void;
    mockAttemptBooking.mockReturnValue(
      new Promise<BookingResult>((res) => { resolveFirst = () => res({ status: "no_slots" }); })
    );
    // Fire twice before first resolves
    const p1 = cronCallback();
    const p2 = cronCallback();
    resolveFirst();
    await Promise.all([p1, p2]);
    expect(mockAttemptBooking).toHaveBeenCalledTimes(1);
  });
});
