import { describe, expect, it } from "vitest";

import { boundsOf, type Contour } from "./geometry";
import { defaultProject, type TextSpec, type Tool } from "./project";
import { blankContour } from "./shapes";
import { pocketRings, textToolpath, vcarveRings } from "./strategies";
import { depthSteps } from "./toolpath";

/** A 40×20 rectangle standing in for a fat glyph. */
const glyph: Contour[] = [
	[
		{ x: -20, y: -10 },
		{ x: 20, y: -10 },
		{ x: 20, y: 10 },
		{ x: -20, y: 10 },
	],
];

const baseProject = defaultProject();
const tool: Tool = baseProject.tool;
const text: TextSpec = baseProject.text;

describe("depthSteps", () => {
	it("lands exactly on the final depth", () => {
		expect(depthSteps(19, 2).at(-1)).toBeCloseTo(-19, 9);
	});

	it("uses one pass when the stepdown covers the whole depth", () => {
		expect(depthSteps(3, 5)).toEqual([-3]);
	});

	it("descends without ever going past the target", () => {
		const steps = depthSteps(10, 3);
		expect(steps).toEqual([-3, -6, -9, -10]);
	});

	it("returns nothing for a zero depth", () => {
		expect(depthSteps(0, 2)).toEqual([]);
	});
});

describe("vcarveRings", () => {
	it("puts each ring at the depth its offset implies for the bit angle", () => {
		const spec = { ...text, depth: 6 };
		const { rings } = vcarveRings(glyph, spec, { ...tool, vBitAngle: 60 });

		expect(rings.length).toBeGreaterThan(1);

		// z = offset / tan(halfAngle); 60° included → 30° half angle.
		const tanHalf = Math.tan((30 * Math.PI) / 180);
		for (const ring of rings) {
			expect(ring.z).toBeCloseTo(-ring.offset / tanHalf, 6);
		}
	});

	it("starts at the surface on the glyph outline itself", () => {
		const { rings } = vcarveRings(glyph, text, tool);
		expect(rings[0].offset).toBe(0);
		expect(rings[0].z).toBe(-0);
		expect(rings[0].contours).toEqual(glyph);
	});

	it("gets narrower and deeper with each ring", () => {
		const { rings } = vcarveRings(glyph, { ...text, depth: 6 }, tool);

		for (let i = 1; i < rings.length; i += 1) {
			expect(rings[i].z).toBeLessThan(rings[i - 1].z);

			const previous = boundsOf(rings[i - 1].contours);
			const current = boundsOf(rings[i].contours);
			expect(current.maxX).toBeLessThan(previous.maxX);
		}
	});

	it("stops at the requested maximum depth", () => {
		const spec = { ...text, depth: 2 };
		const { rings } = vcarveRings(glyph, spec, tool);
		for (const ring of rings) {
			expect(ring.z).toBeGreaterThanOrEqual(-spec.depth - 1e-9);
		}
	});

	it("stops early when the stroke closes up before the depth limit", () => {
		// A 2mm-wide stroke can only be carved 1mm in from each side, which at
		// 60° is ~1.7mm deep — well short of the 20mm asked for.
		const narrow: Contour[] = [
			[
				{ x: -10, y: -1 },
				{ x: 10, y: -1 },
				{ x: 10, y: 1 },
				{ x: -10, y: 1 },
			],
		];
		const { rings } = vcarveRings(narrow, { ...text, depth: 20 }, tool);
		const deepest = Math.min(...rings.map((r) => r.z));

		expect(deepest).toBeGreaterThan(-2);
		expect(deepest).toBeLessThan(0);
	});

	it("warns when the bit diameter limits the achievable depth", () => {
		const { warnings } = vcarveRings(
			glyph,
			{ ...text, depth: 50 },
			{ ...tool, vBitDiameter: 6 },
		);
		expect(warnings.join(" ")).toMatch(/limited/i);
	});

	it("rejects a nonsensical bit angle", () => {
		const { rings, warnings } = vcarveRings(glyph, text, {
			...tool,
			vBitAngle: 180,
		});
		expect(rings).toHaveLength(0);
		expect(warnings.length).toBeGreaterThan(0);
	});
});

describe("pocketRings", () => {
	it("steps inward by the stepover and stops when the shape is consumed", () => {
		const rings = pocketRings(glyph, 6, 0.5);
		expect(rings.length).toBeGreaterThan(1);

		for (let i = 1; i < rings.length; i += 1) {
			const previous = boundsOf(rings[i - 1]);
			const current = boundsOf(rings[i]);
			// Each ring is one stepover (3mm) narrower on each side.
			expect(previous.maxX - current.maxX).toBeCloseTo(3, 1);
		}
	});

	it("starts one tool radius inside the outline", () => {
		const rings = pocketRings(glyph, 6, 0.5);
		expect(boundsOf(rings[0]).maxX).toBeCloseTo(20 - 3, 1);
	});

	it("produces nothing when the cutter does not fit", () => {
		const narrow: Contour[] = [
			[
				{ x: -10, y: -0.5 },
				{ x: 10, y: -0.5 },
				{ x: 10, y: 0.5 },
				{ x: -10, y: 0.5 },
			],
		];
		expect(pocketRings(narrow, 6, 0.5)).toEqual([]);
	});
});

describe("textToolpath", () => {
	it("compensates outward so an 'outside' letter keeps its size", () => {
		const spec: TextSpec = { ...text, strategy: "outline", outlineSide: "outside" };
		const { passes } = textToolpath(glyph, spec, tool);

		const xs = passes.flatMap((p) => p.moves.map((m) => m.x));
		expect(Math.max(...xs)).toBeCloseTo(20 + tool.endmillDiameter / 2, 1);
	});

	it("compensates inward for an 'inside' letter", () => {
		const spec: TextSpec = { ...text, strategy: "outline", outlineSide: "inside" };
		const { passes } = textToolpath(glyph, spec, tool);

		const xs = passes.flatMap((p) => p.moves.map((m) => m.x));
		expect(Math.max(...xs)).toBeCloseTo(20 - tool.endmillDiameter / 2, 1);
	});

	it("leaves the outline untouched when cutting on the line", () => {
		const spec: TextSpec = { ...text, strategy: "engrave" };
		const { passes } = textToolpath(glyph, spec, tool);

		const xs = passes.flatMap((p) => p.moves.map((m) => m.x));
		expect(Math.max(...xs)).toBeCloseTo(20, 6);
	});

	it("warns instead of silently emitting nothing when the cutter cannot fit", () => {
		// Real text at real sizes hits this: Arial stems at 22mm are about 2mm
		// wide, so a 1/8" endmill cannot pocket them. Emitting an empty program
		// with no explanation would look like the plugin was broken.
		const narrow: Contour[] = [
			[
				{ x: -10, y: -0.5 },
				{ x: 10, y: -0.5 },
				{ x: 10, y: 0.5 },
				{ x: -10, y: 0.5 },
			],
		];
		const result = textToolpath(narrow, { ...text, strategy: "pocket" }, tool);

		expect(result.passes).toHaveLength(0);
		expect(result.warnings.join(" ")).toMatch(/does not fit/i);
	});

	it("pockets successfully once the cutter fits", () => {
		const result = textToolpath(glyph, { ...text, strategy: "pocket" }, tool);
		expect(result.passes.length).toBeGreaterThan(0);
		expect(result.warnings).toHaveLength(0);
	});

	it("never exceeds the requested text depth, whichever strategy", () => {
		for (const strategy of ["vcarve", "pocket", "outline", "engrave"] as const) {
			const spec: TextSpec = { ...text, strategy, depth: 4 };
			const { passes } = textToolpath(glyph, spec, tool);
			const zs = passes.flatMap((p) => p.moves.map((m) => m.z));
			if (zs.length === 0) continue;
			expect(Math.min(...zs)).toBeGreaterThanOrEqual(-4 - 1e-6);
		}
	});
});

describe("blankContour", () => {
	it("matches the requested width and height for every shape", () => {
		for (const shape of ["rectangle", "rounded-rect", "ellipse"] as const) {
			const contour = blankContour({
				...baseProject.blank,
				shape,
				width: 150,
				height: 60,
			});
			const bounds = boundsOf([contour]);

			expect(bounds.maxX - bounds.minX).toBeCloseTo(150, 1);
			expect(bounds.maxY - bounds.minY).toBeCloseTo(60, 1);
		}
	});

	it("clamps a corner radius larger than the blank can hold", () => {
		const contour = blankContour({
			...baseProject.blank,
			shape: "rounded-rect",
			width: 40,
			height: 20,
			cornerRadius: 999,
		});
		const bounds = boundsOf([contour]);

		expect(bounds.maxX - bounds.minX).toBeCloseTo(40, 1);
		expect(bounds.maxY - bounds.minY).toBeCloseTo(20, 1);
	});
});
