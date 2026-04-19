# ambassad-timer

Appointment slot sniper for the Swedish Embassy London.

Books a **samordningsnummer** appointment automatically the moment a slot becomes available. Slots are released every **Wednesday ~10am UK time** and vanish within minutes — this bot watches the booking system and secures a slot as soon as one appears.

---

## How it works

The booking system lives at the Swedish Migration Agency's portal (`migrationsverket.se`), which uses an Apache Wicket AJAX framework — stateful, session-based, no public REST API. The bot drives a real headless Chromium browser (via Puppeteer + stealth plugin) to look indistinguishable from a human user.

### Polling strategy

| Time window | Poll interval |
|---|---|
| Wednesday 9:45–10:45am | every ~25 seconds (sniper mode) |
| All other waking hours | every ~10 minutes (catch cancellations) |
| 11pm–7am | skipped entirely |

Every interval has ±20% random jitter to avoid a clockwork pattern that bot-detection systems look for.

### Booking flow

```
1. Navigate to booking URL (Embassy London, samordningsnummer type)
2. Select appointment type + tick confirmation checkbox
3. Check calendar for any non-greyed date
4. If no slots → exit, schedule next poll
5. If slot found → click date → click first available time
6. Auto-fill personal details from config.json
7. Submit confirmation
8. Screenshot + email + desktop notification with booking reference
9. Exit
```

---

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure

```bash
cp config.example.json config.json
```

Edit `config.json` with your details:

```json
{
  "personal": {
    "firstName": "Your",
    "lastName": "Name",
    "personnummer": "YYYYMMDD-XXXX",
    "email": "you@example.com",
    "phone": "+447700000000"
  },
  "notification": {
    "smtp": {
      "host": "smtp.gmail.com",
      "port": 587,
      "user": "you@gmail.com",
      "pass": "your-app-password"
    },
    "to": "you@example.com"
  },
  "booking": {
    "unitCode": "U0586",
    "appointmentType": "samordningsnummer",
    "numberOfPeople": 1
  },
  "polling": {
    "sniperIntervalSec": 25,
    "normalIntervalMin": 10,
    "sniperWindowStartHour": 9,
    "sniperWindowEndHour": 11,
    "sniperDayOfWeek": 3
  }
}
```

> For Gmail, generate an [App Password](https://myaccount.google.com/apppasswords) rather than using your main password.

### 3. Run

```bash
npm start
```

Leave it running. It will silently poll on the normal schedule and switch to sniper mode automatically on Wednesday mornings. When a slot is booked it will:

1. Send you an email with the booking reference and a screenshot of the confirmation
2. Fire a desktop notification
3. Print the reference to stdout
4. Exit

For always-on use (so you don't need your laptop open), deploy to a cheap VPS (e.g. Hetzner CX11 ~£3.50/month):

```bash
npm run build
node dist/index.js
# or use pm2 for process management
pm2 start dist/index.js --name ambassad-timer
```

---

## Architecture

```
src/
├── index.ts        Entry point — loads config, starts scheduler
├── scheduler.ts    Cron loop, timing mode decisions, jitter
├── booker.ts       Puppeteer session — full end-to-end booking flow
├── detector.ts     Calendar parsing — finds available date cells
├── notifier.ts     Email (nodemailer) + desktop (node-notifier)
└── config.ts       Config loader and TypeScript interfaces
```

### Key design decisions

**Puppeteer over raw HTTP** — Wicket generates per-session component IDs on every response. A raw fetch approach would need to parse and re-use these IDs manually plus maintain a cookie jar. Puppeteer handles all of this transparently.

**`puppeteer-extra-stealth`** — Patches browser fingerprinting vectors (`navigator.webdriver`, canvas noise, WebGL) that Cloudflare and similar DDoS guards use to detect headless browsers.

**Jitter on every interval** — Makes traffic pattern look human. No two consecutive polls are exactly the same distance apart.

**Wednesday sniper window** — Slots are released at ~10am. The bot ramps up polling 15 minutes before and holds it for an hour. Outside that window it polls lightly to catch cancellations.

---

## Tuning selectors

The calendar selectors in `src/detector.ts` are best-effort based on common Wicket datepicker patterns. If the bot navigates to the calendar but doesn't detect slots, run with a headed browser to inspect the actual HTML:

```ts
// In booker.ts, change:
headless: true
// to:
headless: false
```

Then open DevTools on the calendar page and find the correct selector for available date cells. Update `detectAvailableSlot()` in `src/detector.ts` accordingly.

---

## Context

Swedish citizens living in the UK need a **samordningsnummer** (coordination number) for newborns. The appointment must be made at the Swedish Embassy in London. Slots are released once a week and are gone within minutes due to high demand.

The booking portal: `https://www.migrationsverket.se/ansokanbokning/valjtyp?0&enhet=U0586&sprak=sv`  
Unit code `U0586` = Swedish Embassy London.

After the appointment, the Swedish Tax Agency processes the application (~10–12 weeks).
