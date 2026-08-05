/**
 * Full-screen font browser.
 *
 * The old picker was a filterable combobox — the right answer for a keyboard,
 * the wrong one for a finger. This shows the same families as a list of rows
 * big enough to tap, each set in the face it names, because "what does it look
 * like" is the only question anyone is actually asking of a font list.
 *
 * Row previews use CSS `font-family`, which resolves against installed fonts.
 * A font added from a file has not been installed, so its row falls back to the
 * page font — the name is still right, and the design canvas shows the real
 * outlines the moment it is selected.
 */

import { useRef, useState } from "react";

import {
	addFaceToRegistry,
	facesForFamily,
	type FontFace,
	type FontRegistry,
	registerCustomFont,
} from "../../lib/fonts";
import { Hint, Sheet, TouchButton } from "../touch/Touch";

const FontSheet = ({
	registry,
	onRegistryChange,
	selectedKey,
	onSelect,
	onClose,
}: {
	registry: FontRegistry;
	onRegistryChange: (registry: FontRegistry) => void;
	selectedKey: string | null;
	onSelect: (key: string) => void;
	onClose: () => void;
}) => {
	const fileRef = useRef<HTMLInputElement>(null);
	const [query, setQuery] = useState("");
	const [error, setError] = useState<string | null>(null);

	const selectedFamily = registry.faces.find((f) => f.key === selectedKey)?.family;

	const filtered = registry.families.filter((f) =>
		f.toLowerCase().includes(query.trim().toLowerCase()),
	);

	const addFiles = async (files: FileList | null) => {
		if (!files || files.length === 0) return;
		setError(null);

		let next = registry;
		let added: FontFace | null = null;
		for (const file of Array.from(files)) {
			try {
				const face = await registerCustomFont(file);
				next = addFaceToRegistry(next, face);
				added = face;
			} catch (err) {
				setError(
					`Could not read ${file.name}: ${err instanceof Error ? err.message : String(err)}`,
				);
			}
		}

		if (added) {
			onRegistryChange(next);
			onSelect(added.key);
			onClose();
		}
	};

	/**
	 * Picking a family picks a face: the plain upright weight if there is one,
	 * so choosing "Georgia" never lands the user in Georgia Bold Italic. The
	 * remaining weights are offered back on the Text step.
	 */
	const chooseFamily = (family: string) => {
		const faces = facesForFamily(registry, family);
		if (faces.length === 0) return;
		const upright = faces.find((f) => /^(regular|book|normal)$/i.test(f.style));
		onSelect((upright ?? faces[0]).key);
		onClose();
	};

	return (
		<Sheet
			title="Choose a font"
			onClose={onClose}
			footer={
				<>
					<TouchButton
						variant="quiet"
						className="w-full"
						onClick={() => fileRef.current?.click()}
					>
						Add a font file (.ttf or .otf)
					</TouchButton>
					<input
						ref={fileRef}
						type="file"
						accept=".ttf,.otf,.woff,font/ttf,font/otf"
						multiple
						hidden
						onChange={(e) => void addFiles(e.target.files)}
					/>
					{error ? (
						<p className="m-0 mt-2 text-sm text-red-600 dark:text-red-400">
							{error}
						</p>
					) : null}
				</>
			}
		>
			<input
				type="search"
				value={query}
				placeholder={
					registry.families.length > 0
						? `Search ${registry.families.length} fonts…`
						: "No fonts loaded"
				}
				onChange={(e) => setQuery(e.target.value)}
				className="mb-3 h-14 w-full rounded-xl border-2 border-gray-300 bg-white px-4 text-base dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
			/>

			{!registry.systemFontsAvailable && registry.unavailableReason ? (
				<p className="mb-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
					{registry.unavailableReason}
				</p>
			) : null}

			{filtered.length === 0 && registry.families.length > 0 ? (
				<Hint>No fonts match “{query}”.</Hint>
			) : null}

			<ul className="m-0 flex list-none flex-col gap-1 p-0">
				{filtered.map((family) => {
					const selected = family === selectedFamily;
					return (
						<li key={family}>
							<button
								type="button"
								aria-pressed={selected}
								onClick={() => chooseFamily(family)}
								className={`flex min-h-16 w-full cursor-pointer flex-col justify-center gap-0.5 rounded-xl border-2 px-4 py-2 text-left ${
									selected
										? "border-blue-600 bg-blue-50 dark:bg-blue-950"
										: "border-transparent hover:border-blue-300 dark:hover:border-blue-700"
								}`}
							>
								<span
									className="truncate text-2xl leading-tight"
									style={{ fontFamily: `"${family}", sans-serif` }}
								>
									{family}
								</span>
								<span className="text-xs text-gray-500 dark:text-gray-400">
									{family}
								</span>
							</button>
						</li>
					);
				})}
			</ul>
		</Sheet>
	);
};

export default FontSheet;
