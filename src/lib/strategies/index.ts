import type { Contour } from "../geometry";
import type { TextSpec, Tool } from "../project";
import type { Toolpath } from "../toolpath";

import { engraveToolpath } from "./engrave";
import { outlineToolpath } from "./outline";
import { pocketToolpath } from "./pocket";
import { vcarveToolpath } from "./vcarve";

export { blankProfileToolpath } from "./blank";
export { pocketRings } from "./pocket";
export { vcarveRings, type VCarveRing } from "./vcarve";

/** Dispatches to the strategy selected in the project model. */
export const textToolpath = (
	glyphs: Contour[],
	text: TextSpec,
	tool: Tool,
): Toolpath => {
	switch (text.strategy) {
		case "vcarve":
			return vcarveToolpath(glyphs, text, tool);
		case "pocket":
			return pocketToolpath(glyphs, text, tool);
		case "outline":
			return outlineToolpath(glyphs, text, tool);
		case "engrave":
			return engraveToolpath(glyphs, text, tool);
	}
};
