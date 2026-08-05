import type { Font, PathCommand } from "opentype.js";
import { describe, expect, it } from "vitest";

import { boundsSize } from "./geometry";
import {
	alignTextOffset,
	BIT_PRESETS,
	FEED_PRESETS,
	fitTextSize,
	matchBitPreset,
	matchFeedPreset,
	matchSizePreset,
	profileDepthFor,
	SIGN_SIZE_PRESETS,
	VBIT_DIAMETER_PRESETS,
} from "./presets";
import { defaultProject, MM_PER_INCH } from "./project";
import { layoutText } from "./text";

/**
 * A font whose every glyph is a solid `size` x `size` box sitting on the
 * baseline, laid out edge to edge. Exact by construction, so a fitted size can
 * be asserted against arithmetic rather than against a real typeface's metrics.
 *
 * `letterSpacing` is honoured because it is the one thing that stops layout
 * being proportional to size: `text.ts` converts the project's millimetre value
 * into em units, so the gap comes back out as a constant number of millimetres
 * however the size changes.
 */
type SpacingOptions = { letterSpacing?: number };

const gapOf = (size: number, options?: SpacingOptions) =>
	(options?.letterSpacing ?? 0) * size;

const boxFont = {
	getAdvanceWidth: (text: string, size: number, options?: SpacingOptions) =>
		text.length * (size + gapOf(size, options)),
	getPath: (
		text: string,
		dx: number,
		dy: number,
		size: number,
		options?: SpacingOptions,
	) => {
		const commands: PathCommand[] = [];
		const advance = size + gapOf(size, options);
		for (let i = 0; i < text.length; i += 1) {
			const left = dx + i * advance;
			// opentype's frame is Y-down with the baseline at dy, so the glyph
			// body extends to negative y from there.
			commands.push(
				{ type: "M", x: left, y: dy },
				{ type: "L", x: left + size, y: dy },
				{ type: "L", x: left + size, y: dy - size },
				{ type: "L", x: left, y: dy - size },
				{ type: "Z" },
			);
		}
		return { commands };
	},
} as unknown as Font;

const textSpec = (over: Partial<ReturnType<typeof defaultProject>["text"]> = {}) => ({
	...defaultProject().text,
	content: "AB",
	size: 10,
	letterSpacing: 0,
	...over,
});

describe("bit presets", () => {
	it("covers 1/16in through 1/4in in exact millimetres", () => {
		expect(BIT_PRESETS.map((p) => p.label)).toEqual([
			'1/16"',
			'1/8"',
			'3/16"',
			'1/4"',
		]);
		expect(BIT_PRESETS[1].diameter).toBeCloseTo(3.175, 10);
		expect(BIT_PRESETS[3].diameter).toBeCloseTo(6.35, 10);
	});

	it("matches the project default endmill to 1/8in", () => {
		const matched = matchBitPreset(defaultProject().tool.endmillDiameter);
		expect(matched?.label).toBe('1/8"');
	});

	it("absorbs the float noise of an inch display round-trip", () => {
		// What the UI produces when 0.125in is typed, converted and cleaned.
		const roundTripped = Number((MM_PER_INCH / 8 / MM_PER_INCH).toFixed(4)) * MM_PER_INCH;
		expect(matchBitPreset(roundTripped)?.label).toBe('1/8"');
	});

	it("does not confuse a 3mm metric bit with a 1/8in bit", () => {
		expect(matchBitPreset(3)).toBeNull();
	});

	it("matches the default V-bit diameter to 1/2in", () => {
		const matched = matchBitPreset(
			defaultProject().tool.vBitDiameter,
			VBIT_DIAMETER_PRESETS,
		);
		expect(matched?.label).toBe('1/2"');
	});
});

describe("sign size presets", () => {
	it("stores inch labels as millimetres", () => {
		expect(SIGN_SIZE_PRESETS[0].width).toBeCloseTo(152.4, 10);
	});

	it("matches a preset back from its stored dimensions", () => {
		const preset = SIGN_SIZE_PRESETS[2];
		expect(matchSizePreset(preset.width, preset.height)?.label).toBe(preset.label);
	});

	it("returns null for the default 150 x 60 blank", () => {
		const { width, height } = defaultProject().blank;
		expect(matchSizePreset(width, height)).toBeNull();
	});
});

describe("profileDepthFor", () => {
	it("cuts past the stock so the part releases", () => {
		expect(profileDepthFor(18)).toBe(19);
	});

	it("treats negative thickness as zero", () => {
		expect(profileDepthFor(-5)).toBe(1);
	});
});

describe("feed presets", () => {
	it("matches an untouched project to Softwood", () => {
		expect(matchFeedPreset(defaultProject().tool)?.id).toBe("softwood");
	});

	it("returns null once a feed has been hand-edited", () => {
		const tool = { ...defaultProject().tool, feedrate: 950 };
		expect(matchFeedPreset(tool)).toBeNull();
	});

	it("round-trips every preset", () => {
		for (const preset of FEED_PRESETS) {
			const tool = { ...defaultProject().tool, ...preset };
			expect(matchFeedPreset(tool)?.id).toBe(preset.id);
		}
	});
});

describe("fitTextSize", () => {
	const rect = { ...defaultProject().blank, shape: "rectangle" as const };
	/** Target 80 x 48 at a 0.1 margin — narrower than "AB" is wide. */
	const narrow = { ...rect, width: 100, height: 60 };
	/** Target 120 x 48 — wider than "AB" needs, so height binds instead. */
	const wide = { ...rect, width: 150, height: 60 };

	it("grows the text until its width fills the margin", () => {
		// Two square glyphs edge to edge: 2 * size = 80 -> size 40, height 40.
		expect(fitTextSize(boxFont, textSpec({ size: 4 }), narrow, 0.1)).toBeCloseTo(
			40,
			1,
		);
	});

	it("stops at the height when the blank is wider than the text needs", () => {
		// Width would allow 60, height only allows 48; the smaller wins.
		expect(fitTextSize(boxFont, textSpec({ size: 4 }), wide, 0.1)).toBeCloseTo(
			48,
			1,
		);
	});

	it("converges regardless of the starting size", () => {
		const spec = textSpec();
		const fromTiny = fitTextSize(boxFont, { ...spec, size: 0.5 }, narrow, 0.1);
		const fromHuge = fitTextSize(boxFont, { ...spec, size: 500 }, narrow, 0.1);
		expect(fromTiny).toBeCloseTo(40, 1);
		expect(fromHuge).toBeCloseTo(40, 1);
	});

	it("converges with letter spacing, which is not proportional to size", () => {
		// 2 * size + 3mm of gap = 80 -> size 38.5, which no single proportional
		// scaling step from an arbitrary start would reach.
		const spec = textSpec({ letterSpacing: 3, size: 4 });
		const size = fitTextSize(boxFont, spec, narrow, 0.1);
		expect(size).toBeCloseTo(38.5, 1);

		const { width } = boundsSize(layoutText(boxFont, { ...spec, size }).bounds);
		expect(width).toBeCloseTo(80, 1);
	});

	it("never returns a size that overflows the margin", () => {
		const spec = textSpec({ content: "ABCDE", size: 200 });
		const size = fitTextSize(boxFont, spec, narrow, 0.1);
		const { width, height } = boundsSize(
			layoutText(boxFont, { ...spec, size }).bounds,
		);
		expect(width).toBeLessThanOrEqual(narrow.width * 0.8 + 0.01);
		expect(height).toBeLessThanOrEqual(narrow.height * 0.8 + 0.01);
	});

	it("leaves the size alone when there is nothing to lay out", () => {
		expect(fitTextSize(boxFont, textSpec({ content: "   ", size: 16 }), rect, 0.1)).toBe(
			16,
		);
	});

	it("leaves the size alone for a blank with no area", () => {
		expect(fitTextSize(boxFont, textSpec({ size: 16 }), { ...rect, width: 0 }, 0.1)).toBe(
			16,
		);
	});
});

describe("alignTextOffset", () => {
	const blank = { ...defaultProject().blank, width: 100, height: 50 };
	// A 20 x 10 block, centred wherever the caller last put it.
	const bounds = { minX: -10, maxX: 10, minY: -5, maxY: 5 };
	const current = { x: 3, y: 7 };

	it("centres on both axes", () => {
		expect(alignTextOffset("centre", bounds, blank, current, 0.1)).toEqual({
			x: 0,
			y: 0,
		});
	});

	it("moves only the axis being aligned", () => {
		// 50/2 - 50*0.1 - 10/2 = 15
		expect(alignTextOffset("top", bounds, blank, current, 0.1)).toEqual({
			x: 3,
			y: 15,
		});
		expect(alignTextOffset("bottom", bounds, blank, current, 0.1)).toEqual({
			x: 3,
			y: -15,
		});
		// 100/2 - 100*0.1 - 20/2 = 30
		expect(alignTextOffset("left", bounds, blank, current, 0.1)).toEqual({
			x: -30,
			y: 7,
		});
		expect(alignTextOffset("right", bounds, blank, current, 0.1)).toEqual({
			x: 30,
			y: 7,
		});
	});

	it("clamps to the centre rather than pushing oversized text outward", () => {
		const oversized = { minX: -80, maxX: 80, minY: -40, maxY: 40 };
		expect(alignTextOffset("left", oversized, blank, current, 0.1)).toEqual({
			x: 0,
			y: 7,
		});
	});

	it("leaves empty text where it is", () => {
		const empty = {
			minX: Number.POSITIVE_INFINITY,
			minY: Number.POSITIVE_INFINITY,
			maxX: Number.NEGATIVE_INFINITY,
			maxY: Number.NEGATIVE_INFINITY,
		};
		expect(alignTextOffset("top", empty, blank, current, 0.1)).toEqual(current);
	});
});
