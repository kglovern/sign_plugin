/**
 * Text layout: a string plus a font becomes positioned glyph contours.
 *
 * This is the one place the coordinate flip happens. opentype.js emits
 * SVG-convention coordinates (Y down, baseline at y=0, glyphs extending to
 * negative y); everything downstream works in **design space** — millimetres,
 * Y up, origin at the centre of the blank. Nothing past this module ever sees
 * a Y-down coordinate.
 */

import type { Font } from "opentype.js";

import { unionContours } from "./clipper";
import { flattenCommands } from "./flatten";
import { boundsOf, type Bounds, type Contour, translateContours } from "./geometry";
import type { TextSpec } from "./project";

export type TextLayout = {
	/** Glyph outlines in design space, already unioned. */
	contours: Contour[];
	bounds: Bounds;
	lineCount: number;
};

export const EMPTY_LAYOUT: TextLayout = {
	contours: [],
	bounds: boundsOf([]),
	lineCount: 0,
};

/**
 * opentype's `letterSpacing` render option is expressed in em units, but the
 * project model stores millimetres so the value stays meaningful when the user
 * changes text size. Convert here.
 */
const renderOptions = (spec: TextSpec) => ({
	kerning: true,
	...(spec.letterSpacing !== 0 && spec.size > 0
		? { letterSpacing: spec.letterSpacing / spec.size }
		: {}),
});

/**
 * Lays out `spec.content` and positions the block so its bounding-box centre
 * sits at (`spec.x`, `spec.y`). Centring on the bounding box — rather than on
 * the typographic advance — is what makes dragging the block on the canvas feel
 * right: what you see is what you move.
 */
export const layoutText = (font: Font, spec: TextSpec): TextLayout => {
	const lines = spec.content.split(/\r?\n/);
	if (spec.size <= 0 || lines.every((l) => l.trim() === "")) {
		return EMPTY_LAYOUT;
	}

	const options = renderOptions(spec);
	const lineHeight = spec.size * spec.lineSpacing;

	// Advance widths drive horizontal justification: using the typographic
	// advance rather than the inked bounding box keeps ragged edges looking
	// aligned the way a text editor would show them.
	const widths = lines.map((line) =>
		line === "" ? 0 : font.getAdvanceWidth(line, spec.size, options),
	);
	const widest = Math.max(...widths);

	const collected: Contour[] = [];
	lines.forEach((line, index) => {
		if (line === "") return;

		const slack = widest - widths[index];
		const dx =
			spec.align === "left" ? 0 : spec.align === "right" ? slack : slack / 2;

		// Baseline of line `index`, in opentype's Y-down frame.
		const path = font.getPath(line, dx, index * lineHeight, spec.size, options);
		collected.push(...flattenCommands(path.commands));
	});

	if (collected.length === 0) return EMPTY_LAYOUT;

	// Flip to Y-up. A uniform flip reverses every contour's winding together,
	// so outers and counters stay opposite and non-zero fill still works.
	const flipped = collected.map((contour) =>
		contour.map((p) => ({ x: p.x, y: -p.y })),
	);

	// Union before positioning: overlapping glyphs (tight spacing, script
	// fonts) must become one region, or offsetting would re-cut the overlap.
	const merged = unionContours(flipped);
	if (merged.length === 0) return EMPTY_LAYOUT;

	const raw = boundsOf(merged);
	const centreX = (raw.minX + raw.maxX) / 2;
	const centreY = (raw.minY + raw.maxY) / 2;

	const positioned = translateContours(
		merged,
		spec.x - centreX,
		spec.y - centreY,
	);

	return {
		contours: positioned,
		bounds: boundsOf(positioned),
		lineCount: lines.length,
	};
};
