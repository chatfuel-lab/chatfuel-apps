import { describe, expect, it } from "vitest";
import { BookingStatus } from "~api/generated/bookings/graphql";
import { apiTimes, money, periodRange, summarize, toCsv, todayKey, type BookingLike } from "./model";

const ZONE = "America/Santiago";
// 2026-09-15 15:00 in Santiago (UTC-3 in September): 18:00Z
const NOW = Date.UTC(2026, 8, 15, 18, 0, 0);

const booking = (status: BookingStatus, amount: string | null, title = "Manicure", who = "Camila", person = "Ana"): BookingLike => ({
  status, startTime: "2026-09-15T10:00:00-03:00",
  service: { title, price: amount === null ? null : { amount, currency: "CLP" } },
  specialist: { profile: { firstName: who, lastName: null } },
  inlineContact: { name: person },
});

describe("periods in the salon's zone", () => {
  it("cut today, yesterday and the calendar months on the salon's wall clock", () => {
    const today = periodRange("TODAY", NOW, ZONE);
    expect(today.fromDay).toBe("2026-09-15"); expect(today.toDay).toBe("2026-09-15");
    expect(new Date(today.startMs).toISOString()).toBe("2026-09-15T03:00:00.000Z");
    expect(periodRange("YESTERDAY", NOW, ZONE).fromDay).toBe("2026-09-14");
    expect(periodRange("LAST_7_DAYS", NOW, ZONE).fromDay).toBe("2026-09-09");
    expect(periodRange("THIS_MONTH", NOW, ZONE).fromDay).toBe("2026-09-01");
    const last = periodRange("LAST_MONTH", NOW, ZONE);
    expect(last.fromDay).toBe("2026-08-01"); expect(last.toDay).toBe("2026-08-31");
    expect(periodRange("LAST_3_MONTHS", NOW, ZONE).fromDay).toBe("2026-07-01");
  });
  it("sends the API times with the zone's offset, never Z", () => {
    const t = apiTimes(periodRange("TODAY", NOW, ZONE), ZONE);
    expect(t.startTime).toBe("2026-09-15T00:00:00-03:00");
    expect(t.endTime.startsWith("2026-09-15T23:59:59")).toBe(true);
    expect(t.endTime.endsWith("-03:00")).toBe(true);
    expect(todayKey(NOW, ZONE)).toBe("2026-09-15");
  });
});

describe("the summary", () => {
  it("bills what was not cancelled, counts what was lost, and nets the expenses", () => {
    const s = summarize([
      booking(BookingStatus.Attended, "12000"),
      booking(BookingStatus.Confirmed, "25000", "Uñas acrílicas", "Camila", "Bea"),
      booking(BookingStatus.Pending, null, "Pedicure", "Sofía", "Ana"),
      booking(BookingStatus.Canceled, "12000"),
      booking(BookingStatus.NoShow, "12000"),
    ], [{ amount: "5000" }, { amount: 2500 }], [{ cost: "8000" }]);
    expect(s.currency).toBe("CLP");
    expect(s.revenue).toBe(37000);
    expect(s.billedCount).toBe(3);
    expect(s.lostCount).toBe(2);
    expect(s.withoutPrice).toBe(1);
    expect(s.expenses).toBe(7500);
    expect(s.supplies).toBe(8000);
    expect(s.net).toBe(29500);
    expect(s.byService[0]).toMatchObject({ name: "Uñas acrílicas", revenue: 25000, count: 1 });
    expect(s.bySpecialist.map((r) => r.name)).toEqual(["Camila", "Sofía"]);
    expect(s.byClient[0]).toMatchObject({ name: "Bea", revenue: 25000 });
  });
  it("formats money for the language and writes a CSV Excel can open", () => {
    expect(money(12000, "CLP", "es")).toContain("12.000");
    expect(money(80, "BRL", "pt")).toContain("80");
    const csv = toCsv(["a", "b"], [["x, y", 1], ['say "hi"', null]]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain('"x, y","1"');
    expect(csv).toContain('"say ""hi""",""');
  });
});
