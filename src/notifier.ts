import fs from "fs";
import https from "https";
import type { Config } from "./config";

const TELEGRAM_API = "https://api.telegram.org";

function post(url: string, body: string, contentType: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = https.request(
      {
        hostname: parsed.hostname,
        path: parsed.pathname + parsed.search,
        method: "POST",
        headers: { "Content-Type": contentType, "Content-Length": Buffer.byteLength(body) },
      },
      (res) => {
        res.resume();
        res.on("end", () => {
          if (!res.statusCode || res.statusCode >= 300) {
            reject(new Error(`Telegram API returned ${res.statusCode}`));
          } else {
            resolve();
          }
        });
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function postForm(url: string, formData: Record<string, string>): Promise<void> {
  const body = Object.entries(formData)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
  return post(url, body, "application/x-www-form-urlencoded");
}

export async function notify(
  config: Config,
  subject: string,
  body: string,
  screenshotPath?: string
): Promise<void> {
  const { botToken, chatId } = config.notification.telegram;
  const text = `*${subject}*\n\n${body}`;

  if (screenshotPath && fs.existsSync(screenshotPath)) {
    // Send photo with caption — use multipart/form-data via sendPhoto
    await sendPhoto(botToken, chatId, screenshotPath, subject);
  } else {
    await postForm(`${TELEGRAM_API}/bot${botToken}/sendMessage`, {
      chat_id: chatId,
      text,
      parse_mode: "Markdown",
    });
  }

  console.log(`[notifier] Telegram message sent to chat ${chatId}`);
}

function sendPhoto(
  botToken: string,
  chatId: string,
  photoPath: string,
  caption: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const boundary = `----FormBoundary${Date.now()}`;
    const fileData = fs.readFileSync(photoPath);
    const filename = photoPath.split("/").pop() ?? "screenshot.png";

    const preamble = [
      `--${boundary}`,
      `Content-Disposition: form-data; name="chat_id"`,
      "",
      chatId,
      `--${boundary}`,
      `Content-Disposition: form-data; name="caption"`,
      "",
      caption,
      `--${boundary}`,
      `Content-Disposition: form-data; name="photo"; filename="${filename}"`,
      "Content-Type: image/png",
      "",
      "",
    ].join("\r\n");

    const closing = `\r\n--${boundary}--\r\n`;
    const body = Buffer.concat([
      Buffer.from(preamble),
      fileData,
      Buffer.from(closing),
    ]);

    const parsed = new URL(`${TELEGRAM_API}/bot${botToken}/sendPhoto`);
    const req = https.request(
      {
        hostname: parsed.hostname,
        path: parsed.pathname,
        method: "POST",
        headers: {
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
          "Content-Length": body.length,
        },
      },
      (res) => {
        res.resume();
        res.on("end", () => {
          if (!res.statusCode || res.statusCode >= 300) {
            reject(new Error(`Telegram sendPhoto returned ${res.statusCode}`));
          } else {
            resolve();
          }
        });
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}
