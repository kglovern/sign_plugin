/**
 * V-carving by progressive inward offsets.
 *
 * The geometry: a V-bit with half-angle θ cuts a cone, so at depth z its edge
 * sits `z · tan(θ)` out from the centreline. Inverting that, a ring offset `d`
 * inside the glyph outline should be cut at `z = d / tan(θ)` — then the cone's
 * surface meets the top of the stock exactly on the outline. Sweeping `d` from
 * zero inward until the offset vanishes produces the tapered walls and the
 * sharp corners V-carving is wanted for, and narrow strokes automatically come
 * out shallower than wide ones.
 *
 * This is an approximation of true medial-axis V-carving: the walls are a
 * staircase of rings rather than continuously swept. At the default 0.25mm
 * ring spacing the steps are well under the tool's own cusp height, so in wood
 * they are invisible — but it is an approximation, and the UI says so.
 */

import { offsetContours } from "../clipper";
import type { Contour } from "../geometry";
import type { TextSpec, Tool } from "../project";
import { contourToPass, EMPTY_TOOLPATH, type Pass, type Toolpath } from "../toolpath";

const MAX_RINGS = 2000;

export type VCarveRing = { contours: Contour[]; z: number; offset: number };

/**
 * Builds the ring stack, shallowest first. Exported so the tests and the
 * preview can reason about depths without re-deriving the trigonometry.
 */
export const vcarveRings = (
	glyphs: Contour[],
	text: TextSpec,
	tool: Tool,
): { rings: VCarveRing[]; warnings: string[] } => {
	const warnings: string[] = [];

	const halfAngle = (tool.vBitAngle / 2) * (Math.PI / 180);
	if (halfAngle <= 0 || halfAngle >= Math.PI / 2) {
		return {
			rings: [],
			warnings: [`V-bit angle must be between 0° and 180° (got ${tool.vBitAngle}°).`],
		};
	}

	const tanTheta = Math.tan(halfAngle);
	const step = Math.max(tool.vcarveStepover, 1e-3);

	// Two independent limits on how far in we can go: the depth the user asked
	// for, and the bit's own radius — past that the shank, not the cone, is
	// doing the cutting.
	const depthLimit = text.depth * tanTheta;
	const bitLimit = tool.vBitDiameter / 2;
	const maxOffset = Math.min(depthLimit, bitLimit);

	if (bitLimit < depthLimit) {
		warnings.push(
			`Text depth is limited to ${(bitLimit / tanTheta).toFixed(2)}mm by the ${tool.vBitDiameter}mm V-bit's diameter.`,
		);
	}

	const rings: VCarveRing[] = [];
	for (let i = 0; i < MAX_RINGS; i += 1) {
		const offset = step * i;
		if (offset > maxOffset) break;

		const contours = i === 0 ? glyphs : offsetContours(glyphs, -offset);
		// Empty means the stroke has closed up: this is the deepest the bit
		// reaches here, and it is the natural end of the sweep.
		if (contours.length === 0) break;

		rings.push({ contours, z: -offset / tanTheta, offset });
	}

	return { rings, warnings };
};

export const vcarveToolpath = (
	glyphs: Contour[],
	text: TextSpec,
	tool: Tool,
): Toolpath => {
	if (glyphs.length === 0 || text.depth <= 0) return EMPTY_TOOLPATH;

	const { rings, warnings } = vcarveRings(glyphs, text, tool);
	if (rings.length === 0) return { ...EMPTY_TOOLPATH, warnings };

	const passes: Pass[] = [];
	for (const ring of rings) {
		for (const contour of ring.contours) {
			const pass = contourToPass(
				contour,
				ring.z,
				tool.feedrate,
				tool.plungeRate,
				`V-carve ring at offset ${ring.offset.toFixed(3)}mm, Z${ring.z.toFixed(3)}`,
			);
			if (pass) passes.push(pass);
		}
	}

	const minZ = rings.reduce((m, r) => Math.min(m, r.z), 0);
	return { passes, minZ, warnings };
};
