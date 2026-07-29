import { describe, expect, it } from "vitest";

import { closestPointOnContour, type Contour } from "./geometry";
import { evenTabPositions, type Tabs } from "./project";
import {
	contourToTabbedPass,
	fractionDistance,
	magnetToEvenSpacing,
	placeTabs,
	tabTopZ,
} from "./tabs";
import type { Move } from "./toolpath";

const rectangle: Contour = [
	{ x: 0, y: 0 },
	{ x: 100, y: 0 },
	{ x: 100, y: 50 },
	{ x: 0, y: 50 },
];

const PERIMETER = 300;

const tabs: Tabs = {
	enabled: true,
	positions: evenTabPositions(4),
	height: 3,
	length: 8,
};

/** Number of contiguous runs of moves sitting at the tab height. */
const liftedRuns = (moves: Move[], z: number): number => {
	let runs = 0;
	let inRun = false;
	// Drop the duplicated closing move so a tab is not counted twice.
	for (const move of moves.slice(0, -1)) {
		const lifted = Math.abs(move.z - z) < 1e-6;
		if (lifted && !inRun) runs += 1;
		inRun = lifted;
	}
	return runs;
};

describe("evenTabPositions", () => {
	it("spaces tabs evenly with a half-step phase offset", () => {
		expect(evenTabPositions(4)).toEqual([0.125, 0.375, 0.625, 0.875]);
	});

	it("keeps a tab off arc length zero, where the cutter plunges", () => {
		for (const count of [1, 2, 3, 5, 8]) {
			expect(evenTabPositions(count)).not.toContain(0);
		}
	});

	it("returns nothing for a non-positive count", () => {
		expect(evenTabPositions(0)).toEqual([]);
		expect(evenTabPositions(-2)).toEqual([]);
	});
});

describe("magnetToEvenSpacing", () => {
	it("snaps to a nearby even position", () => {
		expect(magnetToEvenSpacing(0.13, 4, 0.02)).toBeCloseTo(0.125, 9);
	});

	it("leaves a deliberate placement alone when nothing is in reach", () => {
		expect(magnetToEvenSpacing(0.25, 4, 0.02)).toBeCloseTo(0.25, 9);
	});

	it("measures distance the short way round the seam", () => {
		// 0.02 and 0.99 are 0.03 apart across arc-length zero, not 0.97 the long
		// way. Without this, a tab dragged past the start point would refuse to
		// snap to the target just behind it.
		expect(fractionDistance(0.02, 0.99)).toBeCloseTo(0.03, 9);
		expect(fractionDistance(0.99, 0.02)).toBeCloseTo(0.03, 9);
		expect(fractionDistance(0.1, 0.6)).toBeCloseTo(0.5, 9);
		expect(fractionDistance(0.4, 0.4)).toBe(0);
	});

	it("snaps to a target that sits on the far side of the seam", () => {
		// 20 tabs puts a target at 0.975. A drag that has wrapped round to 0.995
		// is 0.02 past it and must still be caught.
		expect(magnetToEvenSpacing(0.995, 20, 0.025)).toBeCloseTo(0.975, 9);
	});

	it("is a no-op with no tabs or no threshold", () => {
		expect(magnetToEvenSpacing(0.3, 0, 0.02)).toBe(0.3);
		expect(magnetToEvenSpacing(0.3, 4, 0)).toBe(0.3);
	});

	it("picks the nearest target when two are in range", () => {
		// Targets 0.125 and 0.375; 0.2 is nearer the first.
		expect(magnetToEvenSpacing(0.2, 4, 0.2)).toBeCloseTo(0.125, 9);
		expect(magnetToEvenSpacing(0.3, 4, 0.2)).toBeCloseTo(0.375, 9);
	});
});

describe("placeTabs", () => {
	it("resolves fractions to points around the contour", () => {
		const placements = placeTabs(rectangle, evenTabPositions(4));
		expect(placements).toHaveLength(4);

		placements.forEach((p, i) => {
			expect(p.index).toBe(i);
			expect(p.centre).toBeCloseTo((PERIMETER / 4) * (i + 0.5), 6);
		});

		// First tab sits a quarter-perimeter in, along the bottom edge.
		expect(placements[0].point.x).toBeCloseTo(37.5, 6);
		expect(placements[0].point.y).toBeCloseTo(0, 6);
	});

	it("honours arbitrary hand-placed positions", () => {
		const placements = placeTabs(rectangle, [0, 0.5]);
		expect(placements[0].point).toEqual({ x: 0, y: 0 });
		expect(placements[1].centre).toBeCloseTo(150, 6);
	});

	it("wraps positions that have been dragged past the seam", () => {
		const [wrapped] = placeTabs(rectangle, [1.25]);
		const [plain] = placeTabs(rectangle, [0.25]);
		expect(wrapped.fraction).toBeCloseTo(0.25, 9);
		expect(wrapped.point).toEqual(plain.point);

		const [negative] = placeTabs(rectangle, [-0.25]);
		expect(negative.fraction).toBeCloseTo(0.75, 9);
	});

	it("returns nothing when there are no positions", () => {
		expect(placeTabs(rectangle, [])).toEqual([]);
	});
});

describe("contourToTabbedPass", () => {
	const depth = 19;
	const zTop = tabTopZ(depth, tabs);

	it("puts the tab tops at the tab height above the finished depth", () => {
		expect(zTop).toBeCloseTo(-16, 9);
	});

	it("cuts a plain contour on passes above the tab tops", () => {
		const { pass } = contourToTabbedPass(rectangle, -10, tabs, zTop, 1000, 300);
		expect(pass).not.toBeNull();
		expect(pass?.moves.every((m) => m.z === -10)).toBe(true);
	});

	it("lifts over one run per stored position on the final pass", () => {
		const { pass } = contourToTabbedPass(
			rectangle,
			-depth,
			tabs,
			zTop,
			1000,
			300,
		);
		expect(pass).not.toBeNull();
		expect(liftedRuns(pass!.moves, zTop)).toBe(tabs.positions.length);
	});

	it("lifts where the user actually placed the tabs", () => {
		// Two tabs, deliberately lopsided rather than evenly spaced.
		const placed: Tabs = { ...tabs, positions: [0.25, 0.4] };
		const { pass } = contourToTabbedPass(
			rectangle,
			-depth,
			placed,
			zTop,
			1000,
			300,
		);

		const centres = placed.positions.map((p) => p * PERIMETER);
		const halfTab = placed.length / 2;

		// Recover each lifted move's position along the perimeter and check it
		// belongs to one of the tabs the user placed.
		for (const move of pass!.moves) {
			if (Math.abs(move.z - zTop) > 1e-6) continue;

			const hit = closestPointOnContour(rectangle, move);
			expect(hit).not.toBeNull();

			const nearest = Math.min(
				...centres.map((c) => {
					let d = Math.abs(hit!.arcLength - c);
					if (d > PERIMETER / 2) d = PERIMETER - d;
					return d;
				}),
			);
			expect(nearest).toBeLessThanOrEqual(halfTab + 1e-6);
		}

		expect(liftedRuns(pass!.moves, zTop)).toBe(2);
	});

	it("never cuts deeper than the requested depth", () => {
		const { pass } = contourToTabbedPass(
			rectangle,
			-depth,
			tabs,
			zTop,
			1000,
			300,
		);
		expect(Math.min(...pass!.moves.map((m) => m.z))).toBeGreaterThanOrEqual(
			-depth,
		);
	});

	it("holds each tab for the requested arc length", () => {
		const { pass } = contourToTabbedPass(
			rectangle,
			-depth,
			tabs,
			zTop,
			1000,
			300,
		);
		const moves = pass!.moves;

		let start: Move | null = null;
		let flatSpan = 0;
		for (let i = 0; i < moves.length - 1; i += 1) {
			const atTop = Math.abs(moves[i].z - zTop) < 1e-6;
			const nextAtTop = Math.abs(moves[i + 1].z - zTop) < 1e-6;
			if (atTop && !start) start = moves[i];
			if (start && atTop && !nextAtTop) {
				flatSpan = Math.hypot(moves[i].x - start.x, moves[i].y - start.y);
				break;
			}
		}
		expect(flatSpan).toBeCloseTo(tabs.length, 3);
	});

	it("ramps in and out rather than stepping Z in place", () => {
		const { pass } = contourToTabbedPass(
			rectangle,
			-depth,
			tabs,
			zTop,
			1000,
			300,
		);
		const moves = pass!.moves;

		let transitions = 0;
		for (let i = 1; i < moves.length; i += 1) {
			const dz = Math.abs(moves[i].z - moves[i - 1].z);
			if (dz < 1e-6) continue;
			transitions += 1;

			const travel = Math.hypot(
				moves[i].x - moves[i - 1].x,
				moves[i].y - moves[i - 1].y,
			);
			expect(travel).toBeGreaterThan(0);
			expect(travel).toBeCloseTo(tabs.height, 3);
		}

		expect(transitions).toBe(tabs.positions.length * 2);
	});

	it("merges tabs dragged on top of each other into one lift", () => {
		// Nothing stops the user sliding two tabs together; the result should be
		// one longer bridge, not a crash or a double-counted tab.
		const stacked: Tabs = { ...tabs, positions: [0.5, 0.505] };
		const { pass } = contourToTabbedPass(
			rectangle,
			-depth,
			stacked,
			zTop,
			1000,
			300,
		);
		expect(liftedRuns(pass!.moves, zTop)).toBe(1);
	});

	it("warns about excessive coverage without discarding placed tabs", () => {
		// Hand-placed positions are the user's work — warn, never silently drop.
		const many: Tabs = { ...tabs, positions: evenTabPositions(8) };
		const tiny: Contour = [
			{ x: 0, y: 0 },
			{ x: 6, y: 0 },
			{ x: 6, y: 6 },
			{ x: 0, y: 6 },
		];
		const { pass, warnings } = contourToTabbedPass(
			tiny,
			-depth,
			many,
			zTop,
			1000,
			300,
		);

		expect(warnings.join(" ")).toMatch(/cover/i);
		expect(pass).not.toBeNull();
		// All eight are still honoured, even though they overlap heavily.
		expect(many.positions).toHaveLength(8);
	});

	it("ignores tabs when they are disabled", () => {
		const { pass } = contourToTabbedPass(
			rectangle,
			-depth,
			{ ...tabs, enabled: false },
			zTop,
			1000,
			300,
		);
		expect(pass?.moves.every((m) => m.z === -depth)).toBe(true);
	});

	it("cuts a plain contour when every tab has been removed", () => {
		const { pass } = contourToTabbedPass(
			rectangle,
			-depth,
			{ ...tabs, positions: [] },
			zTop,
			1000,
			300,
		);
		expect(pass?.moves.every((m) => m.z === -depth)).toBe(true);
	});
});
