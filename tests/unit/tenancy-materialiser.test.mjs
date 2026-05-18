import { describe, it, expect } from "vitest";
import { generateSessionDates } from "@/lib/tenancies/schedule.js";

describe("generateSessionDates", () => {
	it("emits sessions on the configured weekdays only", () => {
		const tenancy = {
			starts_on: "2026-06-01",
			ends_on: null,
			schedule_rule: {
				by_weekday: ["WE", "TH"],
				time_start: "09:00",
				time_end: "13:00",
			},
		};
		const from = new Date("2026-06-01T00:00:00Z");
		const until = new Date("2026-06-15T00:00:00Z");
		const sessions = generateSessionDates(tenancy, { from, until });

		// Within 2026-06-01 .. 2026-06-15 the Wednesdays are 3rd, 10th;
		// Thursdays are 4th, 11th = 4 sessions.
		expect(sessions.length).toBe(4);
		for (const s of sessions) {
			expect(s.starts_at.getUTCHours()).toBe(9);
			expect(s.ends_at.getUTCHours()).toBe(13);
			expect([3, 4]).toContain(s.starts_at.getUTCDay()); // WE=3, TH=4
		}
	});

	it("returns empty when rule has no weekdays", () => {
		const tenancy = { starts_on: "2026-06-01", ends_on: null, schedule_rule: { by_weekday: [] } };
		const r = generateSessionDates(tenancy, {
			from: new Date("2026-06-01T00:00:00Z"),
			until: new Date("2026-12-31T00:00:00Z"),
		});
		expect(r).toEqual([]);
	});

	it("clamps to tenancy ends_on", () => {
		const tenancy = {
			starts_on: "2026-06-01",
			ends_on: "2026-06-10",
			schedule_rule: { by_weekday: ["MO", "TU", "WE", "TH", "FR"], time_start: "09:00", time_end: "10:00" },
		};
		const r = generateSessionDates(tenancy, {
			from: new Date("2026-06-01T00:00:00Z"),
			until: new Date("2026-06-30T00:00:00Z"),
		});
		// Mon 1 - Wed 10 of June 2026 = 8 weekdays (Mon, Tue, Wed, Thu, Fri, Mon, Tue, Wed)
		expect(r.length).toBe(8);
	});

	it("ignores tenancies whose schedule_rule is missing", () => {
		const r = generateSessionDates({ starts_on: "2026-06-01" }, {
			from: new Date("2026-06-01T00:00:00Z"),
			until: new Date("2026-06-30T00:00:00Z"),
		});
		expect(r).toEqual([]);
	});
});
