import fs from "fs";
import path from "path";
import { loadConfig, Config } from "../config";

jest.mock("fs");
jest.mock("path");

describe("config.ts", () => {
  const mockConfig: Config = {
    personal: {
      firstName: "John",
      lastName: "Doe",
      personnummer: "198001011234",
      email: "john@example.com",
      phone: "+46123456789",
    },
    notification: {
      telegram: { botToken: "123:ABC", chatId: "456" },
    },
    booking: {
      unitCode: "UNIT123",
      appointmentType: "type",
      numberOfPeople: 1,
    },
    polling: {
      sniperIntervalSec: 30,
      normalIntervalMin: 5,
      sniperWindowStartHour: 9,
      sniperWindowEndHour: 17,
      sniperDayOfWeek: 3,
    },
  };

  describe("loadConfig", () => {
    it("throws error when config.json does not exist", () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);
      (path.resolve as jest.Mock).mockReturnValue("/test/config.json");

      expect(() => loadConfig()).toThrow(
        "config.json not found. Copy config.example.json to config.json and fill in your details."
      );
    });

    it("returns Config when config.json exists", () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (path.resolve as jest.Mock).mockReturnValue("/test/config.json");
      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(mockConfig));

      const result = loadConfig();

      expect(result).toEqual(mockConfig);
      expect(fs.readFileSync).toHaveBeenCalledWith("/test/config.json", "utf-8");
    });

    it("throws when config.json is empty", () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (path.resolve as jest.Mock).mockReturnValue("/test/config.json");
      (fs.readFileSync as jest.Mock).mockReturnValue("");

      expect(() => loadConfig()).toThrow();
    });
  });
});