/**
 * The Simple Signs parameter model — the single source of truth the UI edits
 * and the toolpath generators read. Everything here is in millimetres and
 * degrees regardless of the display units; conversion happens only at the
 * UI boundary (see `unitsScale`) and in the G-code emitter.
 */

export type Units = "mm" | "in";

export type BlankShape = "rectangle" | "rounded-rect" | "ellipse" | "boat";

export type TextStrategy = "pocket" | "outline" | "engrave";

/** Which side of the glyph outline the cutter rides on for `outline`. */
export type OutlineSide = "outside" | "inside" | "on-line";

export type Align = "left" | "center" | "right";

/** Where machine zero sits relative to the blank. */
export type OriginMode = "center" | "lower-left";

export type Blank = {
	shape: BlankShape;
	/** Bounding width in mm. For an ellipse this is the full major/minor axis. */
	width: number;
	height: number;
	/** Corner radius in mm; only used by `rounded-rect`. */
	cornerRadius: number;
	/** How deep the profile cut goes. Usually stock thickness plus a little. */
	depth: number;
	stockThickness: number;
	/** When false the blank is layout-only and no profile toolpath is emitted. */
	cutProfile: boolean;
};

export type TextSpec = {
	content: string;
	/** Key into the font registry — the face's postscript name. */
	fontKey: string | null;
	/** Em size in mm. */
	size: number;
	/** Extra space between glyphs, in mm. */
	letterSpacing: number;
	/** Line height as a multiple of the em size. */
	lineSpacing: number;
	align: Align;
	/** Offset of the text block anchor from the blank centre, in mm, y-up. */
	x: number;
	y: number;
	depth: number;
	strategy: TextStrategy;
	outlineSide: OutlineSide;
};

export type Tool = {
	endmillDiameter: number;
	feedrate: number;
	plungeRate: number;
	spindleRpm: number;
	/** Retract height above the stock top, in mm. */
	safeZ: number;
	/** Max depth of cut per pass, in mm. */
	stepdown: number;
	/** Stepover as a fraction of tool diameter (0–1). */
	stepover: number;
	/** Seconds to dwell after spindle start; 0 disables the G4. */
	spindleDwell: number;
};

export type Tabs = {
	enabled: boolean;
	/**
	 * Tab centres as fractions of the profile perimeter, 0 ≤ p < 1.
	 *
	 * Fractions rather than millimetres so tabs stay proportionally placed when
	 * the blank is resized, or when a change of tool diameter moves the offset
	 * cut line. This is the single source of truth for how many tabs there are —
	 * the "count" control in the UI redistributes into this array rather than
	 * living alongside it.
	 */
	positions: number[];
	/** How tall the tab is measured up from the bottom of the cut, in mm. */
	height: number;
	/** Arc length of each tab along the contour, in mm. */
	length: number;
};

/**
 * Evenly spaced tab positions. The half-step phase offset keeps a tab off arc
 * length zero, where the cutter plunges in.
 */
export const evenTabPositions = (count: number): number[] =>
	count <= 0
		? []
		: Array.from({ length: Math.floor(count) }, (_, i) => (i + 0.5) / count);

export type Project = {
	units: Units;
	origin: OriginMode;
	blank: Blank;
	text: TextSpec;
	tool: Tool;
	tabs: Tabs;
	/**
	 * Design canvas grid spacing, in mm. Display only — the grid is a size
	 * reference to drag against, and nothing snaps to it.
	 */
	gridSpacing: number;
};

export const MM_PER_INCH = 25.4;

/** mm per display unit. Multiply a display value by this to get mm. */
export const unitsScale = (units: Units): number =>
	units === "in" ? MM_PER_INCH : 1;

export const defaultProject = (): Project => ({
	units: "mm",
	origin: "lower-left",
	blank: {
		shape: "rounded-rect",
		width: 150,
		height: 60,
		cornerRadius: 8,
		depth: 19,
		stockThickness: 18,
		cutProfile: true,
	},
	text: {
		content: "WELCOME",
		fontKey: null,
		size: 16,
		letterSpacing: 0,
		lineSpacing: 1.25,
		align: "center",
		x: 0,
		y: 0,
		depth: 3,
		strategy: "engrave",
		outlineSide: "on-line",
	},
	tool: {
		endmillDiameter: 3.175,
		feedrate: 1200,
		plungeRate: 400,
		spindleRpm: 15000,
		safeZ: 5,
		stepdown: 2,
		stepover: 0.4,
		spindleDwell: 2,
	},
	tabs: {
		enabled: true,
		positions: evenTabPositions(4),
		height: 3,
		length: 8,
	},
	gridSpacing: 10,
});
