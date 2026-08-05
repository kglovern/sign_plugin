/**
 * Ready-made answers for the guided workflow.
 *
 * The wizard's job is to let a first-time user tap their way to a cut without
 * knowing what a stepover is, which means most of its controls offer a short
 * list of good values rather than an empty number box. Those lists live here,
 * as plain data over the same millimetre model everything else uses.
 *
 * Everything in this module is pure, so the wizard's "sensible default" logic
 * stays testable without a DOM.
 */

import type { Font } from "opentype.js";

import { type Bounds, boundsSize, isEmptyBounds } from "./geometry";
import {
	type Blank,
	type BlankShape,
	MM_PER_INCH,
	type TextSpec,
	type Tool,
} from "./project";
import { layoutText } from "./text";

// --- Cutters -----------------------------------------------------------------

export type BitPreset = {
	/** What the bit is sold as — the label the user recognises. */
	label: string;
	diameter: number;
};

/**
 * Router bits are bought by fractional inch, so they are labelled that way even
 * in a metric workspace; the millimetre equivalent is shown as subtext instead.
 * A user standing at the machine is reading the shank, not converting units.
 */
export const BIT_PRESETS: BitPreset[] = [
	{ label: '1/16"', diameter: MM_PER_INCH / 16 },
	{ label: '1/8"', diameter: MM_PER_INCH / 8 },
	{ label: '3/16"', diameter: (MM_PER_INCH * 3) / 16 },
	{ label: '1/4"', diameter: MM_PER_INCH / 4 },
];

export const VBIT_DIAMETER_PRESETS: BitPreset[] = [
	{ label: '1/4"', diameter: MM_PER_INCH / 4 },
	{ label: '1/2"', diameter: MM_PER_INCH / 2 },
];

export const VBIT_ANGLE_PRESETS: { label: string; angle: number }[] = [
	{ label: "30°", angle: 30 },
	{ label: "60°", angle: 60 },
	{ label: "90°", angle: 90 },
];

/**
 * How close a stored diameter must be to a preset to count as that preset.
 * Loose enough to absorb the float noise of an inch round-trip through the
 * display units, tight enough that 3mm never reads as 1/8" (3.175mm).
 */
export const BIT_TOLERANCE_MM = 0.01;

export const matchBitPreset = (
	diameter: number,
	presets: BitPreset[] = BIT_PRESETS,
): BitPreset | null =>
	presets.find((p) => Math.abs(p.diameter - diameter) <= BIT_TOLERANCE_MM) ??
	null;

// --- Sign sizes --------------------------------------------------------------

export type SizePreset = { label: string; width: number; height: number };

const inches = (value: number): number => value * MM_PER_INCH;

export const SIGN_SIZE_PRESETS: SizePreset[] = [
	{ label: '6 × 3"', width: inches(6), height: inches(3) },
	{ label: '9 × 4"', width: inches(9), height: inches(4) },
	{ label: '12 × 5"', width: inches(12), height: inches(5) },
	{ label: '18 × 8"', width: inches(18), height: inches(8) },
];

/** Sizes are compared at 0.5mm — well inside the gap between any two presets. */
const SIZE_TOLERANCE_MM = 0.5;

export const matchSizePreset = (
	width: number,
	height: number,
): SizePreset | null =>
	SIGN_SIZE_PRESETS.find(
		(p) =>
			Math.abs(p.width - width) <= SIZE_TOLERANCE_MM &&
			Math.abs(p.height - height) <= SIZE_TOLERANCE_MM,
	) ?? null;

/**
 * How far past the stock the profile cut should reach. The old panel exposed
 * profile depth as its own field and told the user in a tooltip to set it a
 * little past the thickness; the wizard just does it.
 */
export const PROFILE_OVERCUT_MM = 1;

export const profileDepthFor = (stockThickness: number): number =>
	Math.max(stockThickness, 0) + PROFILE_OVERCUT_MM;

// --- Feeds and speeds --------------------------------------------------------

export type FeedPreset = {
	id: string;
	label: string;
	hint: string;
	/** mm/min. */
	feedrate: number;
	plungeRate: number;
	spindleRpm: number;
	/** mm. */
	stepdown: number;
};

/**
 * Softwood matches the project defaults, so an untouched project shows as
 * "Softwood" rather than as nothing selected. "Take it easy" is deliberately
 * the timid option — the right answer for a first cut on an unknown machine,
 * where a slow pass that finishes beats a fast one that stalls.
 */
export const FEED_PRESETS: FeedPreset[] = [
	{
		id: "softwood",
		label: "Softwood",
		hint: "Pine, cedar, plywood",
		feedrate: 1200,
		plungeRate: 400,
		spindleRpm: 15000,
		stepdown: 2,
	},
	{
		id: "hardwood",
		label: "Hardwood",
		hint: "Oak, maple, walnut",
		feedrate: 800,
		plungeRate: 250,
		spindleRpm: 18000,
		stepdown: 1.2,
	},
	{
		id: "gentle",
		label: "Take it easy",
		hint: "Slow and safe — good for a first cut",
		feedrate: 700,
		plungeRate: 200,
		spindleRpm: 14000,
		stepdown: 1,
	},
];

/** Feeds are whole numbers in practice; 1mm/min of slack absorbs unit noise. */
const FEED_TOLERANCE = 1;

export const matchFeedPreset = (tool: Tool): FeedPreset | null =>
	FEED_PRESETS.find(
		(p) =>
			Math.abs(p.feedrate - tool.feedrate) <= FEED_TOLERANCE &&
			Math.abs(p.plungeRate - tool.plungeRate) <= FEED_TOLERANCE &&
			Math.abs(p.spindleRpm - tool.spindleRpm) <= FEED_TOLERANCE &&
			Math.abs(p.stepdown - tool.stepdown) <= 0.01,
	) ?? null;

// --- Fitting and aligning the text ------------------------------------------

/**
 * Fraction of the blank left empty around the text when fitting or aligning.
 *
 * Shapes are fitted against their bounding box, which is the whole story for a
 * rectangle and a considerable lie for anything curved: an ellipse's corners
 * are outside the shape, and the tugboat's usable deck is a fraction of its
 * box. Bigger margins on those shapes keep "Fit to sign" from putting letters
 * over the edge.
 */
export const fitMarginFor = (shape: BlankShape): number => {
	switch (shape) {
		case "rectangle":
		case "rounded-rect":
			return 0.1;
		case "ellipse":
			return 0.2;
		case "boat":
			return 0.28;
	}
};

/**
 * The text size that makes the block fill the blank, less its margin.
 *
 * `layoutText` is very nearly linear in `size` — line spacing is a multiple of
 * it and glyph outlines scale with it; only the absolute `letterSpacing` breaks
 * the proportion — so scaling by the measured overshoot converges in one step
 * and the extra iterations only matter for wide letter spacing.
 */
export const fitTextSize = (
	font: Font,
	spec: TextSpec,
	blank: Blank,
	margin: number = fitMarginFor(blank.shape),
): number => {
	const targetWidth = blank.width * (1 - 2 * margin);
	const targetHeight = blank.height * (1 - 2 * margin);
	if (targetWidth <= 0 || targetHeight <= 0) return spec.size;

	let size = spec.size > 0 ? spec.size : 10;

	for (let i = 0; i < 4; i += 1) {
		const { width, height } = boundsSize(layoutText(font, { ...spec, size }).bounds);
		if (width <= 0 || height <= 0) return spec.size;

		const factor = Math.min(targetWidth / width, targetHeight / height);
		size *= factor;
		if (Math.abs(factor - 1) < 0.002) break;
	}

	// Round down so a rounding error can never push the fitted text back over
	// the margin it was just fitted inside.
	return Math.max(Math.floor(size * 100) / 100, 0.01);
};

export type AlignTarget = "centre" | "top" | "bottom" | "left" | "right";

/**
 * Where to move the text block so it sits against one edge of the blank, or
 * back in the middle.
 *
 * `layoutText` centres the block's bounding box on (`x`, `y`), so the offset is
 * just half the blank minus half the text, and only the axis being aligned
 * moves — nudging text to the top should not also recentre it horizontally.
 */
export const alignTextOffset = (
	target: AlignTarget,
	textBounds: Bounds,
	blank: Blank,
	current: { x: number; y: number },
	margin: number = fitMarginFor(blank.shape),
): { x: number; y: number } => {
	if (target === "centre") return { x: 0, y: 0 };
	if (isEmptyBounds(textBounds)) return current;

	const { width, height } = boundsSize(textBounds);
	// Text wider than the blank clamps to the centre rather than being pushed
	// off the edge — negating a clamped zero is what would otherwise put a
	// stray -0 into the project.
	const zeroed = (value: number) => (value === 0 ? 0 : value);
	const insetX = Math.max(blank.width / 2 - blank.width * margin - width / 2, 0);
	const insetY = Math.max(
		blank.height / 2 - blank.height * margin - height / 2,
		0,
	);

	switch (target) {
		case "top":
			return { x: current.x, y: insetY };
		case "bottom":
			return { x: current.x, y: zeroed(-insetY) };
		case "left":
			return { x: zeroed(-insetX), y: current.y };
		case "right":
			return { x: insetX, y: current.y };
	}
};
