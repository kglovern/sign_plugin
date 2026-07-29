/**
 * The intermediate representation every strategy produces and the G-code
 * emitter consumes.
 *
 * A `Pass` is one continuous cutting move: the machine rapids to the first
 * point at safe Z, plunges, then feeds through the rest. Z lives on each move
 * rather than on the pass so tabs — which lift the cutter partway around a
 * contour — need no special case anywhere downstream.
 */

import type { Contour } from "./geometry";

export type Move = { x: number; y: number; z: number };

export type Pass = {
	moves: Move[];
	/** Cutting feedrate, mm/min. */
	feed: number;
	/** Plunge feedrate for the entry move, mm/min. */
	plunge: number;
	comment?: string;
};

export type Toolpath = {
	passes: Pass[];
	/** Deepest Z reached, for sanity checks and the summary UI. */
	minZ: number;
	warnings: string[];
};

export const EMPTY_TOOLPATH: Toolpath = { passes: [], minZ: 0, warnings: [] };

/** Turns a closed contour into a pass at constant Z, closing the loop. */
export const contourToPass = (
	contour: Contour,
	z: number,
	feed: number,
	plunge: number,
	comment?: string,
): Pass | null => {
	if (contour.length < 2) return null;
	const moves: Move[] = contour.map((p) => ({ x: p.x, y: p.y, z }));
	// Close the loop so the profile actually meets back up.
	moves.push({ x: contour[0].x, y: contour[0].y, z });
	return { moves, feed, plunge, comment };
};

/**
 * Depth steps from the surface down to `depth`, respecting `stepdown`. Always
 * ends exactly at `-depth` so the final pass is a full-depth cleanup rather
 * than a sliver.
 */
export const depthSteps = (depth: number, stepdown: number): number[] => {
	if (depth <= 0) return [];
	const step = stepdown > 0 ? stepdown : depth;
	const steps: number[] = [];
	for (let d = step; d < depth - 1e-9; d += step) {
		steps.push(-d);
	}
	steps.push(-depth);
	return steps;
};

export const combineToolpaths = (parts: Toolpath[]): Toolpath => {
	const passes = parts.flatMap((p) => p.passes);
	const warnings = parts.flatMap((p) => p.warnings);
	const minZ = passes.reduce(
		(lowest, pass) =>
			pass.moves.reduce((m, move) => Math.min(m, move.z), lowest),
		0,
	);
	return { passes, minZ, warnings };
};

/** Shifts every move, e.g. from blank-centred design space to a corner origin. */
export const translateToolpath = (
	toolpath: Toolpath,
	dx: number,
	dy: number,
): Toolpath => ({
	...toolpath,
	passes: toolpath.passes.map((pass) => ({
		...pass,
		moves: pass.moves.map((m) => ({ x: m.x + dx, y: m.y + dy, z: m.z })),
	})),
});
