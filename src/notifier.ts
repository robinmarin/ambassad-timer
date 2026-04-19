import nodemailer from "nodemailer";
import notifier from "node-notifier";
import type { Config } from "./config.js";

export async function notify(
  config: Config,
  subject: string,
  body: string,
  screenshotPath?: string
): Promise<void> {
  // Desktop notification
  notifier.notify({
    title: "ambassad-timer",
    message: subject,
    sound: true,
    wait: false,
  });

  // Email
  const transporter = nodemailer.createTransport({
    host: config.notification.smtp.host,
    port: config.notification.smtp.port,
    secure: false,
    auth: {
      user: config.notification.smtp.user,
      pass: config.notification.smtp.pass,
    },
  });

  const mailOptions: nodemailer.SendMailOptions = {
    from: config.notification.smtp.user,
    to: config.notification.to,
    subject,
    text: body,
  };

  if (screenshotPath) {
    mailOptions.attachments = [
      { filename: "confirmation.png", path: screenshotPath },
    ];
  }

  await transporter.sendMail(mailOptions);
  console.log(`[notifier] Email sent to ${config.notification.to}`);
}
