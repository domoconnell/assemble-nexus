import { describe, it, expect } from "vitest";
import {
	prevMonth,
	nextMonth,
	resolveMonth,
	currentMonthLondon,
	ymdFirstOfMonth,
	monthLabel,
} from "@/lib/finance/months.js";

describe("prevMonth / nextMonth", () => {
	it("wraps Jan back into Dec of prior year", () => {
		expect(prevMonth(2026, 1)).toEqual({ year: 2025, month1: 12 });
	});
	it("wraps Dec forward into Jan of next year", () => {
		expect(nextMonth(2026, 12)).toEqual({ year: 2027, month1: 1 });
	});
	it("steps within the same year", () => {
		expect(prevMonth(2026, 6)).toEqual({ year: 2026, month1: 5 });
		expect(nextMonth(2026, 6)).toEqual({ year: 2026, month1: 7 });
	});
});

describe("ymdFirstOfMonth", () => {
	it("pads single-digit months", () => {
		expect(ymdFirstOfMonth(2026, 5)).toBe("2026-05-01");
		expect(ymdFirstOfMonth(2026, 12)).toBe("2026-12-01");
	});
});

describe("resolveMonth", () => {
	it("returns the expected boundaries for May 2026", () => {
		const m = resolveMonth("2026-05");
		expect(m.year).toBe(2026);
		expect(m.month1).toBe(5);
		expect(m.ymdFirstOfMonth).toBe("2026-05-01");
		expect(m.ymdFirstOfNextMonth).toBe("2026-06-01");
		expect(m.monthStartDate.toISOString()).toBe("2026-05-01T00:00:00.000Z");
		expect(m.monthEndDate.toISOString()).toBe("2026-06-01T00:00:00.000Z");
	});
});

describe("currentMonthLondon", () => {
	it("returns a London-calendar month regardless of UTC hour", () => {
		const lateUtc = new Date("2026-06-30T23:30:00Z"); // 00:30 BST next day
		const r = currentMonthLondon(lateUtc);
		// In Europe/London (BST = UTC+1), this is 1 July
		expect(r).toEqual({ year: 2026, month1: 7, ym: "2026-07" });
	});
});

describe("monthLabel", () => {
	it("formats as 'Month YYYY' in en-GB", () => {
		expect(monthLabel(2026, 5)).toBe("May 2026");
		expect(monthLabel(2025, 12)).toBe("December 2025");
	});
});
