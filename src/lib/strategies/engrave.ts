/**
 * Centreline engraving: run the cutter straight along the glyph outline with no
 * tool compensation. The line ends up as wide as the tool, so this is the
 * strategy for a fine bit scribing letter shapes — the cheapest, fastest look.
 */

import type { Contour } from "../geometry";
import type { TextSpec, Tool } from "../project";
import { contourToPass, depthSteps, EMPTY_TOOLPATH, type Pass, type Toolpath } from "../toolpath";

export const engraveToolpath = (
	glyphs: Contour[],
	text: TextSpec,
	tool: Tool,
): Toolpath => {
	if (glyphs.length === 0 || text.depth <= 0) return EMPTY_TOOLPATH;

	const passes: Pass[] = [];
	const steps = depthSteps(text.depth, tool.stepdown);

	for (const [index, z] of steps.entries()) {
		for (const contour of glyphs) {
			const pass = contourToPass(
				contour,
				z,
				tool.feedrate,
				tool.plungeRate,
				`Engrave pass ${index + 1}/${steps.length} at Z${z.toFixed(3)}`,
			);
			if (pass) passes.push(pass);
		}
	}

	return { passes, minZ: -text.depth, warnings: [] };
};
