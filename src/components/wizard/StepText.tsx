/**
 * Step 2 — the lettering: what it says, in what font, cut which way, with
 * which bit.
 *
 * The bit lives here rather than with the feeds and speeds because choosing it
 * is a physical act — the user is looking at what is in the collet — and
 * because for pocket and outline it is the thing that decides whether the
 * letters can be cut at all.
 */

import type { Font } from "opentype.js";
import { useState } from "react";

import {
	facesForFamily,
	type FontRegistry,
	isUpright,
	weightChoicesForFamily,
} from "../../lib/fonts";
import { boundsSize } from "../../lib/geometry";
import type { SignGeometry } from "../../lib/generate";
import { BIT_PRESETS, fitTextSize, matchBitPreset } from "../../lib/presets";
import type {
	Align,
	OutlineSide,
	Project,
	TextStrategy,
} from "../../lib/project";
import {
	Card,
	type Chip,
	ChoiceGrid,
	Chips,
	FieldLabel,
	Hint,
	TouchButton,
} from "../touch/Touch";
import { formatLength, LengthStepper, unitSteps } from "./Controls";

/** Sentinel for the "not one of the listed bits" chip. */
const OTHER = "__other__";

/**
 * Rough guard against picking a bit that cannot fit inside the letters. The
 * real answer needs the glyph outlines — `generate()` reports that on the last
 * step — but a quarter-inch bit and quarter-inch letters is worth flagging
 * before the user has walked three more screens.
 */
const bitLooksTooWide = (project: Project): boolean =>
	(project.text.strategy === "pocket" || project.text.strategy === "outline") &&
	project.tool.endmillDiameter > project.text.size / 4;

const StepText = ({
	project,
	setProject,
	font,
	geometry,
	registry,
}: {
	project: Project;
	setProject: (updater: (previous: Project) => Project) => void;
	font: Font | null;
	geometry: SignGeometry;
	registry: FontRegistry;
}) => {
	const { units, text, tool } = project;
	const steps = unitSteps(units);
	const [customBit, setCustomBit] = useState(false);

	const patchText = (next: Partial<Project["text"]>) =>
		setProject((p) => ({ ...p, text: { ...p.text, ...next } }));
	const patchTool = (next: Partial<Project["tool"]>) =>
		setProject((p) => ({ ...p, tool: { ...p.tool, ...next } }));

	const selectedFace = registry.faces.find((f) => f.key === text.fontKey);
	const family = selectedFace?.family;
	const weights = family ? weightChoicesForFamily(registry, family) : [];

	/**
	 * Whatever is selected must have a chip, or the row shows nothing chosen. A
	 * face outside the three weights can still be reached from All settings, and
	 * gets a chip of its own under the name the font itself uses.
	 */
	const weightChips: Chip<string>[] = weights.map(({ label, face }) => ({
		value: face.key,
		label,
	}));
	if (selectedFace && !weights.some(({ face }) => face.key === selectedFace.key)) {
		weightChips.push({ value: selectedFace.key, label: selectedFace.style });
	}

	/**
	 * Picking a family picks a face: the plain upright weight if there is one, so
	 * choosing "Georgia" never lands the user in Georgia Bold Italic. The
	 * remaining weights are offered by the Weight chips below.
	 */
	const chooseFamily = (nextFamily: string) => {
		const faces = facesForFamily(registry, nextFamily);
		if (faces.length === 0) return;
		const choices = weightChoicesForFamily(registry, nextFamily);
		const fallback = choices[0]?.face ?? faces[0];
		patchText({ fontKey: (faces.find(isUpright) ?? fallback).key });
	};

	const matchedBit = matchBitPreset(tool.endmillDiameter);
	const showCustomBit = customBit || matchedBit === null;

	const bitChips = [
		...BIT_PRESETS.map((preset) => ({
			value: preset.label,
			label: preset.label,
			sub: formatLength(preset.diameter, units, units === "in" ? 3 : 2),
		})),
		{ value: OTHER, label: "Other…" },
	];

	const fitToSign = () => {
		if (!font) return;
		patchText({ size: fitTextSize(font, text, project.blank) });
	};

	const textSize = boundsSize(geometry.layout.bounds);

	return (
		<>
			<Card title="Words">
				<label className="flex flex-col gap-1">
					<FieldLabel>Sign text</FieldLabel>
					<textarea
						value={text.content}
						rows={3}
						onChange={(e) => patchText({ content: e.target.value })}
						placeholder="Type what the sign should say"
						className="min-h-24 w-full resize-y rounded-xl border-2 border-gray-300 bg-white p-3 text-lg dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
					/>
				</label>
				<Hint>Press Enter for a second line.</Hint>

				<div className="flex flex-col gap-1">
					<FieldLabel>Font</FieldLabel>
					{/*
					 * A native select rather than a custom list: the installed fonts are
					 * the only fonts, the OS renders the dropdown at a size a finger can
					 * hit, and Chromium honours the per-option `font-family` so the list
					 * still previews itself.
					 */}
					<select
						value={family ?? ""}
						onChange={(e) => chooseFamily(e.target.value)}
						className="min-h-14 w-full rounded-xl border-2 border-gray-300 bg-white px-4 text-lg dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
					>
						{family ? null : (
							<option value="">
								{registry.families.length > 0 ? "Choose a font…" : "No fonts found"}
							</option>
						)}
						{registry.families.map((f) => (
							<option key={f} value={f} style={{ fontFamily: `"${f}", sans-serif` }}>
								{f}
							</option>
						))}
					</select>
					{!registry.systemFontsAvailable && registry.unavailableReason ? (
						<p className="m-0 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
							{registry.unavailableReason}
						</p>
					) : null}
				</div>

				{weightChips.length > 1 ? (
					<div className="flex flex-col gap-1">
						<FieldLabel>Weight</FieldLabel>
						<Chips<string>
							value={text.fontKey}
							onChange={(fontKey) => patchText({ fontKey })}
							options={weightChips}
						/>
					</div>
				) : null}
			</Card>

			<Card title="Letter size">
				<LengthStepper
					label="Letter height"
					units={units}
					value={text.size}
					min={0}
					onChange={(size) => patchText({ size })}
				/>
				<TouchButton variant="secondary" onClick={fitToSign} disabled={!font}>
					Fit to the sign
				</TouchButton>
				{textSize.width > 0 ? (
					<Hint>
						Currently {formatLength(textSize.width, units)} wide by{" "}
						{formatLength(textSize.height, units)} tall.
					</Hint>
				) : null}

				<div className="flex flex-col gap-1">
					<FieldLabel>Line up</FieldLabel>
					<Chips<Align>
						value={text.align}
						onChange={(align) => patchText({ align })}
						options={[
							{ value: "left", label: "Left" },
							{ value: "center", label: "Centre" },
							{ value: "right", label: "Right" },
						]}
					/>
					<Hint>Only matters when the sign has more than one line.</Hint>
				</div>
			</Card>

			<Card title="How to cut the letters">
				<ChoiceGrid<TextStrategy>
					columns={1}
					value={text.strategy}
					onChange={(strategy) => patchText({ strategy })}
					options={[
						{
							value: "engrave",
							label: "Engrave",
							hint: "A single line down the middle of each stroke. Fastest.",
						},
						{
							value: "pocket",
							label: "Pocket",
							hint: "Flat-bottomed letters, cleared right out. Slowest, boldest.",
						},
						{
							value: "outline",
							label: "Outline",
							hint: "Traces around each letter without clearing the middle.",
						},
					]}
				/>

				{text.strategy === "outline" ? (
					<div className="flex flex-col gap-1">
						<FieldLabel>Which side of the line</FieldLabel>
						<Chips<OutlineSide>
							value={text.outlineSide}
							onChange={(outlineSide) => patchText({ outlineSide })}
							options={[
								{ value: "outside", label: "Outside", sub: "letter stands" },
								{ value: "inside", label: "Inside", sub: "letter drops out" },
								{ value: "on-line", label: "On the line" },
							]}
						/>
					</div>
				) : null}
			</Card>

			<Card
				title="Which bit is in your router?"
				hint="This bit cuts the letters and cuts the sign out."
			>
				<div className="flex flex-col gap-1">
					<FieldLabel>Straight bit</FieldLabel>
					<Chips<string>
						value={showCustomBit ? OTHER : (matchedBit?.label ?? OTHER)}
						options={bitChips}
						onChange={(choice) => {
							if (choice === OTHER) {
								setCustomBit(true);
								return;
							}
							setCustomBit(false);
							const preset = BIT_PRESETS.find((p) => p.label === choice);
							if (preset) patchTool({ endmillDiameter: preset.diameter });
						}}
					/>
				</div>
				{showCustomBit ? (
					<LengthStepper
						label="Bit diameter"
						units={units}
						step={steps.fine}
						value={tool.endmillDiameter}
						min={0}
						onChange={(endmillDiameter) => patchTool({ endmillDiameter })}
					/>
				) : null}

				{bitLooksTooWide(project) ? (
					<p className="m-0 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
						That bit may be too wide to fit inside letters this small. Try a
						smaller bit, bigger letters, or Engrave.
					</p>
				) : null}
			</Card>
		</>
	);
};

export default StepText;
