import https from "https";
import fs from "fs";
import { notify } from "../notifier";
import type { Config } from "../config";

jest.mock("https");
jest.mock("fs");

const mockHttps = https as jest.Mocked<typeof https>;
const mockFs = fs as jest.Mocked<typeof fs>;

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
  booking: { unitCode: "U0586", appointmentType: "samordningsnummer", numberOfPeople: 1 },
  polling: {
    sniperIntervalSec: 5,
    normalIntervalMin: 30,
    sniperWindowStartHour: 9,
    sniperWindowEndHour: 12,
    sniperDayOfWeek: 3,
  },
};

function mockHttpsRequest(statusCode = 200) {
  const mockRes = {
    statusCode,
    resume: jest.fn(),
    on: jest.fn((event: string, cb: () => void) => {
      if (event === "end") cb();
    }),
  };
  const mockReq = { on: jest.fn(), write: jest.fn(), end: jest.fn() };
  (mockHttps.request as jest.Mock).mockImplementation((_opts: unknown, cb: (res: unknown) => void) => {
    cb(mockRes);
    return mockReq;
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockFs.existsSync.mockReturnValue(false); // no screenshot by default
});

describe("notify", () => {
  it("calls Telegram sendMessage endpoint", async () => {
    mockHttpsRequest();
    await notify(baseConfig, "Test Subject", "Test Body");
    expect(mockHttps.request).toHaveBeenCalledWith(
      expect.objectContaining({ hostname: "api.telegram.org" }),
      expect.any(Function)
    );
  });

  it("sends to the correct bot token path", async () => {
    mockHttpsRequest();
    await notify(baseConfig, "Test Subject", "Test Body");
    const callArgs = mockHttps.request.mock.calls[0]?.[0] as unknown as { path: string };
    expect(callArgs.path).toContain("123:ABC");
    expect(callArgs.path).toContain("sendMessage");
  });

  it("includes chat_id and text in the request body", async () => {
    mockHttpsRequest();
    await notify(baseConfig, "Test Subject", "Test Body");
    const mockReq = (mockHttps.request as jest.Mock).mock.results[0]?.value as { write: jest.Mock };
    const body = mockReq.write.mock.calls[0]?.[0] as string;
    expect(body).toContain("456"); // chat_id
    expect(body).toContain("Test%20Subject"); // encoded in body
  });

  it("logs confirmation to console", async () => {
    mockHttpsRequest();
    const spy = jest.spyOn(console, "log").mockImplementation(() => {});
    await notify(baseConfig, "Subject", "Body");
    expect(spy).toHaveBeenCalledWith("[notifier] Telegram message sent to chat 456");
    spy.mockRestore();
  });

  it("throws when Telegram returns a non-2xx status", async () => {
    mockHttpsRequest(429); // rate limited
    await expect(notify(baseConfig, "S", "B")).rejects.toThrow("429");
  });

  it("uses sendPhoto when screenshotPath exists", async () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue(Buffer.from("fake-png-data"));
    mockHttpsRequest();
    await notify(baseConfig, "Subject", "Body", "/tmp/screenshot.png");
    const callArgs = mockHttps.request.mock.calls[0]?.[0] as unknown as { path: string };
    expect(callArgs.path).toContain("sendPhoto");
  });
});
