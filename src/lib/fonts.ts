/**
 * Font discovery and parsing.
 *
 * To cut text we need glyph *outlines*, not rendered pixels — which means we
 * need the font binary. `queryLocalFonts()` is the only browser API that hands
 * those over: each `FontData` exposes `.blob()`, which opentype.js can parse.
 *
 * It is Chromium-only, secure-contexts-only, and gated by the `local-fonts`
 * Permissions-Policy (default allowlist `self`). gSender mounts plugin iframes
 * same-origin with `allow-same-origin`, so the frame is covered by `self` — and
 * the desktop build is Electron, where the API is always there. Calls are still
 * feature-detected, but a failure now leaves the picker empty and says why
 * rather than offering a font-file fallback.
 */

import { type Font, parse } from "opentype.js";

export type FontFace = {
	/** Stable identity used in the project model — the postscript name. */
	key: string;
	family: string;
	style: string;
	fullName: string;
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

const indexFaces = (faces: FontFace[]): void => {
	for (const face of faces) faceIndex.set(face.key, face);
};

const sortedFamilies = (faces: FontFace[]): string[] =>
	[...new Set(faces.map((f) => f.family))].sort((a, b) =>
		a.localeCompare(b, undefined, { sensitivity: "base" }),
	);

/**
 * Enumerates installed system fonts. Resolves with an empty registry plus a
 * reason rather than throwing — the picker can say why it is empty, which is
 * more use than an exception nobody sees.
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
			"This browser does not support the Local Font Access API, so no fonts could be listed.",
		);
	}

	let fontData: FontData[];
	try {
		fontData = await window.queryLocalFonts();
	} catch (err) {
		const name = err instanceof DOMException ? err.name : "";
		const reason =
			name === "SecurityError"
				? "Access to local fonts was blocked by browser policy, so no fonts could be listed."
				: `Could not read local fonts: ${err instanceof Error ? err.message : String(err)}.`;
		return empty(reason);
	}

	if (fontData.length === 0) {
		return empty("No local fonts were returned.");
	}

	const faces: FontFace[] = fontData.map((data) => ({
		key: data.postscriptName,
		family: data.family,
		style: data.style,
		fullName: data.fullName,
		load: async () => (await data.blob()).arrayBuffer(),
	}));

	indexFaces(faces);

	return {
		faces,
		families: sortedFamilies(faces),
		systemFontsAvailable: true,
	};
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
