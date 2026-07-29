/**
 * Ambient declarations for opentype.js v2.
 *
 * v2.0.0 ships `main`/`module` but no `.d.ts` files, and the DefinitelyTyped
 * package (`@types/opentype.js`) still targets v1 — installing it would
 * mis-describe this version. We only use a small slice of the API, so we
 * declare exactly that slice here.
 */
declare module "opentype.js" {
	export type PathCommand =
		| { type: "M"; x: number; y: number }
		| { type: "L"; x: number; y: number }
		| {
				type: "C";
				x1: number;
				y1: number;
				x2: number;
				y2: number;
				x: number;
				y: number;
		  }
		| { type: "Q"; x1: number; y1: number; x: number; y: number }
		| { type: "Z" };

	export class Path {
		commands: PathCommand[];
		toPathData(decimalPlaces?: number): string;
	}

	export type RenderOptions = {
		kerning?: boolean;
		features?: Record<string, boolean>;
		letterSpacing?: number;
		tracking?: number;
	};

	/** `{ [nameId]: { [language]: value } }`, e.g. `fontFamily.en`. */
	export type NameTable = Record<string, Record<string, string> | undefined>;

	export class Font {
		unitsPerEm: number;
		ascender: number;
		descender: number;
		numGlyphs: number;
		/**
		 * In v2 this is keyed by platform first — `{ macintosh, windows, … }` —
		 * unlike v1, where the name IDs sat at the top level. Prefer
		 * `getEnglishName()`, which resolves across platforms for you.
		 */
		names: Record<string, NameTable | undefined>;
		/** Resolves a name ID to its English value across name platforms. */
		getEnglishName(name: string): string | undefined;
		getPath(
			text: string,
			x: number,
			y: number,
			fontSize: number,
			options?: RenderOptions,
		): Path;
		getAdvanceWidth(
			text: string,
			fontSize: number,
			options?: RenderOptions,
		): number;
	}

	export function parse(buffer: ArrayBuffer, options?: unknown): Font;
}
