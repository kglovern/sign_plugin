import { useEffect, useRef, useState } from "react";

import { facesForFamily, type FontRegistry, isUpright } from "../lib/fonts";

import { inputClass } from "./Fields";

type Props = {
	registry: FontRegistry;
	selectedKey: string | null;
	onSelect: (key: string) => void;
};

/**
 * Family + style picker over the installed fonts.
 *
 * The family list is a custom filterable combobox rather than a native
 * `<select>` or `<input list>`/`<datalist>`: a Windows install routinely
 * carries several hundred families, and a native combobox with type-ahead
 * filtering beats scrolling a dropdown that long — but a `<datalist>`'s
 * suggestion popup is OS-rendered, isn't stylable/scrollable, and snaps the
 * input's value back to the last committed family the moment what's typed
 * doesn't exactly match one, making it impossible to clear and retype.
 */
const FontPicker = ({ registry, selectedKey, onSelect }: Props) => {
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

	const chooseFamily = (nextFamily: string) => {
		const faces = facesForFamily(registry, nextFamily);
		if (faces.length === 0) return;
		onSelect((faces.find(isUpright) ?? faces[0]).key);
		setQuery(nextFamily);
		setOpen(false);
	};

	const revert = () => {
		setQuery(family);
		setOpen(false);
	};

	return (
		<div>
			<label className="relative mb-3 flex flex-col gap-1 text-sm">
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
								className={`block min-h-12 w-full cursor-pointer px-3 py-2 text-left text-base ${
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
				<label className="mb-3 flex flex-col gap-1 text-sm">
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
				<p className="mb-3 rounded-md bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
					{registry.unavailableReason}
				</p>
			) : null}
		</div>
	);
};

export default FontPicker;
