import { describe, expect, it } from "vitest";

import { buildGeometry, toolpathSignature } from "./generate";
import { defaultProject, evenTabPositions, type Project } from "./project";

const sig = (project: Project, fontKey: string | null = "Arial") =>
	toolpathSignature(project, fontKey);

/** Applies `mutate` to a fresh default project and returns the new signature. */
const sigAfter = (mutate: (p: Project) => Project): string =>
	sig(mutate(defaultProject()));

describe("toolpathSignature", () => {
	it("is stable for an unchanged project", () => {
		const project = defaultProject();
		expect(sig(project)).toBe(sig(project));
		// A structurally identical but distinct object must match too, otherwise
		// every re-render would look like a change.
		expect(sig(defaultProject())).toBe(sig(defaultProject()));
	});

	const changes: [string, (p: Project) => Project][] = [
		["blank width", (p) => ({ ...p, blank: { ...p.blank, width: 200 } })],
		["blank shape", (p) => ({ ...p, blank: { ...p.blank, shape: "ellipse" } })],
		["profile depth", (p) => ({ ...p, blank: { ...p.blank, depth: 25 } })],
		["cut profile toggle", (p) => ({ ...p, blank: { ...p.blank, cutProfile: false } })],
		["text content", (p) => ({ ...p, text: { ...p.text, content: "OTHER" } })],
		["text position", (p) => ({ ...p, text: { ...p.text, x: 5 } })],
		["text size", (p) => ({ ...p, text: { ...p.text, size: 40 } })],
		["strategy", (p) => ({ ...p, text: { ...p.text, strategy: "outline" } })],
		["endmill diameter", (p) => ({ ...p, tool: { ...p.tool, endmillDiameter: 6 } })],
		["feedrate", (p) => ({ ...p, tool: { ...p.tool, feedrate: 2000 } })],
		["tab position", (p) => ({ ...p, tabs: { ...p.tabs, positions: [0.1, 0.6] } })],
		["tab count", (p) => ({ ...p, tabs: { ...p.tabs, positions: evenTabPositions(6) } })],
		["tab height", (p) => ({ ...p, tabs: { ...p.tabs, height: 5 } })],
		["tabs disabled", (p) => ({ ...p, tabs: { ...p.tabs, enabled: false } })],
		["units", (p) => ({ ...p, units: "in" })],
		["work origin", (p) => ({ ...p, origin: "center" })],
	];

	for (const [label, mutate] of changes) {
		it(`changes when ${label} changes`, () => {
			expect(sigAfter(mutate)).not.toBe(sig(defaultProject()));
		});
	}

	it("changes when the font changes", () => {
		const project = defaultProject();
		expect(sig(project, "Arial")).not.toBe(sig(project, "Times New Roman"));
		expect(sig(project, null)).not.toBe(sig(project, "Arial"));
	});

	it("ignores canvas-only settings", () => {
		// Grid spacing changes how the design surface is drawn and nothing about
		// the cut, so adjusting it must not invalidate a perfectly good toolpath.
		const base = sig(defaultProject());
		expect(sigAfter((p) => ({ ...p, gridSpacing: 25 }))).toBe(base);
	});
});

describe("buildGeometry", () => {
	it("produces the canvas geometry without any toolpath work", () => {
		const project = defaultProject();
		const geometry = buildGeometry(project, null);

		expect(geometry.blank).toHaveLength(1);
		expect(geometry.cutLine.length).toBeGreaterThan(0);
		expect(geometry.tabContour).not.toBeNull();
		expect(geometry.tabMarkers).toHaveLength(project.tabs.positions.length);
		// No font, so no glyphs — the blank and tabs still resolve.
		expect(geometry.glyphs).toEqual([]);
	});

	it("omits the cut line and tabs when the profile is not being cut", () => {
		const base = defaultProject();
		const geometry = buildGeometry(
			{ ...base, blank: { ...base.blank, cutProfile: false } },
			null,
		);
		expect(geometry.cutLine).toEqual([]);
		expect(geometry.tabMarkers).toEqual([]);
	});
});
