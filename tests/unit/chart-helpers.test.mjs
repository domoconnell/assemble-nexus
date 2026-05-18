import { describe, it, expect } from "vitest";
import {
	makeLinearScale,
	niceTicks,
	compactGbp,
	arcPath,
} from "@/lib/board-pack/charts/helpers.js";

describe("makeLinearScale", () => {
	it("maps a value within range", () => {
		const s = makeLinearScale(0, 100, 0, 200);
		expect(s(50)).toBe(100);
		expect(s(0)).toBe(0);
		expect(s(100)).toBe(200);
	});
	it("handles zero-range domains gracefully", () => {
		const s = makeLinearScale(5, 5, 0, 200);
		expect(s(5)).toBe(100); // midpoint of the range
	});
});

describe("niceTicks", () => {
	it("returns ascending ticks across a range", () => {
		const ticks = niceTicks(0, 1000, 5);
		expect(ticks.length).toBeGreaterThan(0);
		for (let i = 1; i < ticks.length; i++) {
			expect(ticks[i]).toBeGreaterThan(ticks[i - 1]);
		}
	});
	it("collapses to a single tick when min==max", () => {
		expect(niceTicks(50, 50, 5)).toEqual([50]);
	});
});

describe("compactGbp", () => {
	it("uses k suffix for >= 1000 pounds", () => {
		expect(compactGbp(150_000)).toBe("£1.5k"); // 150_000 pence = £1,500
		expect(compactGbp(500_000)).toBe("£5k"); // 500_000 pence = £5,000
	});
	it("uses no decimals for sub-1000 pounds", () => {
		expect(compactGbp(99)).toBe("£1");
		expect(compactGbp(0)).toBe("£0");
	});
	it("renders negative with an en-dash sign", () => {
		expect(compactGbp(-500_000)).toBe("−£5k");
	});
});

describe("arcPath", () => {
	it("produces a closed path string", () => {
		const d = arcPath({
			cx: 100,
			cy: 100,
			outerRadius: 80,
			innerRadius: 40,
			startAngle: 0,
			endAngle: Math.PI / 2,
		});
		expect(d).toMatch(/^M /);
		expect(d).toMatch(/Z$/);
		expect(d).toContain("A 80 80");
		expect(d).toContain("A 40 40");
	});
	it("renders a full-pie slice when innerRadius is 0", () => {
		const d = arcPath({
			cx: 0,
			cy: 0,
			outerRadius: 50,
			innerRadius: 0,
			startAngle: 0,
			endAngle: Math.PI,
		});
		expect(d).toContain("L 50 0");
	});
});
