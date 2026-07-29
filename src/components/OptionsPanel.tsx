import type { FontRegistry } from "../lib/fonts";
import {
	type Align,
	type BlankShape,
	evenTabPositions,
	type OriginMode,
	type OutlineSide,
	type Project,
	type TextStrategy,
	unitsScale,
} from "../lib/project";

import {
	CheckField,
	NumberField,
	Row,
	Section,
	SelectField,
	TextAreaField,
} from "./Fields";
import FontPicker from "./FontPicker";

type Props = {
	project: Project;
	setProject: (updater: (previous: Project) => Project) => void;
	registry: FontRegistry;
	onRegistryChange: (registry: FontRegistry) => void;
};

/** Trims float noise introduced by converting mm ↔ inches for display. */
const clean = (value: number): number => Number(value.toFixed(4));

/**
 * A length field. The model is always millimetres; this converts to and from
 * the workspace's display units so an inch user never sees a metric number.
 *
 * Defined at module scope (not inside `OptionsPanel`) so it keeps a stable
 * component identity across renders — otherwise React would remount the
 * underlying `<input>` on every keystroke and drop focus.
 */
const Length = ({
	label,
	value,
	onChange,
	units,
	scale,
	step,
	min,
	title,
	disabled,
}: {
	label: string;
	value: number;
	onChange: (mm: number) => void;
	units: Project["units"];
	scale: number;
	step: number;
	min?: number;
	title?: string;
	disabled?: boolean;
}) => (
	<NumberField
		label={label}
		suffix={units}
		value={clean(value / scale)}
		step={step}
		min={min}
		title={title}
		disabled={disabled}
		onChange={(v) => onChange(v * scale)}
	/>
);

const OptionsPanel = ({
	project,
	setProject,
	registry,
	onRegistryChange,
}: Props) => {
	const { units } = project;
	const scale = unitsScale(units);
	const imperial = units === "in";

	// Sensible increments per unit system — 0.5mm and 0.01in are both "one nudge".
	const lengthStep = imperial ? 0.01 : 0.5;
	const fineStep = imperial ? 0.001 : 0.1;
	const feedStep = imperial ? 1 : 10;

	const patch = <K extends keyof Project>(key: K, value: Project[K]) =>
		setProject((p) => ({ ...p, [key]: value }));

	const patchBlank = (next: Partial<Project["blank"]>) =>
		setProject((p) => ({ ...p, blank: { ...p.blank, ...next } }));
	const patchText = (next: Partial<Project["text"]>) =>
		setProject((p) => ({ ...p, text: { ...p.text, ...next } }));
	const patchTool = (next: Partial<Project["tool"]>) =>
		setProject((p) => ({ ...p, tool: { ...p.tool, ...next } }));
	const patchTabs = (next: Partial<Project["tabs"]>) =>
		setProject((p) => ({ ...p, tabs: { ...p.tabs, ...next } }));

	return (
		<div>
			<Section title="Workspace">
				<Row>
					<SelectField<OriginMode>
						label="Work origin"
						value={project.origin}
						title="Where you zeroed the machine relative to the blank."
						onChange={(origin) => patch("origin", origin)}
						options={[
							{ value: "center", label: "Blank centre" },
							{ value: "lower-left", label: "Lower-left" },
						]}
					/>
					<div className="mb-2 flex flex-col gap-1 text-xs">
						<span className="text-gray-600 dark:text-gray-400">Units</span>
						<span className="rounded-md border border-transparent px-2 py-1.5 text-sm text-gray-500">
							{units} (from gSender)
						</span>
					</div>
				</Row>
			</Section>

			<Section title="Blank">
				<SelectField<BlankShape>
					label="Shape"
					value={project.blank.shape}
					onChange={(shape) => patchBlank({ shape })}
					options={[
						{ value: "rectangle", label: "Rectangle" },
						{ value: "rounded-rect", label: "Rounded rectangle" },
						{ value: "ellipse", label: "Ellipse / circle" },
						{ value: "boat", label: "Tugboat" },
					]}
				/>
				<Row>
					<Length
						label="Width"
						units={units}
						scale={scale}
						step={lengthStep}
						value={project.blank.width}
						min={0}
						onChange={(width) => patchBlank({ width })}
					/>
					<Length
						label="Height"
						units={units}
						scale={scale}
						step={lengthStep}
						value={project.blank.height}
						min={0}
						onChange={(height) => patchBlank({ height })}
					/>
				</Row>
				{project.blank.shape === "rounded-rect" ? (
					<Length
						label="Corner radius"
						units={units}
						scale={scale}
						step={lengthStep}
						value={project.blank.cornerRadius}
						min={0}
						onChange={(cornerRadius) => patchBlank({ cornerRadius })}
					/>
				) : null}
				<Row>
					<Length
						label="Stock thickness"
						units={units}
						scale={scale}
						step={lengthStep}
						value={project.blank.stockThickness}
						min={0}
						onChange={(stockThickness) => patchBlank({ stockThickness })}
					/>
					<Length
						label="Profile depth"
						units={units}
						scale={scale}
						step={lengthStep}
						value={project.blank.depth}
						min={0}
						title="Cut a little past the stock thickness to guarantee a clean release."
						onChange={(depth) => patchBlank({ depth })}
					/>
				</Row>
				<CheckField
					label="Cut the profile"
					checked={project.blank.cutProfile}
					title="Turn off to engrave onto stock that is already cut to shape."
					onChange={(cutProfile) => patchBlank({ cutProfile })}
				/>
			</Section>

			<Section title="Text">
				<TextAreaField
					label="Content"
					value={project.text.content}
					onChange={(content) => patchText({ content })}
				/>

				<FontPicker
					registry={registry}
					onRegistryChange={onRegistryChange}
					selectedKey={project.text.fontKey}
					onSelect={(fontKey) => patchText({ fontKey })}
				/>

				<Row>
					<Length
						label="Size"
						units={units}
						scale={scale}
						step={lengthStep}
						value={project.text.size}
						min={0}
						onChange={(size) => patchText({ size })}
					/>
					<SelectField<Align>
						label="Align"
						value={project.text.align}
						onChange={(align) => patchText({ align })}
						options={[
							{ value: "left", label: "Left" },
							{ value: "center", label: "Centre" },
							{ value: "right", label: "Right" },
						]}
					/>
				</Row>
				<Row>
					<Length
						label="Letter spacing"
						units={units}
						scale={scale}
						value={project.text.letterSpacing}
						step={fineStep}
						onChange={(letterSpacing) => patchText({ letterSpacing })}
					/>
					<NumberField
						label="Line spacing"
						suffix="× size"
						value={project.text.lineSpacing}
						step={0.05}
						min={0.1}
						onChange={(lineSpacing) => patchText({ lineSpacing })}
					/>
				</Row>
				<Row>
					<Length
						label="X offset"
						units={units}
						scale={scale}
						step={lengthStep}
						value={project.text.x}
						onChange={(x) => patchText({ x })}
					/>
					<Length
						label="Y offset"
						units={units}
						scale={scale}
						step={lengthStep}
						value={project.text.y}
						onChange={(y) => patchText({ y })}
					/>
				</Row>

				<SelectField<TextStrategy>
					label="Cutting strategy"
					value={project.text.strategy}
					onChange={(strategy) => patchText({ strategy })}
					options={[
						{ value: "vcarve", label: "V-carve" },
						{ value: "pocket", label: "Pocket (clear inside)" },
						{ value: "outline", label: "Outline profile" },
						{ value: "engrave", label: "Engrave centreline" },
					]}
				/>
				{project.text.strategy === "outline" ? (
					<SelectField<OutlineSide>
						label="Cutter side"
						value={project.text.outlineSide}
						onChange={(outlineSide) => patchText({ outlineSide })}
						options={[
							{ value: "outside", label: "Outside (letter stands)" },
							{ value: "inside", label: "Inside (letter drops out)" },
							{ value: "on-line", label: "On the line" },
						]}
					/>
				) : null}
				<Length
					label={
						project.text.strategy === "vcarve" ? "Max text depth" : "Text depth"
					}
					units={units}
					scale={scale}
					step={lengthStep}
					value={project.text.depth}
					min={0}
					title={
						project.text.strategy === "vcarve"
							? "An upper limit. Narrow strokes come out shallower than this on their own."
							: undefined
					}
					onChange={(depth) => patchText({ depth })}
				/>
				{project.text.strategy === "vcarve" ? (
					<p className="text-[11px] leading-snug text-gray-500">
						V-carve is approximated with progressive offsets rather than a true
						medial axis. Check depth on scrap before committing.
					</p>
				) : null}
			</Section>

			<Section title="Tool &amp; feeds">
				{project.text.strategy === "vcarve" ? (
					<Row>
						<NumberField
							label="V-bit angle"
							suffix="°"
							value={project.tool.vBitAngle}
							step={5}
							min={1}
							max={179}
							title="Full included angle of the bit."
							onChange={(vBitAngle) => patchTool({ vBitAngle })}
						/>
						<Length
							label="V-bit diameter"
							units={units}
							scale={scale}
							step={lengthStep}
							value={project.tool.vBitDiameter}
							min={0}
							title="Caps how deep the carve can go before the shank is cutting."
							onChange={(vBitDiameter) => patchTool({ vBitDiameter })}
						/>
					</Row>
				) : null}
				<Row>
					<Length
						label="Endmill diameter"
						units={units}
						scale={scale}
						value={project.tool.endmillDiameter}
						step={fineStep}
						min={0}
						title="Used for the profile cut, and for pocket / outline text."
						onChange={(endmillDiameter) => patchTool({ endmillDiameter })}
					/>
					<Length
						label="Safe Z"
						units={units}
						scale={scale}
						step={lengthStep}
						value={project.tool.safeZ}
						min={0}
						onChange={(safeZ) => patchTool({ safeZ })}
					/>
				</Row>
				<Row>
					<NumberField
						label="Feedrate"
						suffix={`${units}/min`}
						value={clean(project.tool.feedrate / scale)}
						step={feedStep}
						min={1}
						onChange={(v) => patchTool({ feedrate: v * scale })}
					/>
					<NumberField
						label="Plunge rate"
						suffix={`${units}/min`}
						value={clean(project.tool.plungeRate / scale)}
						step={feedStep}
						min={1}
						onChange={(v) => patchTool({ plungeRate: v * scale })}
					/>
				</Row>
				<Row>
					<NumberField
						label="Spindle"
						suffix="RPM"
						value={project.tool.spindleRpm}
						step={500}
						min={0}
						onChange={(spindleRpm) => patchTool({ spindleRpm })}
					/>
					<NumberField
						label="Spin-up dwell"
						suffix="s"
						value={project.tool.spindleDwell}
						step={0.5}
						min={0}
						onChange={(spindleDwell) => patchTool({ spindleDwell })}
					/>
				</Row>
				<Row>
					<Length
						label="Stepdown"
						units={units}
						scale={scale}
						step={lengthStep}
						value={project.tool.stepdown}
						min={0.01}
						title="Maximum depth of cut per pass."
						onChange={(stepdown) => patchTool({ stepdown })}
					/>
					{project.text.strategy === "vcarve" ? (
						<Length
							label="V-carve ring step"
							units={units}
							scale={scale}
							value={project.tool.vcarveStepover}
							step={fineStep}
							min={0.01}
							title="Lateral spacing between rings. Smaller is smoother and slower."
							onChange={(vcarveStepover) => patchTool({ vcarveStepover })}
						/>
					) : (
						<NumberField
							label="Stepover"
							suffix="× dia"
							value={project.tool.stepover}
							step={0.05}
							min={0.05}
							max={1}
							title="Pocket clearing overlap, as a fraction of tool diameter."
							onChange={(stepover) => patchTool({ stepover })}
						/>
					)}
				</Row>
			</Section>

			<Section title="Tabs">
				<CheckField
					label="Leave holding tabs"
					checked={project.tabs.enabled}
					onChange={(enabled) => patchTabs({ enabled })}
				/>
				{project.tabs.enabled ? (
					<>
						<Row>
							<NumberField
								label="Count"
								value={project.tabs.positions.length}
								step={1}
								min={0}
								max={32}
								title="Redistributes tabs evenly around the profile. Drag them on the Design tab to place them by hand."
								onChange={(count) =>
									patchTabs({
										positions: evenTabPositions(
											Math.max(0, Math.min(32, Math.round(count))),
										),
									})
								}
							/>
							<Length
								label="Tab height"
								units={units}
								scale={scale}
								step={lengthStep}
								value={project.tabs.height}
								min={0}
								title="Measured up from the bottom of the profile cut."
								onChange={(height) => patchTabs({ height })}
							/>
						</Row>
						<Length
							label="Tab length"
							units={units}
							scale={scale}
							step={lengthStep}
							value={project.tabs.length}
							min={0}
							onChange={(length) => patchTabs({ length })}
						/>
						<button
							type="button"
							onClick={() =>
								patchTabs({
									positions: evenTabPositions(project.tabs.positions.length),
								})
							}
							disabled={project.tabs.positions.length === 0}
							className="mb-2 w-full cursor-pointer rounded-md border border-gray-300 px-2 py-1.5 text-xs hover:border-blue-500 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700"
						>
							Distribute evenly
						</button>
						<p className="text-[11px] leading-snug text-gray-500">
							On the Design tab: drag a tab to move it, click the dashed profile
							to add one, double-click or long-press a tab to remove it.
						</p>
					</>
				) : null}
			</Section>

			<Section title="Canvas">
				<Row>
					<Length
						label="Grid spacing"
						units={units}
						scale={scale}
						step={lengthStep}
						value={project.gridSpacing}
						min={0.1}
						onChange={(gridSpacing) => patch("gridSpacing", gridSpacing)}
					/>
					<div className="pt-5">
						<CheckField
							label="Snap to grid"
							checked={project.snapToGrid}
							title="Hold Alt while dragging to bypass."
							onChange={(snapToGrid) => patch("snapToGrid", snapToGrid)}
						/>
					</div>
				</Row>
			</Section>
		</div>
	);
};

export default OptionsPanel;
