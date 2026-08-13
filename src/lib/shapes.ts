/**
 * Sign blank outlines, in design space (mm, Y up, origin at the blank centre).
 *
 * Everything is emitted as a closed polygon wound counter-clockwise so the
 * blank and the glyph outlines share a convention before they reach clipper.
 */

import type { PathCommand } from "opentype.js";

import { flattenCommands } from "./flatten";
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

/** Fixed corner radius, mm — no longer user-configurable. */
const CORNER_RADIUS_MM = 8;

const roundedRect = (width: number, height: number): Contour => {
	const hw = width / 2;
	const hh = height / 2;
	// A radius over half the short side is geometrically impossible on a small
	// blank; clamp rather than reject so a tiny blank never breaks the preview.
	const r = Math.max(0, Math.min(CORNER_RADIUS_MM, Math.min(hw, hh)));
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

/**
 * Tugboat silhouette — a nod to 3DBenchy, the boat every 3D printer prints
 * first, as the equivalent "first thing you cut" on a CNC.
 *
 * Authored in a natural 220 x 100 box so the numbers below read as the actual
 * drawing at roughly 2.2:1, then normalised and stretched to the blank's width
 * and height like every other shape. A square blank therefore gives a tall,
 * squat tug — the accepted cost of stretch-to-fit.
 *
 * Traced counter-clockwise from the stern bottom, matching the winding of the
 * analytic shapes above. All four extremes are touched exactly (x at 0 and 220,
 * y at 0 and 100) so the flattened contour's bounds come out as precisely
 * width x height. Both Bezier control hulls sit inside the box, so no curve can
 * overshoot an extreme — keep that true if these points are ever retuned.
 */
const BOAT_DESIGN_WIDTH = 220;
const BOAT_DESIGN_HEIGHT = 100;

const BOAT_COMMANDS: PathCommand[] = [
	{ type: "M", x: 20, y: 6 }, // stern, bottom
	{ type: "L", x: 36, y: 0 }, // keel, aft end
	{ type: "L", x: 128, y: 0 }, // flat keel                        <- y min
	{ type: "C", x1: 156, y1: 0, x2: 184, y2: 14, x: 204, y: 40 }, // forefoot
	{ type: "L", x: 220, y: 66 }, // stem head, well above the deck  <- x max
	{ type: "L", x: 196, y: 58 }, // inboard face of the stem
	{ type: "Q", x1: 176, y1: 48, x: 142, y: 46 }, // foredeck, with a little sheer
	{ type: "L", x: 142, y: 80 }, // up the cabin's forward face
	{ type: "L", x: 134, y: 80 }, // roof, to the chimney
	{ type: "L", x: 134, y: 100 }, // chimney, forward face          <- y max
	{ type: "L", x: 112, y: 100 }, // across the chimney top
	{ type: "L", x: 112, y: 80 }, // back down to the roof
	{ type: "L", x: 76, y: 80 }, // roof, running aft
	{ type: "L", x: 76, y: 46 }, // down the cabin's aft face
	{ type: "L", x: 14, y: 46 }, // aft deck
	{ type: "L", x: 0, y: 38 }, // stern, top                        <- x min
	{ type: "C", x1: 0, y1: 20, x2: 8, y2: 8, x: 20, y: 6 }, // rounded stern
	{ type: "Z" },
];

/**
 * Maps the design-box commands into millimetres, centred on the origin.
 *
 * Scaling happens *before* flattening because the chord tolerance is absolute:
 * flattening in normalised space and scaling afterwards would multiply a 0.01
 * tolerance up to 1.5mm on a 150mm blank.
 */
const scaleBoatCommands = (width: number, height: number): PathCommand[] => {
	const sx = width / BOAT_DESIGN_WIDTH;
	const sy = height / BOAT_DESIGN_HEIGHT;
	const mapX = (x: number) => x * sx - width / 2;
	const mapY = (y: number) => y * sy - height / 2;

	return BOAT_COMMANDS.map((cmd) => {
		switch (cmd.type) {
			case "M":
			case "L":
				return { ...cmd, x: mapX(cmd.x), y: mapY(cmd.y) };
			case "Q":
				return {
					...cmd,
					x1: mapX(cmd.x1),
					y1: mapY(cmd.y1),
					x: mapX(cmd.x),
					y: mapY(cmd.y),
				};
			case "C":
				return {
					...cmd,
					x1: mapX(cmd.x1),
					y1: mapY(cmd.y1),
					x2: mapX(cmd.x2),
					y2: mapY(cmd.y2),
					x: mapX(cmd.x),
					y: mapY(cmd.y),
				};
			case "Z":
				return cmd;
		}
	});
};

const boat = (width: number, height: number): Contour => {
	// `flattenCommands` already does adaptive subdivision to the same chord
	// tolerance the glyph outlines use, and closes the subpath for us.
	const contours = flattenCommands(scaleBoatCommands(width, height));
	return contours[0] ?? [];
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
			return roundedRect(width, height);
		case "ellipse":
			return ellipse(width, height);
		case "boat":
			return boat(width, height);
	}
};

/** Convenience for callers that want the blank as a contour list. */
export const blankContours = (blank: Blank): Contour[] => {
	const contour = blankContour(blank);
	return contour.length >= 3 ? [contour] : [];
};
