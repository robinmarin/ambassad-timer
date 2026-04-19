import fs from "fs";
import path from "path";
import { loadConfig } from "../config";

jest.mock("fs");

const mockFs = fs as jest.Mocked<typeof fs>;

const validConfig = {
  personal: { firstName: "A", lastName: "B", personnummer: "19900101-1234", email: "a@b.com", phone: "+441234" },
  notification: { telegram: { botToken: "123:ABC", chatId: "456" } },
  booking: { unitCode: "U0586", appointmentType: "samordningsnummer", numberOfPeople: 1 },
  polling: { sniperIntervalSec: 25, normalIntervalMin: 10, sniperWindowStartHour: 9, sniperWindowEndHour: 11, sniperDayOfWeek: 3 },
};

describe("loadConfig", () => {
  it("throws when config.json does not exist", () => {
    mockFs.existsSync.mockReturnValue(false);
    expect(() => loadConfig()).toThrow("config.json not found");
  });

  it("parses and returns config when file exists", () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue(JSON.stringify(validConfig));
    const config = loadConfig();
    expect(config.booking.unitCode).toBe("U0586");
    expect(config.polling.sniperDayOfWeek).toBe(3);
  });

  it("resolves config path relative to cwd", () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue(JSON.stringify(validConfig));
    loadConfig();
    expect(mockFs.existsSync).toHaveBeenCalledWith(
      path.resolve(process.cwd(), "config.json")
    );
  });
});
