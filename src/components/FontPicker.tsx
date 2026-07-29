import { useId, useRef, useState } from "react";

import {
	addFaceToRegistry,
	facesForFamily,
	type FontFace,
	type FontRegistry,
	registerCustomFont,
} from "../lib/fonts";

const inputClass =
	"w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm " +
	"dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100";

type Props = {
	registry: FontRegistry;
	onRegistryChange: (registry: FontRegistry) => void;
	selectedKey: string | null;
	onSelect: (key: string) => void;
};

/**
 * Family + style picker over the discovered fonts, with a file drop target for
 * the case where the Local Font Access API is unavailable — or where the user
 * simply wants a font that is not installed.
 *
 * The family list is a `<datalist>` rather than a `<select>`: a Windows install
 * routinely carries several hundred families, and a native combobox with
 * type-ahead filtering beats scrolling a dropdown that long.
 */
const FontPicker = ({
	registry,
	onRegistryChange,
	selectedKey,
	onSelect,
}: Props) => {
	const listId = useId();
	const fileRef = useRef<HTMLInputElement>(null);
	const [error, setError] = useState<string | null>(null);
	const [dragOver, setDragOver] = useState(false);

	const selected = registry.faces.find((f) => f.key === selectedKey);
	const family = selected?.family ?? "";
	const styles = family ? facesForFamily(registry, family) : [];

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
		}
	};

	const chooseFamily = (nextFamily: string) => {
		const faces = facesForFamily(registry, nextFamily);
		if (faces.length === 0) return;
		const upright = faces.find((f) => /^(regular|book|normal)$/i.test(f.style));
		onSelect((upright ?? faces[0]).key);
	};

	return (
		<div
			onDragOver={(e) => {
				e.preventDefault();
				setDragOver(true);
			}}
			onDragLeave={() => setDragOver(false)}
			onDrop={(e) => {
				e.preventDefault();
				setDragOver(false);
				void addFiles(e.dataTransfer.files);
			}}
			className={dragOver ? "rounded-md ring-2 ring-blue-500" : undefined}
		>
			<label className="mb-2 flex flex-col gap-1 text-xs">
				<span className="text-gray-600 dark:text-gray-400">
					Font family
					{registry.faces.length > 0 ? (
						<span className="text-gray-400"> ({registry.families.length})</span>
					) : null}
				</span>
				<input
					list={listId}
					value={family}
					placeholder={
						registry.families.length > 0 ? "Type to search…" : "No fonts loaded"
					}
					onChange={(e) => chooseFamily(e.target.value)}
					className={inputClass}
				/>
				<datalist id={listId}>
					{registry.families.map((f) => (
						<option key={f} value={f} />
					))}
				</datalist>
			</label>

			{styles.length > 1 ? (
				<label className="mb-2 flex flex-col gap-1 text-xs">
					<span className="text-gray-600 dark:text-gray-400">Style</span>
					<select
						value={selectedKey ?? ""}
						onChange={(e) => onSelect(e.target.value)}
						className={inputClass}
					>
						{styles.map((f) => (
							<option key={f.key} value={f.key}>
								{f.style}
							</option>
						))}
					</select>
				</label>
			) : null}

			{!registry.systemFontsAvailable && registry.unavailableReason ? (
				<p className="mb-2 rounded-md bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-200">
					{registry.unavailableReason}
				</p>
			) : null}

			<button
				type="button"
				onClick={() => fileRef.current?.click()}
				className="w-full cursor-pointer rounded-md border border-dashed border-gray-400 px-2 py-1.5 text-xs text-gray-600 hover:border-blue-500 hover:text-blue-600 dark:border-gray-600 dark:text-gray-400"
			>
				Add font file… (or drop a .ttf / .otf here)
			</button>
			<input
				ref={fileRef}
				type="file"
				accept=".ttf,.otf,.woff,font/ttf,font/otf"
				multiple
				hidden
				onChange={(e) => void addFiles(e.target.files)}
			/>

			{error ? (
				<p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>
			) : null}
		</div>
	);
};

export default FontPicker;
