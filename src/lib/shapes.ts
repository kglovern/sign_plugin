/**
 * Sign blank outlines, in design space (mm, Y up, origin at the blank centre).
 *
 * Everything is emitted as a closed polygon wound counter-clockwise so the
 * blank and the glyph outlines share a convention before they reach clipper.
 */

import type { Blank, BlankShape } from "./project";
import type { Contour } from "./geometry";

/** Chord tolerance for approximating arcs, in mm. Matches `flatten.ts`. */
const ARC_TOLERANCE_MM = 0.01;

/**
 * Segment count for an arc of `sweep` radians at `radius`, chosen so the chord
 * error stays under tolerance. Clamped so tiny radii stay cheap and large ones
 * stay smooth.
 */
const segmentsForArc = (radius: number, sweep: number): number => {
	if (radius <= 0) return 1;
	const maxAngle = 2 * Math.acos(Math.max(-1, 1 - ARC_TOLERANCE_MM / radius));
	const count = Math.ceil(sweep / Math.max(maxAngle, 1e-6));
	return Math.min(Math.max(count, 2), 512);
};

const arcPoints = (
	cx: number,
	cy: number,
	radius: number,
	startAngle: number,
	sweep: number,
): Contour => {
	const steps = segmentsForArc(radius, Math.abs(sweep));
	const points: Contour = [];
	for (let i = 0; i <= steps; i += 1) {
		const a = startAngle + (sweep * i) / steps;
		points.push({ x: cx + radius * Math.cos(a), y: cy + radius * Math.sin(a) });
	}
	return points;
};

const rectangle = (width: number, height: number): Contour => {
	const hw = width / 2;
	const hh = height / 2;
	return [
		{ x: -hw, y: -hh },
		{ x: hw, y: -hh },
		{ x: hw, y: hh },
		{ x: -hw, y: hh },
	];
};

const roundedRect = (
	width: number,
	height: number,
	cornerRadius: number,
): Contour => {
	const hw = width / 2;
	const hh = height / 2;
	// A radius over half the short side is geometrically impossible; clamp
	// rather than reject so dragging the slider never breaks the preview.
	const r = Math.max(0, Math.min(cornerRadius, Math.min(hw, hh)));
	if (r === 0) return rectangle(width, height);

	const quarter = Math.PI / 2;
	return [
		...arcPoints(hw - r, -hh + r, r, -quarter, quarter), // bottom-right
		...arcPoints(hw - r, hh - r, r, 0, quarter), // top-right
		...arcPoints(-hw + r, hh - r, r, quarter, quarter), // top-left
		...arcPoints(-hw + r, -hh + r, r, Math.PI, quarter), // bottom-left
	];
};

const ellipse = (width: number, height: number): Contour => {
	const rx = width / 2;
	const ry = height / 2;
	const steps = segmentsForArc(Math.max(rx, ry), 2 * Math.PI);
	const points: Contour = [];
	for (let i = 0; i < steps; i += 1) {
		const a = (2 * Math.PI * i) / steps;
		points.push({ x: rx * Math.cos(a), y: ry * Math.sin(a) });
	}
	return points;
};

export const blankContour = (blank: Blank): Contour => {
	const shape: BlankShape = blank.shape;
	const width = Math.max(blank.width, 0);
	const height = Math.max(blank.height, 0);
	if (width <= 0 || height <= 0) return [];

	switch (shape) {
		case "rectangle":
			return rectangle(width, height);
		case "rounded-rect":
			return roundedRect(width, height, blank.cornerRadius);
		case "ellipse":
			return ellipse(width, height);
	}
};

/** Convenience for callers that want the blank as a contour list. */
export const blankContours = (blank: Blank): Contour[] => {
	const contour = blankContour(blank);
	return contour.length >= 3 ? [contour] : [];
};
