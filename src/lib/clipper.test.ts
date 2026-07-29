import { describe, expect, it } from "vitest";

import { offsetContours, unionContours } from "./clipper";
import { boundsOf, type Contour, signedArea } from "./geometry";

/** Axis-aligned rectangle, counter-clockwise in a Y-up frame. */
const rect = (
	x: number,
	y: number,
	w: number,
	h: number,
	clockwise = false,
): Contour => {
	const points = [
		{ x, y },
		{ x: x + w, y },
		{ x: x + w, y: y + h },
		{ x, y: y + h },
	];
	return clockwise ? points.reverse() : points;
};

const totalArea = (contours: Contour[]): number =>
	contours.reduce((sum, c) => sum + Math.abs(signedArea(c)), 0);

describe("unionContours", () => {
	it("keeps a counter open — the hole in an 'o'", () => {
		// Outer CCW with an inner ring wound the opposite way: exactly how a
		// glyph with a counter arrives from opentype.
		const glyph = [rect(0, 0, 20, 20), rect(6, 6, 8, 8, true)];
		const merged = unionContours(glyph);

		expect(merged).toHaveLength(2);
		// 400 outer − 64 hole; summing absolute areas gives outer + hole back.
		expect(totalArea(merged)).toBeCloseTo(400 + 64, 3);
	});

	it("merges overlapping same-wound shapes into one region", () => {
		// This is what the non-zero fill rule buys us. Under even-odd the
		// overlap would become a hole, and the cutter would carve a notch
		// through the middle of two touching letters.
		const overlapping = [rect(0, 0, 10, 10), rect(5, 0, 10, 10)];
		const merged = unionContours(overlapping);

		expect(merged).toHaveLength(1);
		expect(totalArea(merged)).toBeCloseTo(150, 3);

		const bounds = boundsOf(merged);
		expect(bounds.minX).toBeCloseTo(0, 3);
		expect(bounds.maxX).toBeCloseTo(15, 3);
	});
});

describe("offsetContours", () => {
	it("grows a shape outward by the offset on every side", () => {
		const grown = offsetContours([rect(0, 0, 20, 10)], 2);
		const bounds = boundsOf(grown);

		expect(bounds.minX).toBeCloseTo(-2, 2);
		expect(bounds.maxX).toBeCloseTo(22, 2);
		expect(bounds.minY).toBeCloseTo(-2, 2);
		expect(bounds.maxY).toBeCloseTo(12, 2);
	});

	it("shrinks a shape inward", () => {
		const shrunk = offsetContours([rect(0, 0, 20, 10)], -2);
		const bounds = boundsOf(shrunk);

		expect(bounds.minX).toBeCloseTo(2, 2);
		expect(bounds.maxX).toBeCloseTo(18, 2);
	});

	it("returns nothing once the shape is consumed", () => {
		// The pocket and V-carve loops both use this as their stop condition.
		expect(offsetContours([rect(0, 0, 10, 10)], -6)).toEqual([]);
	});

	it("shrinks the outer and grows the counter together", () => {
		const glyph = [rect(0, 0, 20, 20), rect(6, 6, 8, 8, true)];
		const inset = offsetContours(glyph, -1);

		expect(inset).toHaveLength(2);

		const areas = inset.map((c) => Math.abs(signedArea(c))).sort((a, b) => b - a);
		// Outer 20×20 → 18×18; hole 8×8 → 10×10 (corners rounded, so slightly less).
		expect(areas[0]).toBeCloseTo(324, 0);
		expect(areas[1]).toBeGreaterThan(64);
		expect(areas[1]).toBeLessThanOrEqual(100);
	});
});
