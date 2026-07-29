/**
 * The blank profile: cut the sign shape out of the stock, leaving tabs.
 *
 * The cutter rides *outside* the outline so the finished blank matches the
 * dimensions the user typed — offsetting inward would shrink the part by the
 * tool diameter.
 */

import { offsetContours } from "../clipper";
import { primaryContour } from "../geometry";
import { blankContours } from "../shapes";
import { contourToTabbedPass, tabTopZ } from "../tabs";
import type { Blank, Tabs, Tool } from "../project";
import { depthSteps, EMPTY_TOOLPATH, type Pass, type Toolpath } from "../toolpath";

export const blankProfileToolpath = (
	blank: Blank,
	tool: Tool,
	tabs: Tabs,
): Toolpath => {
	if (!blank.cutProfile || blank.depth <= 0) return EMPTY_TOOLPATH;

	const outline = blankContours(blank);
	if (outline.length === 0) return EMPTY_TOOLPATH;

	const warnings: string[] = [];
	const cutLine = offsetContours(outline, tool.endmillDiameter / 2);
	if (cutLine.length === 0) return EMPTY_TOOLPATH;

	if (tabs.enabled && tabs.height >= blank.depth) {
		warnings.push(
			`Tab height (${tabs.height}mm) is not less than profile depth (${blank.depth}mm) — the profile will not cut through.`,
		);
	}

	const passes: Pass[] = [];
	const steps = depthSteps(blank.depth, tool.stepdown);
	const tabZ = tabTopZ(blank.depth, tabs);

	// Tabs attach to the primary contour only — the same one the design canvas
	// draws markers on — so what the user placed is what gets cut.
	const tabbed = primaryContour(cutLine);

	for (const [index, z] of steps.entries()) {
		for (const contour of cutLine) {
			const { pass, warnings: tabWarnings } = contourToTabbedPass(
				contour,
				z,
				contour === tabbed ? tabs : { ...tabs, positions: [] },
				tabZ,
				tool.feedrate,
				tool.plungeRate,
				`Profile pass ${index + 1}/${steps.length} at Z${z.toFixed(3)}`,
			);
			if (pass) passes.push(pass);
			// Only surface tab warnings once, not once per depth pass.
			if (index === 0) warnings.push(...tabWarnings);
		}
	}

	const minZ = passes.reduce(
		(lowest, p) => p.moves.reduce((m, mv) => Math.min(m, mv.z), lowest),
		0,
	);
	return { passes, minZ, warnings };
};
