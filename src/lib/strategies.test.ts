import { describe, expect, it } from "vitest";

import { offsetContours } from "./clipper";
import { boundsOf, type Contour, signedArea } from "./geometry";
import { defaultProject, type TextSpec, type Tool } from "./project";
import { blankContour } from "./shapes";
import { pocketRings, textToolpath } from "./strategies";
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

describe("pocketRings", () => {
	it("steps inward by the stepover and stops when the shape is consumed", async () => {
		const rings = await pocketRings(glyph, 6, 0.5);
		expect(rings.length).toBeGreaterThan(1);

		for (let i = 1; i < rings.length; i += 1) {
			const previous = boundsOf(rings[i - 1]);
			const current = boundsOf(rings[i]);
			// Each ring is one stepover (3mm) narrower on each side.
			expect(previous.maxX - current.maxX).toBeCloseTo(3, 1);
		}
	});

	it("starts one tool radius inside the outline", async () => {
		const rings = await pocketRings(glyph, 6, 0.5);
		expect(boundsOf(rings[0]).maxX).toBeCloseTo(20 - 3, 1);
	});

	it("produces nothing when the cutter does not fit", async () => {
		const narrow: Contour[] = [
			[
				{ x: -10, y: -0.5 },
				{ x: 10, y: -0.5 },
				{ x: 10, y: 0.5 },
				{ x: -10, y: 0.5 },
			],
		];
		expect(await pocketRings(narrow, 6, 0.5)).toEqual([]);
	});
});

describe("textToolpath", () => {
	it("compensates outward so an 'outside' letter keeps its size", async () => {
		const spec: TextSpec = { ...text, strategy: "outline", outlineSide: "outside" };
		const { passes } = await textToolpath(glyph, spec, tool);

		const xs = passes.flatMap((p) => p.moves.map((m) => m.x));
		expect(Math.max(...xs)).toBeCloseTo(20 + tool.endmillDiameter / 2, 1);
	});

	it("compensates inward for an 'inside' letter", async () => {
		const spec: TextSpec = { ...text, strategy: "outline", outlineSide: "inside" };
		const { passes } = await textToolpath(glyph, spec, tool);

		const xs = passes.flatMap((p) => p.moves.map((m) => m.x));
		expect(Math.max(...xs)).toBeCloseTo(20 - tool.endmillDiameter / 2, 1);
	});

	it("leaves the outline untouched when cutting on the line", async () => {
		const spec: TextSpec = { ...text, strategy: "engrave" };
		const { passes } = await textToolpath(glyph, spec, tool);

		const xs = passes.flatMap((p) => p.moves.map((m) => m.x));
		expect(Math.max(...xs)).toBeCloseTo(20, 6);
	});

	it("warns instead of silently emitting nothing when the cutter cannot fit", async () => {
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
		const result = await textToolpath(narrow, { ...text, strategy: "pocket" }, tool);

		expect(result.passes).toHaveLength(0);
		expect(result.warnings.join(" ")).toMatch(/does not fit/i);
	});

	it("pockets successfully once the cutter fits", async () => {
		const result = await textToolpath(glyph, { ...text, strategy: "pocket" }, tool);
		expect(result.passes.length).toBeGreaterThan(0);
		expect(result.warnings).toHaveLength(0);
	});

	it("never exceeds the requested text depth, whichever strategy", async () => {
		for (const strategy of ["pocket", "outline", "engrave"] as const) {
			const spec: TextSpec = { ...text, strategy, depth: 4 };
			const { passes } = await textToolpath(glyph, spec, tool);
			const zs = passes.flatMap((p) => p.moves.map((m) => m.z));
			if (zs.length === 0) continue;
			expect(Math.min(...zs)).toBeGreaterThanOrEqual(-4 - 1e-6);
		}
	});
});

describe("blankContour", () => {
	it("matches the requested width and height for every shape", () => {
		for (const shape of [
			"rectangle",
			"rounded-rect",
			"ellipse",
			"boat",
		] as const) {
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

	it("builds the tugboat as one closed, flattened, counter-clockwise contour", () => {
		const contour = blankContour({
			...baseProject.blank,
			shape: "boat",
			width: 150,
			height: 60,
		});

		// Straight segments alone would be ~16 points; the extra vertices are the
		// flattened bow and stern curves.
		expect(contour.length).toBeGreaterThan(40);
		// Same winding as every other blank, so clipper sees one convention.
		expect(signedArea(contour)).toBeGreaterThan(0);
	});

	it("puts the tugboat's landmarks where they belong", () => {
		const width = 220;
		const height = 100;
		const contour = blankContour({
			...baseProject.blank,
			shape: "boat",
			width,
			height,
		});
		// Design-box units map 1:1 at this size, offset to a centred origin.
		const at = (x: number, y: number) => ({ x: x - width / 2, y: y - height / 2 });
		const bounds = boundsOf([contour]);

		const leftmost = contour.filter((p) => Math.abs(p.x - bounds.minX) < 1e-6);
		const rightmost = contour.filter((p) => Math.abs(p.x - bounds.maxX) < 1e-6);
		const lowest = contour.filter((p) => Math.abs(p.y - bounds.minY) < 1e-6);
		const highest = contour.filter((p) => Math.abs(p.y - bounds.maxY) < 1e-6);

		// Stern: a single point partway up the transom, not a full-height edge.
		expect(leftmost).toHaveLength(1);
		expect(leftmost[0].y).toBeCloseTo(at(0, 38).y, 6);

		// Stem head: one point, and above the deck line so the bow reads as a bow
		// rather than a nub on the sheer.
		expect(rightmost).toHaveLength(1);
		expect(rightmost[0].y).toBeCloseTo(at(0, 66).y, 6);
		expect(rightmost[0].y).toBeGreaterThan(at(0, 46).y);

		// Keel is flat, so at least two points share the lowest Y.
		expect(lowest.length).toBeGreaterThanOrEqual(2);
		// Chimney top is flat too, and sits forward of centre on the cabin roof.
		expect(highest.length).toBeGreaterThanOrEqual(2);
		expect(Math.min(...highest.map((p) => p.x))).toBeCloseTo(at(112, 0).x, 6);
		expect(Math.max(...highest.map((p) => p.x))).toBeCloseTo(at(134, 0).x, 6);
	});

	it("keeps the tugboat inside its bounding box at any aspect ratio", () => {
		for (const [width, height] of [
			[150, 60],
			[100, 100],
			[300, 60],
			[40, 40],
		] as const) {
			const contour = blankContour({
				...baseProject.blank,
				shape: "boat",
				width,
				height,
			});
			const bounds = boundsOf([contour]);

			expect(bounds.maxX - bounds.minX).toBeCloseTo(width, 6);
			expect(bounds.maxY - bounds.minY).toBeCloseTo(height, 6);
			// Curves must never overshoot the box, or the blank would not fit the
			// stock the user specified.
			expect(bounds.minX).toBeCloseTo(-width / 2, 6);
			expect(bounds.maxY).toBeCloseTo(height / 2, 6);
		}
	});

	it("profiles the tugboat without the outline fragmenting", () => {
		// Concave corners where the cabin meets the deck could split the offset
		// into pieces; each piece would become its own plunge and pass.
		for (const diameter of [3.175, 6, 12]) {
			const contour = blankContour({
				...baseProject.blank,
				shape: "boat",
				width: 150,
				height: 60,
			});
			const offset = offsetContours([contour], diameter / 2);

			expect(offset).toHaveLength(1);
			const bounds = boundsOf(offset);
			expect(bounds.maxX - bounds.minX).toBeCloseTo(150 + diameter, 2);
		}
	});

	it("clamps the corner radius on a blank too small to hold it", () => {
		// The fixed 8mm radius exceeds the half-height of a 40x10 blank (5mm).
		const contour = blankContour({
			...baseProject.blank,
			shape: "rounded-rect",
			width: 40,
			height: 10,
		});
		const bounds = boundsOf([contour]);

		expect(bounds.maxX - bounds.minX).toBeCloseTo(40, 1);
		expect(bounds.maxY - bounds.minY).toBeCloseTo(10, 1);
	});
});
