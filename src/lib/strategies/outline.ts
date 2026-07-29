/**
 * Outline profiling: cut around each glyph with tool compensation, so the
 * letter comes out at its designed size.
 *
 * `outside` leaves the letter standing at full size (cut the background away
 * from it); `inside` cuts the letter out as a hole at full size; `on-line` is
 * centreline with depth passes.
 */

import { offsetContours } from "../clipper";
import type { Contour } from "../geometry";
import type { TextSpec, Tool } from "../project";
import { contourToPass, depthSteps, EMPTY_TOOLPATH, type Pass, type Toolpath } from "../toolpath";

export const outlineToolpath = (
	glyphs: Contour[],
	text: TextSpec,
	tool: Tool,
): Toolpath => {
	if (glyphs.length === 0 || text.depth <= 0) return EMPTY_TOOLPATH;

	const radius = tool.endmillDiameter / 2;
	const delta =
		text.outlineSide === "outside"
			? radius
			: text.outlineSide === "inside"
				? -radius
				: 0;

	const cutLine = delta === 0 ? glyphs : offsetContours(glyphs, delta);
	const warnings: string[] = [];

	if (cutLine.length === 0) {
		return {
			...EMPTY_TOOLPATH,
			warnings: [
				`A ${tool.endmillDiameter}mm cutter is too large to profile inside these letters — try a smaller bit, larger text, or the 'on-line' side.`,
			],
		};
	}

	const passes: Pass[] = [];
	const steps = depthSteps(text.depth, tool.stepdown);

	for (const [index, z] of steps.entries()) {
		for (const contour of cutLine) {
			const pass = contourToPass(
				contour,
				z,
				tool.feedrate,
				tool.plungeRate,
				`Outline pass ${index + 1}/${steps.length} at Z${z.toFixed(3)}`,
			);
			if (pass) passes.push(pass);
		}
	}

	return { passes, minZ: -text.depth, warnings };
};
