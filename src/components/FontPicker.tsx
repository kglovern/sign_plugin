import { useEffect, useRef, useState } from "react";

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
 * The family list is a custom filterable combobox rather than a native
 * `<select>` or `<input list>`/`<datalist>`: a Windows install routinely
 * carries several hundred families, and a native combobox with type-ahead
 * filtering beats scrolling a dropdown that long — but a `<datalist>`'s
 * suggestion popup is OS-rendered, isn't stylable/scrollable, and snaps the
 * input's value back to the last committed family the moment what's typed
 * doesn't exactly match one, making it impossible to clear and retype.
 */
const FontPicker = ({
	registry,
	onRegistryChange,
	selectedKey,
	onSelect,
}: Props) => {
	const fileRef = useRef<HTMLInputElement>(null);
	const [error, setError] = useState<string | null>(null);
	const [dragOver, setDragOver] = useState(false);
	const [query, setQuery] = useState("");
	const [open, setOpen] = useState(false);
	const [highlight, setHighlight] = useState(0);
	const optionMouseDown = useRef(false);

	const selected = registry.faces.find((f) => f.key === selectedKey);
	const family = selected?.family ?? "";
	const styles = family ? facesForFamily(registry, family) : [];

	// Keep the query in sync with the committed family when it changes for
	// reasons other than typing in this field (initial load, another control).
	useEffect(() => {
		setQuery(family);
	}, [family]);

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
		}
	};

	const chooseFamily = (nextFamily: string) => {
		const faces = facesForFamily(registry, nextFamily);
		if (faces.length === 0) return;
		const upright = faces.find((f) => /^(regular|book|normal)$/i.test(f.style));
		onSelect((upright ?? faces[0]).key);
		setQuery(nextFamily);
		setOpen(false);
	};

	const revert = () => {
		setQuery(family);
		setOpen(false);
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
			<label className="relative mb-2 flex flex-col gap-1 text-xs">
				<span className="text-gray-600 dark:text-gray-400">
					Font family
					{registry.faces.length > 0 ? (
						<span className="text-gray-400"> ({registry.families.length})</span>
					) : null}
				</span>
				<input
					value={query}
					placeholder={
						registry.families.length > 0 ? "Type to search…" : "No fonts loaded"
					}
					onChange={(e) => {
						setQuery(e.target.value);
						setOpen(true);
						setHighlight(0);
					}}
					onFocus={() => setOpen(true)}
					onBlur={() => {
						if (optionMouseDown.current) {
							optionMouseDown.current = false;
							return;
						}
						if (filtered.includes(query)) {
							chooseFamily(query);
						} else {
							revert();
						}
					}}
					onKeyDown={(e) => {
						if (e.key === "ArrowDown") {
							e.preventDefault();
							setOpen(true);
							setHighlight((h) => Math.min(h + 1, filtered.length - 1));
						} else if (e.key === "ArrowUp") {
							e.preventDefault();
							setHighlight((h) => Math.max(h - 1, 0));
						} else if (e.key === "Enter") {
							e.preventDefault();
							const pick = filtered[highlight] ?? filtered[0];
							if (pick) chooseFamily(pick);
							else revert();
							e.currentTarget.blur();
						} else if (e.key === "Escape") {
							e.preventDefault();
							revert();
							e.currentTarget.blur();
						}
					}}
					className={inputClass}
				/>
				{open && filtered.length > 0 ? (
					<div className="absolute top-full z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-gray-300 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800">
						{filtered.map((f, i) => (
							<button
								key={f}
								type="button"
								onMouseDown={() => {
									optionMouseDown.current = true;
								}}
								onClick={() => chooseFamily(f)}
								className={`block w-full cursor-pointer px-2 py-1.5 text-left text-sm ${
									i === highlight
										? "bg-blue-500 text-white"
										: "hover:bg-gray-100 dark:hover:bg-gray-700"
								}`}
							>
								{f}
							</button>
						))}
					</div>
				) : null}
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
