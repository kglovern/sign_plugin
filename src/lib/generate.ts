/**
 * Top level: project + font → geometry, toolpath, and G-code.
 *
 * Also the one place the work origin is applied. Everything upstream works in
 * design space (blank-centred, Y up); the shift to machine coordinates happens
 * once, here, so no strategy has to know where the user zeroed the machine.
 */

import type { Font } from "opentype.js";

import { offsetContours } from "./clipper";
import { emitGcode } from "./gcode";
import { type Contour, primaryContour } from "./geometry";
import type { Project } from "./project";
import { blankContours } from "./shapes";
import { blankProfileToolpath, textToolpath } from "./strategies";
import { placeTabs, type TabPlacement } from "./tabs";
import { EMPTY_LAYOUT, layoutText, type TextLayout } from "./text";
import { combineToolpaths, translateToolpath, type Toolpath } from "./toolpath";

export type SignGeometry = {
	/** Blank outline in design space. */
	blank: Contour[];
	/** Glyph outlines in design space. */
	glyphs: Contour[];
	/** The offset profile line the cutter actually follows. */
	cutLine: Contour[];
	/**
	 * The contour tabs live on. The canvas projects pointer positions onto this
	 * exact contour, so a dragged marker lands where the cutter will actually
	 * lift.
	 */
	tabContour: Contour | null;
	/** Resolved tab markers, for drawing and hit-testing on the canvas. */
	tabMarkers: TabPlacement[];
	layout: TextLayout;
};

export type GenerateResult = {
	geometry: SignGeometry;
	toolpath: Toolpath;
	gcode: string;
	warnings: string[];
};

/**
 * Identity of everything the toolpath depends on.
 *
 * Generating a toolpath is expensive — up to ~130ms for a deep pocket — so it runs
 * only when the user asks for it. This signature is how the UI knows the result
 * on screen no longer matches the parameters: compare the signature captured at
 * generation time against the current one.
 *
 * Deliberately excludes `gridSpacing`: it changes how the design canvas is drawn
 * and nothing about the cut, so adjusting the grid must not invalidate a
 * perfectly good toolpath. `fontKey` is included because swapping the font
 * changes every glyph outline.
 *
 * The object is built as a literal so key order — and therefore the string — is
 * stable across calls.
 */
export const toolpathSignature = (
	project: Project,
	fontKey: string | null,
): string =>
	JSON.stringify({
		units: project.units,
		origin: project.origin,
		blank: project.blank,
		text: project.text,
		tool: project.tool,
		tabs: project.tabs,
		fontKey,
	});

/** Offset from design space to machine coordinates. */
export const originOffset = (project: Project): { dx: number; dy: number } =>
	project.origin === "lower-left"
		? { dx: project.blank.width / 2, dy: project.blank.height / 2 }
		: { dx: 0, dy: 0 };

export const buildGeometry = (
	project: Project,
	font: Font | null,
): SignGeometry => {
	const blank = blankContours(project.blank);
	const layout = font ? layoutText(font, project.text) : EMPTY_LAYOUT;

	const cutLine =
		project.blank.cutProfile && blank.length > 0
			? offsetContours(blank, project.tool.endmillDiameter / 2)
			: [];

	const tabContour = primaryContour(cutLine);

	const tabMarkers =
		project.tabs.enabled && project.blank.cutProfile && tabContour
			? placeTabs(tabContour, project.tabs.positions)
			: [];

	return {
		blank,
		glyphs: layout.contours,
		cutLine,
		tabContour,
		tabMarkers,
		layout,
	};
};

export const generate = (
	project: Project,
	font: Font | null,
): GenerateResult => {
	const geometry = buildGeometry(project, font);

	const textPath = textToolpath(geometry.glyphs, project.text, project.tool);
	const profilePath = blankProfileToolpath(
		project.blank,
		project.tool,
		project.tabs,
	);

	// Text first, then the profile: cutting the blank free before engraving it
	// would leave the part held only by tabs while the detail work happens.
	const combined = combineToolpaths([textPath, profilePath]);

	const { dx, dy } = originOffset(project);
	const toolpath = translateToolpath(combined, dx, dy);

	const notes: string[] = [];
	if (font) {
		notes.push(`Font: ${font.getEnglishName("fullName") ?? "unknown"}`);
	}
	const gcode = emitGcode(toolpath, project, { notes });

	return {
		geometry,
		toolpath,
		gcode,
		warnings: toolpath.warnings,
	};
};
