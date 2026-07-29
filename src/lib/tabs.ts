/**
 * Holding tabs: bridges of uncut material that stop the part from breaking
 * loose and getting thrown when the profile cut finishes.
 *
 * A tab is a span of the contour where the cutter rises to `-(depth - height)`
 * instead of going to full depth, with short ramps either side so the machine
 * is never asked to move Z instantaneously mid-cut.
 */

import {
	arcLengths,
	type Contour,
	pointAtArcLength,
	type Pt,
} from "./geometry";
import { evenTabPositions, type Tabs } from "./project";
import type { Move, Pass } from "./toolpath";

/** Ramp length is tied to tab height, giving a ~45° lead in and out. */
const rampLength = (tabs: Tabs): number =>
	Math.min(Math.max(tabs.height, 0.5), tabs.length / 2);

/**
 * Fraction of the perimeter tabs may consume before the part stops being able
 * to come free. Past this we warn — but we do not remove tabs: the positions
 * are placed by hand, and silently deleting the user's work is worse than
 * letting them cut a part held on too well.
 */
const MAX_TAB_COVERAGE = 0.6;

export type TabPlacement = {
	/** Index into `Tabs.positions`, so a canvas drag knows what it grabbed. */
	index: number;
	/** Arc-length position of the tab centre. */
	centre: number;
	/** Position as a fraction of the perimeter. */
	fraction: number;
	point: Pt;
};

/**
 * Resolves stored perimeter fractions to points on a specific contour.
 * Positions outside [0,1) are wrapped, so a drag past the seam behaves.
 */
export const placeTabs = (
	contour: Contour,
	positions: number[],
): TabPlacement[] => {
	if (contour.length < 3 || positions.length === 0) return [];
	const { lengths, total } = arcLengths(contour);
	if (total <= 0) return [];

	return positions.map((raw, index) => {
		const fraction = ((raw % 1) + 1) % 1;
		const centre = fraction * total;
		return {
			index,
			centre,
			fraction,
			point: pointAtArcLength(contour, lengths, total, centre),
		};
	});
};

/** Shortest distance between two perimeter fractions, accounting for the seam. */
export const fractionDistance = (a: number, b: number): number => {
	const d = Math.abs((((a - b) % 1) + 1) % 1);
	return Math.min(d, 1 - d);
};

/**
 * Pulls a dragged position toward an evenly spaced layout when it lands within
 * `threshold` of one, so a tidy arrangement is easy to hit without preventing
 * deliberate placement. Returns the input unchanged when nothing is in reach.
 */
export const magnetToEvenSpacing = (
	fraction: number,
	count: number,
	threshold: number,
): number => {
	if (count <= 0 || threshold <= 0) return fraction;

	let best = fraction;
	let bestDistance = threshold;
	for (const target of evenTabPositions(count)) {
		const d = fractionDistance(fraction, target);
		if (d <= bestDistance) {
			bestDistance = d;
			best = target;
		}
	}
	return best;
};

/**
 * Top of the tabs in machine Z: `height` up from the bottom of the finished
 * cut. Measured against the *final* depth, not the current pass — otherwise
 * every pass would lift by the tab height above its own depth and the cutter
 * would keep re-climbing a column of material it never needed to leave.
 */
export const tabTopZ = (totalDepth: number, tabs: Tabs): number =>
	-(totalDepth - tabs.height);

/**
 * Builds a pass around `contour` at depth `z`, lifting over tabs.
 *
 * Returns a plain constant-Z pass when this pass stays above the tab tops —
 * there is nothing to bridge until the cutter would actually breach them.
 */
export const contourToTabbedPass = (
	contour: Contour,
	z: number,
	tabs: Tabs,
	tabZ: number,
	feed: number,
	plunge: number,
	comment?: string,
): { pass: Pass | null; warnings: string[] } => {
	const warnings: string[] = [];
	if (contour.length < 3) return { pass: null, warnings };

	const { lengths, total } = arcLengths(contour);

	// Above the tab tops, or tabs taller than the cut: nothing to bridge.
	if (
		!tabs.enabled ||
		tabs.positions.length === 0 ||
		total <= 0 ||
		tabZ >= 0 ||
		z >= tabZ
	) {
		const moves: Move[] = contour.map((p) => ({ x: p.x, y: p.y, z }));
		moves.push({ x: contour[0].x, y: contour[0].y, z });
		return { pass: { moves, feed, plunge, comment }, warnings };
	}

	const ramp = rampLength(tabs);
	const span = tabs.length + 2 * ramp;
	const coverage = (span * tabs.positions.length) / total;

	if (coverage > MAX_TAB_COVERAGE) {
		warnings.push(
			`Tabs cover ${Math.round(coverage * 100)}% of the profile — the part may not come free. Use fewer or shorter tabs.`,
		);
	}

	const placements = placeTabs(contour, tabs.positions);

	// Z as a function of arc length: full depth, rising to tabZ across each tab.
	const zAt = (s: number): number => {
		let z0 = z;
		for (const { centre } of placements) {
			// Compare on the shortest wrapped distance so tabs spanning the seam
			// (arc length 0) behave like any other.
			let d = Math.abs(s - centre);
			if (d > total / 2) d = total - d;

			const flat = tabs.length / 2;
			if (d <= flat) return tabZ;
			if (d < flat + ramp) {
				const t = (d - flat) / ramp; // 0 at tab edge → 1 at ramp end
				z0 = Math.max(z0, tabZ + (z - tabZ) * t);
			}
		}
		return z0;
	};

	// Sample at every original vertex plus every tab/ramp boundary, so the
	// lifted section has exact corners instead of being smeared by vertex
	// spacing.
	const stops: number[] = [];
	for (let i = 0; i < contour.length; i += 1) stops.push(lengths[i]);
	for (const { centre } of placements) {
		const flat = tabs.length / 2;
		for (const offset of [
			-flat - ramp,
			-flat,
			flat,
			flat + ramp,
		]) {
			let s = (centre + offset) % total;
			if (s < 0) s += total;
			stops.push(s);
		}
	}

	const ordered = [...new Set(stops.map((s) => Number(s.toFixed(6))))].sort(
		(a, b) => a - b,
	);

	const moves: Move[] = ordered.map((s) => {
		const p = pointAtArcLength(contour, lengths, total, s);
		return { x: p.x, y: p.y, z: zAt(s) };
	});

	// Close the loop back to the first sampled point.
	if (moves.length > 0) {
		moves.push({ ...moves[0] });
	}

	return { pass: { moves, feed, plunge, comment }, warnings };
};
