import { describe, expect, it } from "vitest";

import { flattenCommands } from "./flatten";
import {
	arcLengths,
	closestPointOnContour,
	perimeter,
	pointAtArcLength,
	primaryContour,
	signedArea,
} from "./geometry";
import type { PathCommand } from "opentype.js";

/** Circle approximated by four cubics — the standard control-point constant. */
const KAPPA = 0.5522847498307936;

const circleCommands = (r: number): PathCommand[] => {
	const k = r * KAPPA;
	return [
		{ type: "M", x: r, y: 0 },
		{ type: "C", x1: r, y1: k, x2: k, y2: r, x: 0, y: r },
		{ type: "C", x1: -k, y1: r, x2: -r, y2: k, x: -r, y: 0 },
		{ type: "C", x1: -r, y1: -k, x2: -k, y2: -r, x: 0, y: -r },
		{ type: "C", x1: k, y1: -r, x2: r, y2: -k, x: r, y: 0 },
		{ type: "Z" },
	];
};

describe("flattenCommands", () => {
	it("approximates a circle to within the chord tolerance", () => {
		const r = 20;
		const contours = flattenCommands(circleCommands(r), 0.01);

		expect(contours).toHaveLength(1);

		const area = Math.abs(signedArea(contours[0]));
		const expected = Math.PI * r * r;
		// A chord-flattened polygon is inscribed, so it under-reports slightly.
		expect(area).toBeLessThanOrEqual(expected);
		expect(area).toBeGreaterThan(expected * 0.999);
	});

	it("subdivides further at a tighter tolerance", () => {
		const coarse = flattenCommands(circleCommands(20), 0.5);
		const fine = flattenCommands(circleCommands(20), 0.001);
		expect(fine[0].length).toBeGreaterThan(coarse[0].length);
	});

	it("keeps separate subpaths separate", () => {
		const commands: PathCommand[] = [
			{ type: "M", x: 0, y: 0 },
			{ type: "L", x: 10, y: 0 },
			{ type: "L", x: 10, y: 10 },
			{ type: "Z" },
			{ type: "M", x: 20, y: 0 },
			{ type: "L", x: 30, y: 0 },
			{ type: "L", x: 30, y: 10 },
			{ type: "Z" },
		];
		expect(flattenCommands(commands)).toHaveLength(2);
	});

	it("closes a trailing subpath that has no explicit Z", () => {
		const commands: PathCommand[] = [
			{ type: "M", x: 0, y: 0 },
			{ type: "L", x: 10, y: 0 },
			{ type: "L", x: 10, y: 10 },
		];
		expect(flattenCommands(commands)).toHaveLength(1);
	});

	it("discards degenerate subpaths with no area", () => {
		const commands: PathCommand[] = [
			{ type: "M", x: 0, y: 0 },
			{ type: "L", x: 10, y: 0 },
			{ type: "Z" },
		];
		expect(flattenCommands(commands)).toHaveLength(0);
	});
});

describe("closestPointOnContour", () => {
	// 100 x 50, perimeter 300, starting at the origin going counter-clockwise.
	const rect = [
		{ x: 0, y: 0 },
		{ x: 100, y: 0 },
		{ x: 100, y: 50 },
		{ x: 0, y: 50 },
	];

	it("projects a point onto the nearest edge", () => {
		const hit = closestPointOnContour(rect, { x: 40, y: -12 });
		expect(hit).not.toBeNull();
		expect(hit!.point.x).toBeCloseTo(40, 9);
		expect(hit!.point.y).toBeCloseTo(0, 9);
		expect(hit!.distance).toBeCloseTo(12, 9);
		expect(hit!.arcLength).toBeCloseTo(40, 9);
		expect(hit!.fraction).toBeCloseTo(40 / 300, 9);
	});

	it("clamps to a corner for a point past the end of an edge", () => {
		// Off the bottom-right corner diagonally: must land on the corner
		// itself, not run off the end of the segment.
		const hit = closestPointOnContour(rect, { x: 130, y: -30 });
		expect(hit!.point.x).toBeCloseTo(100, 9);
		expect(hit!.point.y).toBeCloseTo(0, 9);
		expect(hit!.arcLength).toBeCloseTo(100, 9);
	});

	it("projects onto the closing segment back to the start", () => {
		const hit = closestPointOnContour(rect, { x: -5, y: 20 });
		expect(hit!.point.x).toBeCloseTo(0, 9);
		expect(hit!.point.y).toBeCloseTo(20, 9);
		// Edge 3 runs from (0,50) at s=250 back to (0,0) at s=300.
		expect(hit!.arcLength).toBeCloseTo(280, 9);
	});

	it("handles a point inside the contour", () => {
		const hit = closestPointOnContour(rect, { x: 50, y: 10 });
		expect(hit!.point.y).toBeCloseTo(0, 9);
		expect(hit!.distance).toBeCloseTo(10, 9);
	});

	it("round-trips a position through pointAtArcLength", () => {
		const { lengths, total } = arcLengths(rect);
		for (const fraction of [0.05, 0.25, 0.5, 0.77, 0.99]) {
			const point = pointAtArcLength(rect, lengths, total, fraction * total);
			const hit = closestPointOnContour(rect, point);
			expect(hit!.fraction).toBeCloseTo(fraction, 6);
		}
	});

	it("returns null for a degenerate contour", () => {
		expect(closestPointOnContour([{ x: 0, y: 0 }], { x: 1, y: 1 })).toBeNull();
	});
});

describe("primaryContour", () => {
	it("picks the contour with the longest perimeter", () => {
		const small = [
			{ x: 0, y: 0 },
			{ x: 1, y: 0 },
			{ x: 1, y: 1 },
		];
		const large = [
			{ x: 0, y: 0 },
			{ x: 10, y: 0 },
			{ x: 10, y: 10 },
		];
		expect(primaryContour([small, large])).toBe(large);
		expect(primaryContour([large, small])).toBe(large);
	});

	it("returns null when there is nothing to pick", () => {
		expect(primaryContour([])).toBeNull();
	});
});

describe("arc length helpers", () => {
	const square = [
		{ x: 0, y: 0 },
		{ x: 10, y: 0 },
		{ x: 10, y: 10 },
		{ x: 0, y: 10 },
	];

	it("measures the closed perimeter", () => {
		expect(perimeter(square)).toBeCloseTo(40, 9);
	});

	it("walks to the right point at a given arc length", () => {
		const { lengths, total } = arcLengths(square);
		expect(total).toBeCloseTo(40, 9);

		const quarter = pointAtArcLength(square, lengths, total, 5);
		expect(quarter.x).toBeCloseTo(5, 9);
		expect(quarter.y).toBeCloseTo(0, 9);

		const threeQuarters = pointAtArcLength(square, lengths, total, 25);
		expect(threeQuarters.x).toBeCloseTo(5, 9);
		expect(threeQuarters.y).toBeCloseTo(10, 9);
	});

	it("wraps past the end of the contour", () => {
		const { lengths, total } = arcLengths(square);
		const wrapped = pointAtArcLength(square, lengths, total, 45);
		expect(wrapped.x).toBeCloseTo(5, 9);
		expect(wrapped.y).toBeCloseTo(0, 9);
	});
});
