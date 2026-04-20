# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm start            # Run with ts-node (development)
npm run start:prod   # Compile then run from dist/
npm run build        # TypeScript compile to dist/
npm test             # Run all Jest tests
npm run test:watch   # Watch mode
npm run test:coverage
```

Run a single test file:
```bash
npx jest src/__tests__/scheduler.test.ts
```

## Setup

Copy `config.example.json` to `config.json` and fill in personal details. The app reads `config.json` from the process working directory at startup — no environment variables.

**Never read `config.json`** — it contains sensitive personal data (personnummer, Telegram credentials). Refer to `config.example.json` or the `Config` interface in `src/config.ts` for the schema.

## Architecture

This is a Puppeteer-based slot sniper for Swedish Embassy London samordningsnummer appointments on Migrationsverket.

**Data flow:**
1. `index.ts` — entry point, loads config, starts scheduler
2. `scheduler.ts` — runs a cron tick every minute; decides whether to poll based on time-of-day mode (sniper vs. normal vs. night), applies ±20% jitter to intervals, exits process on successful booking
3. `booker.ts` — drives Puppeteer through the full booking flow: navigate → select appointment type → check calendar → click available date → pick time slot → fill personal details → submit → capture screenshot; calls `notify()` on success
4. `detector.ts` — page-level helpers called from booker: `detectAvailableSlot()` queries Wicket calendar DOM for non-disabled date links; `hasNoSlotsMessage()` checks page text for Swedish/English "no slots" strings
5. `notifier.ts` — sends Telegram messages via raw HTTPS (no SDK); sends photo with caption if a screenshot path is provided, plain text otherwise
6. `config.ts` — loads and types `config.json`

**Scheduling modes:**
- **Sniper mode**: Wednesday (`sniperDayOfWeek=3`) between `sniperWindowStartHour`–`sniperWindowEndHour`, polls every `sniperIntervalSec` seconds (default 25s)
- **Normal mode**: all other non-night hours, polls every `normalIntervalMin` minutes (default 10min)
- **Night mode**: 23:00–07:00, skips polling for ~30min

**Key external dependency:** Migrationsverket Wicket-based booking UI at `https://www.migrationsverket.se/ansokanbokning/` — DOM selectors in `detector.ts` and `booker.ts` may need tuning if the page structure changes.

All tests live in `src/__tests__/` and use Jest with `@swc/jest` for transpilation. Puppeteer, detector, notifier, and fs are mocked in booker tests.
