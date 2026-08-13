/**
 * Pocketing: clear the whole interior of each glyph with an endmill.
 *
 * Concentric offsets, outermost first, stepping in by the stepover until the
 * offset comes back empty — clipper's own "shape has been consumed" signal is
 * exactly the right termination condition, and it handles narrow strokes and
 * counters correctly for free.
 */

import { offsetContours } from "../clipper";
import type { Contour } from "../geometry";
import type { TextSpec, Tool } from "../project";
import { contourToPass, depthSteps, EMPTY_TOOLPATH, type Pass, type Toolpath } from "../toolpath";

/** Stop runaway loops if a degenerate stepover slips through. */
const MAX_RINGS = 500;

/**
 * Hands control back to the browser so a paint (the busy spinner) can land
 * mid-computation — without this the ring loop below blocks the main thread
 * solid for its entire duration. Falls back to a macrotask where
 * `requestAnimationFrame` doesn't exist (the vitest/node test environment).
 */
const yieldToPaint = () =>
	new Promise<void>((resolve) => {
		if (typeof requestAnimationFrame === "function") {
			requestAnimationFrame(() => resolve());
		} else {
			setTimeout(resolve, 0);
		}
	});

/** Concentric rings clearing `region`, outermost first. */
export const pocketRings = async (
	region: Contour[],
	toolDiameter: number,
	stepover: number,
): Promise<Contour[][]> => {
	const radius = toolDiameter / 2;
	const step = Math.max(toolDiameter * stepover, 1e-3);

	const rings: Contour[][] = [];
	for (let i = 0; i < MAX_RINGS; i += 1) {
		const ring = offsetContours(region, -(radius + step * i));
		if (ring.length === 0) break;
		rings.push(ring);
		if (i % 8 === 7) await yieldToPaint();
	}
	return rings;
};

export const pocketToolpath = async (
	glyphs: Contour[],
	text: TextSpec,
	tool: Tool,
): Promise<Toolpath> => {
	if (glyphs.length === 0 || text.depth <= 0) return EMPTY_TOOLPATH;

	const rings = await pocketRings(glyphs, tool.endmillDiameter, tool.stepover);
	if (rings.length === 0) {
		return {
			...EMPTY_TOOLPATH,
			warnings: [
				`A ${tool.endmillDiameter}mm cutter does not fit inside these letters — try a smaller bit or larger text.`,
			],
		};
	}

	const passes: Pass[] = [];
	const steps = depthSteps(text.depth, tool.stepdown);

	// Full depth one ring at a time would leave the cutter re-entering material
	// at full width; clearing each depth level completely before stepping down
	// keeps engagement predictable.
	for (const [index, z] of steps.entries()) {
		for (const ring of rings) {
			for (const contour of ring) {
				const pass = contourToPass(
					contour,
					z,
					tool.feedrate,
					tool.plungeRate,
					`Pocket pass ${index + 1}/${steps.length} at Z${z.toFixed(3)}`,
				);
				if (pass) passes.push(pass);
			}
		}
	}

	return { passes, minZ: -text.depth, warnings: [] };
};
