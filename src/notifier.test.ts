jest.mock("node-notifier", () => ({
  notify: jest.fn(),
}));

const mockSendMail = jest.fn().mockResolvedValue(undefined);
jest.mock("nodemailer", () => ({
  createTransport: jest.fn().mockReturnValue({
    sendMail: mockSendMail,
  }),
}));

import notifier from "node-notifier";
import nodemailer from "nodemailer";
import { notify } from "./notifier";
import type { Config } from "./config";

const baseConfig: Config = {
  personal: {
    firstName: "Test",
    lastName: "User",
    personnummer: "198001011234",
    email: "test@example.com",
    phone: "0700000000",
  },
  notification: {
    smtp: { host: "smtp.test.se", port: 587, user: "user", pass: "pass" },
    to: "recipient@example.com",
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

beforeEach(() => {
  jest.clearAllMocks();
});

describe("notifier", () => {
  describe("notify", () => {
    it("sends a desktop notification with correct title and message", async () => {
      await notify(baseConfig, "Test Subject", "Test Body");
      expect(notifier.notify).toHaveBeenCalledWith({
        title: "ambassad-timer",
        message: "Test Subject",
        sound: true,
        wait: false,
      });
    });

    it("creates nodemailer transporter with correct SMTP config", async () => {
      await notify(baseConfig, "Test Subject", "Test Body");
      expect(nodemailer.createTransport).toHaveBeenCalledWith({
        host: "smtp.test.se",
        port: 587,
        secure: false,
        auth: {
          user: "user",
          pass: "pass",
        },
      });
    });

    it("sends email with correct from, to, subject and text", async () => {
      await notify(baseConfig, "Test Subject", "Test Body");
      const sendMail = nodemailer.createTransport().sendMail;
      expect(sendMail).toHaveBeenCalledWith({
        from: "user",
        to: "recipient@example.com",
        subject: "Test Subject",
        text: "Test Body",
      });
    });

    it("does not include attachments when screenshotPath is not provided", async () => {
      await notify(baseConfig, "Test Subject", "Test Body");
      const sendMail = nodemailer.createTransport().sendMail;
      expect(sendMail).toHaveBeenCalledWith(
        expect.not.objectContaining({ attachments: expect.anything() })
      );
    });

    it("includes screenshot attachment when screenshotPath is provided", async () => {
      await notify(baseConfig, "Test Subject", "Test Body", "/path/to/screenshot.png");
      const sendMail = nodemailer.createTransport().sendMail;
      expect(sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          attachments: [{ filename: "confirmation.png", path: "/path/to/screenshot.png" }],
        })
      );
    });

    it("logs email sent message to console", async () => {
      const consoleSpy = jest.spyOn(console, "log").mockImplementation(() => {});
      await notify(baseConfig, "Test Subject", "Test Body");
      expect(consoleSpy).toHaveBeenCalledWith("[notifier] Email sent to recipient@example.com");
      consoleSpy.mockRestore();
    });

    it("awaits sendMail completion", async () => {
      const sendMail = nodemailer.createTransport().sendMail as jest.Mock;
      sendMail.mockResolvedValue(undefined);
      await expect(notify(baseConfig, "Test Subject", "Test Body")).resolves.toBeUndefined();
    });
  });
});