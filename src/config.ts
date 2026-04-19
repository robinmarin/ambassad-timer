import fs from "fs";
import path from "path";

export interface Config {
  personal: {
    firstName: string;
    lastName: string;
    personnummer: string;
    email: string;
    phone: string;
  };
  notification: {
    telegram: {
      botToken: string;
      chatId: string;
    };
  };
  booking: {
    unitCode: string;
    appointmentType: string;
    numberOfPeople: number;
  };
  polling: {
    sniperIntervalSec: number;
    normalIntervalMin: number;
    sniperWindowStartHour: number;
    sniperWindowEndHour: number;
    sniperDayOfWeek: number; // 0=Sun, 3=Wed
  };
}

export function loadConfig(): Config {
  const configPath = path.resolve(process.cwd(), "config.json");
  if (!fs.existsSync(configPath)) {
    throw new Error(
      "config.json not found. Copy config.example.json to config.json and fill in your details."
    );
  }
  return JSON.parse(fs.readFileSync(configPath, "utf-8")) as Config;
}
