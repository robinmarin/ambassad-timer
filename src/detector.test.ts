import { detectAvailableSlot, hasNoSlotsMessage } from "./detector";

const mockPage = (html: string) => ({
  evaluate: jest.fn((fn: () => unknown) => {
    return fn();
  }),
});

const createMockDocument = (html: string) => {
  const body = html.replace(/<body>|<\/body>/gi, "");
  return {
    body: { innerText: body },
    querySelectorAll: (selector: string) => {
      const results: Array<{ id: string; textContent: string; href: string }> = [];
      if (selector.includes("td.wicket-datepicker-day")) {
        const match = html.match(/<td class="wicket-datepicker-day[^"]*"><a([^>]* )?href="([^"]*)"[^>]*>([^<]*)<\/a><\/td>/);
        if (match) {
          const attrs = match[1] || "";
          const idMatch = attrs.match(/id="([^"]*)"/);
          results.push({ id: idMatch ? idMatch[1] : "", textContent: match[3], href: match[2] });
        }
      }
      if (selector.includes("td[class*='day']") || selector.includes("td.available")) {
        const dayMatch = html.match(/<td class="[^"]*day[^"]*"><a([^>]* )?href="([^"]*)"[^>]*>([^<]*)<\/a><\/td>/);
        if (dayMatch && !selector.includes("disabled")) {
          const attrs = dayMatch[1] || "";
          const idMatch = attrs.match(/id="([^"]*)"/);
          results.push({ id: idMatch ? idMatch[1] : "", textContent: dayMatch[3], href: dayMatch[2] });
        }
      }
      if (selector.includes("td:not(.disabled):not(.empty)")) {
        const noDisabledMatch = html.match(/<td(?!\s+class="disabled")(?!\s+class="empty")[^>]*><a([^>]* )?href="([^"]*)"[^>]*>([^<]*)<\/a><\/td>/);
        if (noDisabledMatch) {
          const attrs = noDisabledMatch[1] || "";
          const idMatch = attrs.match(/id="([^"]*)"/);
          results.push({ id: idMatch ? idMatch[1] : "", textContent: noDisabledMatch[3], href: noDisabledMatch[2] });
        }
      }
      return results;
    },
  };
};

describe("detector", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("detectAvailableSlot", () => {
    it("returns selector when available date link is found", async () => {
      const html = `<html><body><table><td class="wicket-datepicker-day"><a href="?day=1">1</a></td></table></body></html>`;
      const page = mockPage(html);
      (page.evaluate as jest.Mock).mockImplementation((fn: () => unknown) => {
        const doc = createMockDocument(html);
        global.document = doc as any;
        const result = fn();
        delete (global as any).document;
        return result;
      });
      const result = await detectAvailableSlot(page as any);
      expect(result).toBe("a[href*='wicket']:has-text(\"1\")");
    });

    it("returns null when no available dates found", async () => {
      const html = `<html><body>No dates</body></html>`;
      const page = mockPage(html);
      (page.evaluate as jest.Mock).mockImplementation((fn: () => unknown) => {
        const doc = createMockDocument(html);
        global.document = doc as any;
        const result = fn();
        delete (global as any).document;
        return result;
      });
      const result = await detectAvailableSlot(page as any);
      expect(result).toBeNull();
    });

    it("returns null for empty document", async () => {
      const html = `<html><body></body></html>`;
      const page = mockPage(html);
      (page.evaluate as jest.Mock).mockImplementation((fn: () => unknown) => {
        const doc = createMockDocument(html);
        global.document = doc as any;
        const result = fn();
        delete (global as any).document;
        return result;
      });
      const result = await detectAvailableSlot(page as any);
      expect(result).toBeNull();
    });

    it("prefers element id over text selector", async () => {
      const html = `<html><body><td class="wicket-datepicker-day"><a id="date-cell-1" href="?day=1">1</a></td></body></html>`;
      const page = mockPage(html);
      (page.evaluate as jest.Mock).mockImplementation((fn: () => unknown) => {
        const doc = createMockDocument(html);
        global.document = doc as any;
        const result = fn();
        delete (global as any).document;
        return result;
      });
      const result = await detectAvailableSlot(page as any);
      expect(result).toBe("#date-cell-1");
    });

    it("returns null when candidates have no id and no text", async () => {
      const html = `<html><body><a href="?day=1"></a></body></html>`;
      const page = mockPage(html);
      (page.evaluate as jest.Mock).mockImplementation((fn: () => unknown) => {
        const doc = createMockDocument(html);
        global.document = doc as any;
        const result = fn();
        delete (global as any).document;
        return result;
      });
      const result = await detectAvailableSlot(page as any);
      expect(result).toBeNull();
    });
  });

  describe("hasNoSlotsMessage", () => {
    it("returns true for Swedish 'inga lediga tider'", async () => {
      const page = mockPage(`<body>inga lediga tider</body>`);
      (page.evaluate as jest.Mock).mockImplementation((fn: () => unknown) => {
        global.document = { body: { innerText: "inga lediga tider" } } as any;
        const result = fn();
        delete (global as any).document;
        return result;
      });
      const result = await hasNoSlotsMessage(page as any);
      expect(result).toBe(true);
    });

    it("returns true for English 'no available'", async () => {
      const page = mockPage(`<body>No available appointments</body>`);
      (page.evaluate as jest.Mock).mockImplementation((fn: () => unknown) => {
        global.document = { body: { innerText: "No available appointments" } } as any;
        const result = fn();
        delete (global as any).document;
        return result;
      });
      const result = await hasNoSlotsMessage(page as any);
      expect(result).toBe(true);
    });

    it("returns true for 'fully booked'", async () => {
      const page = mockPage(`<body>FULLY BOOKED</body>`);
      (page.evaluate as jest.Mock).mockImplementation((fn: () => unknown) => {
        global.document = { body: { innerText: "FULLY BOOKED" } } as any;
        const result = fn();
        delete (global as any).document;
        return result;
      });
      const result = await hasNoSlotsMessage(page as any);
      expect(result).toBe(true);
    });

    it("returns true for 'inga tider'", async () => {
      const page = mockPage(`<body>inga tider</body>`);
      (page.evaluate as jest.Mock).mockImplementation((fn: () => unknown) => {
        global.document = { body: { innerText: "inga tider" } } as any;
        const result = fn();
        delete (global as any).document;
        return result;
      });
      const result = await hasNoSlotsMessage(page as any);
      expect(result).toBe(true);
    });

    it("returns false when no no-slots message present", async () => {
      const page = mockPage(`<body>There are available slots!</body>`);
      (page.evaluate as jest.Mock).mockImplementation((fn: () => unknown) => {
        global.document = { body: { innerText: "There are available slots!" } } as any;
        const result = fn();
        delete (global as any).document;
        return result;
      });
      const result = await hasNoSlotsMessage(page as any);
      expect(result).toBe(false);
    });

    it("is case insensitive", async () => {
      const page = mockPage(`<body>INGA LEDIGA TIDER</body>`);
      (page.evaluate as jest.Mock).mockImplementation((fn: () => unknown) => {
        global.document = { body: { innerText: "INGA LEDIGA TIDER" } } as any;
        const result = fn();
        delete (global as any).document;
        return result;
      });
      const result = await hasNoSlotsMessage(page as any);
      expect(result).toBe(true);
    });
  });
});