/**
 * Step 4 — depth, feeds and speeds.
 *
 * Everything here already has a working default, so the step has to read as
 * skippable: two plain-language cards, and the numbers that only mean something
 * once you have cut a few signs folded away behind "Advanced".
 */

import {
	FEED_PRESETS,
	type FeedPreset,
	matchFeedPreset,
} from "../../lib/presets";
import type { Project } from "../../lib/project";
import { Card, Chips, FieldLabel, Hint, Stepper } from "../touch/Touch";
import { LengthStepper, unitSteps } from "./Controls";

const StepTune = ({
	project,
	setProject,
}: {
	project: Project;
	setProject: (updater: (previous: Project) => Project) => void;
}) => {
	const { units, text, tool, blank } = project;
	const steps = unitSteps(units);

	const patchText = (next: Partial<Project["text"]>) =>
		setProject((p) => ({ ...p, text: { ...p.text, ...next } }));
	const patchTool = (next: Partial<Project["tool"]>) =>
		setProject((p) => ({ ...p, tool: { ...p.tool, ...next } }));
	const patchBlank = (next: Partial<Project["blank"]>) =>
		setProject((p) => ({ ...p, blank: { ...p.blank, ...next } }));

	const activeFeed = matchFeedPreset(tool);
	const vcarve = text.strategy === "vcarve";

	return (
		<>
			<Card title="How deep">
				<LengthStepper
					label={vcarve ? "Deepest the letters go" : "Letter depth"}
					units={units}
					value={text.depth}
					min={0}
					onChange={(depth) => patchText({ depth })}
					hint={
						vcarve
							? "An upper limit. Thin strokes come out shallower than this on their own."
							: undefined
					}
				/>
				{blank.cutProfile ? (
					<LengthStepper
						label="Cut-out depth"
						units={units}
						value={blank.depth}
						min={0}
						onChange={(depth) => patchBlank({ depth })}
						hint="Should be a little more than the board thickness so the sign comes free."
					/>
				) : null}
			</Card>

			<Card
				title="How fast"
				hint="Pick what you're cutting and the rest is filled in for you."
			>
				<Chips<FeedPreset>
					value={activeFeed}
					isSelected={(option) => option.value.id === activeFeed?.id}
					onChange={({ feedrate, plungeRate, spindleRpm, stepdown }) =>
						patchTool({ feedrate, plungeRate, spindleRpm, stepdown })
					}
					options={FEED_PRESETS.map((preset) => ({
						value: preset,
						label: preset.label,
						sub: preset.hint,
					}))}
				/>
				<LengthStepper
					label="Cutting speed"
					units={units}
					suffix={`${units}/min`}
					step={steps.feed}
					value={tool.feedrate}
					min={1}
					onChange={(feedrate) => patchTool({ feedrate })}
					hint="How fast the bit travels across the board."
				/>
				<LengthStepper
					label="Plunge speed"
					units={units}
					suffix={`${units}/min`}
					step={steps.feed}
					value={tool.plungeRate}
					min={1}
					onChange={(plungeRate) => patchTool({ plungeRate })}
					hint="How fast it drops down into the wood. Slower than cutting."
				/>
				<Stepper
					label="Spindle speed"
					suffix="RPM"
					value={tool.spindleRpm}
					step={500}
					min={0}
					onChange={(spindleRpm) => patchTool({ spindleRpm })}
				/>
			</Card>

			<Card title="Advanced" collapsible defaultOpen={false}>
				<LengthStepper
					label="Bite per pass"
					units={units}
					value={tool.stepdown}
					min={0.01}
					onChange={(stepdown) => patchTool({ stepdown })}
					hint="The most material taken off in one pass. Deeper cuts are split into several."
				/>
				{vcarve ? (
					<LengthStepper
						label="V-carve ring spacing"
						units={units}
						step={steps.fine}
						value={tool.vcarveStepover}
						min={0.01}
						onChange={(vcarveStepover) => patchTool({ vcarveStepover })}
						hint="Smaller is smoother and slower."
					/>
				) : (
					<Stepper
						label="Overlap"
						suffix="× bit width"
						value={tool.stepover}
						step={0.05}
						min={0.05}
						max={1}
						onChange={(stepover) => patchTool({ stepover })}
						hint="How much each clearing pass overlaps the last."
					/>
				)}
				<LengthStepper
					label="Safe height"
					units={units}
					value={tool.safeZ}
					min={0}
					onChange={(safeZ) => patchTool({ safeZ })}
					hint="How far above the board the bit lifts when moving between cuts."
				/>
				<Stepper
					label="Spin-up wait"
					suffix="seconds"
					value={tool.spindleDwell}
					step={0.5}
					min={0}
					onChange={(spindleDwell) => patchTool({ spindleDwell })}
					hint="Time given to the spindle to reach speed before cutting starts."
				/>
				<div>
					<FieldLabel>Units</FieldLabel>
					<Hint>{units} — set by gSender, not here.</Hint>
				</div>
			</Card>
		</>
	);
};

export default StepTune;
