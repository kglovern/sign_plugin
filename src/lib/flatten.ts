/**
 * Converts opentype.js path commands into closed polygon contours by adaptively
 * subdividing the Bézier segments until each is flat to within a chord
 * tolerance. Working in polygons from here on keeps offsetting (clipper) and
 * G-code emission simple — no curve fitting anywhere downstream.
 */

import type { PathCommand } from "opentype.js";

import { type Contour, dedupe, type Pt } from "./geometry";

/** Max chord deviation, in the same units as the incoming coordinates. */
export const DEFAULT_TOLERANCE_MM = 0.01;

/** Guard against pathological curves recursing forever. */
const MAX_DEPTH = 18;

/** Perpendicular distance from `p` to the line through `a` and `b`. */
const distanceToLine = (p: Pt, a: Pt, b: Pt): number => {
	const dx = b.x - a.x;
	const dy = b.y - a.y;
	const lenSq = dx * dx + dy * dy;
	if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
	return Math.abs(dy * (p.x - a.x) - dx * (p.y - a.y)) / Math.sqrt(lenSq);
};

const midpoint = (a: Pt, b: Pt): Pt => ({
	x: (a.x + b.x) / 2,
	y: (a.y + b.y) / 2,
});

/**
 * Emits the interior points of a cubic, excluding p0 (already emitted) and
 * including p3. Flatness test: both control points close to the chord.
 */
const flattenCubic = (
	p0: Pt,
	p1: Pt,
	p2: Pt,
	p3: Pt,
	tolerance: number,
	out: Pt[],
	depth = 0,
): void => {
	const deviation = Math.max(
		distanceToLine(p1, p0, p3),
		distanceToLine(p2, p0, p3),
	);
	if (depth >= MAX_DEPTH || deviation <= tolerance) {
		out.push(p3);
		return;
	}

	// de Casteljau split at t = 0.5
	const p01 = midpoint(p0, p1);
	const p12 = midpoint(p1, p2);
	const p23 = midpoint(p2, p3);
	const p012 = midpoint(p01, p12);
	const p123 = midpoint(p12, p23);
	const mid = midpoint(p012, p123);

	flattenCubic(p0, p01, p012, mid, tolerance, out, depth + 1);
	flattenCubic(mid, p123, p23, p3, tolerance, out, depth + 1);
};

const flattenQuadratic = (
	p0: Pt,
	p1: Pt,
	p2: Pt,
	tolerance: number,
	out: Pt[],
	depth = 0,
): void => {
	if (depth >= MAX_DEPTH || distanceToLine(p1, p0, p2) <= tolerance) {
		out.push(p2);
		return;
	}

	const p01 = midpoint(p0, p1);
	const p12 = midpoint(p1, p2);
	const mid = midpoint(p01, p12);

	flattenQuadratic(p0, p01, mid, tolerance, out, depth + 1);
	flattenQuadratic(mid, p12, p2, tolerance, out, depth + 1);
};

/**
 * Flattens a command list into closed contours.
 *
 * Glyph subpaths are always closed, but fonts are not always well-behaved, so
 * an unterminated subpath (no trailing `Z`) is closed implicitly rather than
 * dropped. Contours with fewer than 3 distinct points carry no area and are
 * discarded — they would only confuse clipper.
 */
export const flattenCommands = (
	commands: PathCommand[],
	tolerance: number = DEFAULT_TOLERANCE_MM,
): Contour[] => {
	const contours: Contour[] = [];
	let current: Pt[] = [];
	let cursor: Pt = { x: 0, y: 0 };
	let subpathStart: Pt = { x: 0, y: 0 };

	const finish = () => {
		if (current.length > 0) {
			const contour = dedupe(current);
			if (contour.length >= 3) contours.push(contour);
		}
		current = [];
	};

	for (const cmd of commands) {
		switch (cmd.type) {
			case "M": {
				finish();
				cursor = { x: cmd.x, y: cmd.y };
				subpathStart = cursor;
				current = [cursor];
				break;
			}
			case "L": {
				cursor = { x: cmd.x, y: cmd.y };
				current.push(cursor);
				break;
			}
			case "C": {
				const end = { x: cmd.x, y: cmd.y };
				flattenCubic(
					cursor,
					{ x: cmd.x1, y: cmd.y1 },
					{ x: cmd.x2, y: cmd.y2 },
					end,
					tolerance,
					current,
				);
				cursor = end;
				break;
			}
			case "Q": {
				const end = { x: cmd.x, y: cmd.y };
				flattenQuadratic(
					cursor,
					{ x: cmd.x1, y: cmd.y1 },
					end,
					tolerance,
					current,
				);
				cursor = end;
				break;
			}
			case "Z": {
				finish();
				cursor = subpathStart;
				break;
			}
		}
	}

	// Trailing subpath with no explicit close.
	finish();
	return contours;
};
