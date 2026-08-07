/**
 * Thin wrapper over clipper-lib. Two things it exists to hide:
 *
 *  1. Clipper is integer-only, so every coordinate is scaled by `SCALE` on the
 *     way in and divided on the way out.
 *  2. Fill rule. Glyph counters — the hole in an `o`, the two in a `B` — are
 *     subpaths wound opposite to their outer. Under the even-odd rule a union
 *     collapses them; under **non-zero** they survive. Every boolean here uses
 *     non-zero, and callers never get to choose wrong.
 */

import ClipperLib from "clipper-lib";

import type { Contour } from "./geometry";

/** 1e4 → 0.1 µm resolution, comfortably below any machine's resolution. */
const SCALE = 1e4;

type IntPoint = { X: number; Y: number };

const toClipper = (contours: Contour[]): IntPoint[][] =>
	contours
		.filter((c) => c.length >= 3)
		.map((c) =>
			c.map((p) => ({
				X: Math.round(p.x * SCALE),
				Y: Math.round(p.y * SCALE),
			})),
		);

const fromClipper = (paths: IntPoint[][]): Contour[] =>
	paths
		.filter((p) => p.length >= 3)
		.map((p) => p.map((pt) => ({ x: pt.X / SCALE, y: pt.Y / SCALE })));

const NON_ZERO = ClipperLib.PolyFillType.pftNonZero;

/**
 * Offsets closed contours by `delta` mm. Positive grows, negative shrinks.
 * Returns `[]` once the shape has been eaten away entirely — which is exactly
 * the termination condition the pocket strategy relies on.
 */
export const offsetContours = (
	contours: Contour[],
	delta: number,
): Contour[] => {
	if (contours.length === 0) return [];
	if (delta === 0) return contours.map((c) => [...c]);

	const co = new ClipperLib.ClipperOffset(2, 0.25);
	co.AddPaths(
		toClipper(contours),
		ClipperLib.JoinType.jtRound,
		ClipperLib.EndType.etClosedPolygon,
	);
	const solution: IntPoint[][] = [];
	co.Execute(solution, delta * SCALE);
	return fromClipper(solution);
};

const boolean = (
	subject: Contour[],
	clip: Contour[],
	op: number,
): Contour[] => {
	const clipper = new ClipperLib.Clipper();
	clipper.AddPaths(toClipper(subject), ClipperLib.PolyType.ptSubject, true);
	if (clip.length > 0) {
		clipper.AddPaths(toClipper(clip), ClipperLib.PolyType.ptClip, true);
	}
	const solution: IntPoint[][] = [];
	clipper.Execute(op, solution, NON_ZERO, NON_ZERO);
	return fromClipper(solution);
};

/**
 * Normalises a set of contours into non-overlapping regions under the non-zero
 * rule. Run this on raw glyph outlines before offsetting: overlapping letters
 * (tight letter spacing, script fonts) would otherwise offset as separate
 * shapes and leave the cutter re-cutting the overlap.
 */
export const unionContours = (contours: Contour[]): Contour[] =>
	contours.length === 0
		? []
		: boolean(contours, [], ClipperLib.ClipType.ctUnion);

export const differenceContours = (
	subject: Contour[],
	clip: Contour[],
): Contour[] =>
	subject.length === 0
		? []
		: boolean(subject, clip, ClipperLib.ClipType.ctDifference);

export const intersectContours = (
	subject: Contour[],
	clip: Contour[],
): Contour[] =>
	subject.length === 0 || clip.length === 0
		? []
		: boolean(subject, clip, ClipperLib.ClipType.ctIntersection);
