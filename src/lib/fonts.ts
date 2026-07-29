/**
 * Font discovery and parsing.
 *
 * To cut text we need glyph *outlines*, not rendered pixels — which means we
 * need the font binary. `queryLocalFonts()` is the only browser API that hands
 * those over: each `FontData` exposes `.blob()`, which opentype.js can parse.
 *
 * It is Chromium-only, secure-contexts-only, and gated by the `local-fonts`
 * Permissions-Policy (default allowlist `self`). gSender mounts plugin iframes
 * same-origin with `allow-same-origin`, so the frame is covered by `self` — but
 * that is an implementation detail of the host we do not control, so every call
 * is feature-detected and every failure falls back to user-supplied font files.
 */

import { type Font, parse } from "opentype.js";

export type FontSource = "system" | "custom";

export type FontFace = {
	/** Stable identity used in the project model. */
	key: string;
	family: string;
	style: string;
	fullName: string;
	source: FontSource;
	load: () => Promise<ArrayBuffer>;
};

export type FontRegistry = {
	faces: FontFace[];
	/** Sorted unique family names, for the picker. */
	families: string[];
	/** True when `queryLocalFonts()` returned system fonts. */
	systemFontsAvailable: boolean;
	/** Human-readable explanation when system fonts are unavailable. */
	unavailableReason?: string;
};

const parsedCache = new Map<string, Font>();
const faceIndex = new Map<string, FontFace>();

let customCounter = 0;

const indexFaces = (faces: FontFace[]): void => {
	for (const face of faces) faceIndex.set(face.key, face);
};

const sortedFamilies = (faces: FontFace[]): string[] =>
	[...new Set(faces.map((f) => f.family))].sort((a, b) =>
		a.localeCompare(b, undefined, { sensitivity: "base" }),
	);

/**
 * Enumerates installed system fonts. Resolves with an empty registry plus a
 * reason rather than throwing — an unavailable API is an expected state, not an
 * error, and the UI stays usable through the file-upload path.
 */
export const discoverSystemFonts = async (): Promise<FontRegistry> => {
	const empty = (reason: string): FontRegistry => ({
		faces: [],
		families: [],
		systemFontsAvailable: false,
		unavailableReason: reason,
	});

	if (typeof window === "undefined" || typeof window.queryLocalFonts !== "function") {
		return empty(
			"This browser does not support the Local Font Access API. Add a font file to continue.",
		);
	}

	let fontData: FontData[];
	try {
		fontData = await window.queryLocalFonts();
	} catch (err) {
		const name = err instanceof DOMException ? err.name : "";
		const reason =
			name === "SecurityError"
				? "Access to local fonts was blocked by browser policy. Add a font file to continue."
				: `Could not read local fonts (${err instanceof Error ? err.message : String(err)}). Add a font file to continue.`;
		return empty(reason);
	}

	if (fontData.length === 0) {
		return empty("No local fonts were returned. Add a font file to continue.");
	}

	const faces: FontFace[] = fontData.map((data) => ({
		key: data.postscriptName,
		family: data.family,
		style: data.style,
		fullName: data.fullName,
		source: "system" as const,
		load: async () => (await data.blob()).arrayBuffer(),
	}));

	indexFaces(faces);

	return {
		faces,
		families: sortedFamilies(faces),
		systemFontsAvailable: true,
	};
};

/**
 * Registers a user-supplied font file (drag/drop or file picker). Parses
 * immediately so a bad file is rejected at the point the user chose it, rather
 * than silently later when they type.
 */
export const registerCustomFont = async (file: File): Promise<FontFace> => {
	const buffer = await file.arrayBuffer();
	// Throws for unsupported/corrupt files — let the caller surface it.
	const font = parse(buffer);

	customCounter += 1;
	// `getEnglishName` walks the platform-keyed name table for us; reading
	// `names.fontFamily` directly works in opentype v1 but is always undefined
	// in v2, where names are nested under `windows` / `macintosh`.
	const family =
		font.getEnglishName("fontFamily") || file.name.replace(/\.[^.]+$/, "");
	const style = font.getEnglishName("fontSubfamily") || "Regular";

	const face: FontFace = {
		key: `custom:${customCounter}`,
		family,
		style,
		fullName: `${family} ${style}`.trim(),
		source: "custom",
		load: async () => buffer,
	};

	faceIndex.set(face.key, face);
	parsedCache.set(face.key, font);
	return face;
};

export const addFaceToRegistry = (
	registry: FontRegistry,
	face: FontFace,
): FontRegistry => {
	const faces = [...registry.faces.filter((f) => f.key !== face.key), face];
	return { ...registry, faces, families: sortedFamilies(faces) };
};

export const getFace = (key: string): FontFace | undefined => faceIndex.get(key);

export const facesForFamily = (
	registry: FontRegistry,
	family: string,
): FontFace[] =>
	registry.faces
		.filter((f) => f.family === family)
		.sort((a, b) => a.style.localeCompare(b.style));

/**
 * Parses a face on demand and caches it. Deliberately lazy: a Windows install
 * can carry several hundred faces and parsing them all up front would stall the
 * UI for seconds and hold tens of megabytes for no reason.
 */
export const loadFont = async (key: string): Promise<Font> => {
	const cached = parsedCache.get(key);
	if (cached) return cached;

	const face = faceIndex.get(key);
	if (!face) throw new Error(`Unknown font: ${key}`);

	const font = parse(await face.load());
	parsedCache.set(key, font);
	return font;
};

/**
 * Picks a sensible starting face — a plain upright weight of a common sign
 * font if one is installed, otherwise the first face available.
 */
export const pickDefaultFace = (registry: FontRegistry): FontFace | undefined => {
	if (registry.faces.length === 0) return undefined;

	const preferredFamilies = [
		"Arial",
		"Helvetica",
		"Segoe UI",
		"Roboto",
		"Verdana",
		"Tahoma",
		"DejaVu Sans",
		"Liberation Sans",
	];
	const isUpright = (f: FontFace) => /^(regular|book|normal)$/i.test(f.style);

	for (const family of preferredFamilies) {
		const matches = registry.faces.filter(
			(f) => f.family.toLowerCase() === family.toLowerCase(),
		);
		if (matches.length > 0) return matches.find(isUpright) ?? matches[0];
	}

	return registry.faces.find(isUpright) ?? registry.faces[0];
};
