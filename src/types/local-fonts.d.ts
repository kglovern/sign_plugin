/**
 * Ambient declarations for the Local Font Access API (`window.queryLocalFonts`).
 *
 * Not yet in TypeScript's DOM lib. Chromium-only, secure contexts only, and
 * gated by the `local-fonts` Permissions-Policy — always feature-detect and
 * catch `SecurityError` before relying on it. See `src/lib/fonts.ts`.
 */
interface FontData {
	readonly postscriptName: string;
	readonly fullName: string;
	readonly family: string;
	readonly style: string;
	blob(): Promise<Blob>;
}

interface Window {
	queryLocalFonts?: (options?: {
		postscriptNames?: string[];
	}) => Promise<FontData[]>;
}
