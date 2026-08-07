/**
 * Step 1 — the blank: what shape the sign is and how big the board is.
 *
 * Two cards, and thickness sits with width and height because they are the same
 * question asked three times: how big is the board in front of you.
 *
 * Profile depth is deliberately absent. The old panel asked for stock thickness
 * and profile depth separately, then explained in a tooltip that the second
 * should be a little more than the first; here the thickness stepper sets both.
 * Step 4 and All settings still expose depth on its own for anyone who wants
 * to break that link. All settings likewise keeps the switch for *not* cutting
 * the sign out — nearly every sign wants it, so the wizard just does it.
 */

import { contoursToPathData } from "../../lib/geometry";
import {
	profileDepthFor,
	SIGN_SIZE_PRESETS,
	type SizePreset,
	matchSizePreset,
} from "../../lib/presets";
import type { BlankShape, Project } from "../../lib/project";
import { blankContour } from "../../lib/shapes";
import { Card, ChoiceGrid, Chips } from "../touch/Touch";
import { LengthStepper } from "./Controls";

/**
 * The card icons are the real outlines, drawn by the same code that draws the
 * canvas — so a change to a shape can never leave its icon behind. Built once
 * at module load: the tugboat's curves flatten to a few hundred points and
 * there is no reason to redo that on every render.
 */
const ICON_BOX = { width: 56, height: 28 };

const iconPath = (shape: BlankShape): string =>
	contoursToPathData([
		blankContour({
			shape,
			...ICON_BOX,
			cornerRadius: 5,
			depth: 0,
			stockThickness: 0,
			cutProfile: false,
		}),
	]);

const ICON_PATHS: Record<BlankShape, string> = {
	rectangle: iconPath("rectangle"),
	"rounded-rect": iconPath("rounded-rect"),
	ellipse: iconPath("ellipse"),
	boat: iconPath("boat"),
};

const ShapeIcon = ({ shape }: { shape: BlankShape }) => (
	<svg viewBox="-32 -18 64 36" className="h-8 w-full" aria-hidden focusable="false">
		<g transform="scale(1, -1)">
			<path
				d={ICON_PATHS[shape]}
				className="fill-amber-100 stroke-amber-700 dark:fill-amber-950 dark:stroke-amber-500"
				strokeWidth={1.5}
				vectorEffect="non-scaling-stroke"
			/>
		</g>
	</svg>
);

const StepShape = ({
	project,
	setProject,
}: {
	project: Project;
	setProject: (updater: (previous: Project) => Project) => void;
}) => {
	const { units, blank } = project;

	const patchBlank = (next: Partial<Project["blank"]>) =>
		setProject((p) => ({ ...p, blank: { ...p.blank, ...next } }));

	const activeSize = matchSizePreset(blank.width, blank.height);

	return (
		<>
			<Card title="Shape">
				<ChoiceGrid<BlankShape>
					value={blank.shape}
					onChange={(shape) => patchBlank({ shape })}
					options={[
						{
							value: "rectangle",
							label: "Rectangle",
							icon: <ShapeIcon shape="rectangle" />,
						},
						{
							value: "rounded-rect",
							label: "Rounded",
							icon: <ShapeIcon shape="rounded-rect" />,
						},
						{
							value: "ellipse",
							label: "Oval",
							icon: <ShapeIcon shape="ellipse" />,
						},
						{
							value: "boat",
							label: "Tugboat",
							icon: <ShapeIcon shape="boat" />,
						},
					]}
				/>
				{blank.shape === "rounded-rect" ? (
					<LengthStepper
						label="Corner rounding"
						units={units}
						value={blank.cornerRadius}
						min={0}
						onChange={(cornerRadius) => patchBlank({ cornerRadius })}
						hint="How round the four corners are."
					/>
				) : null}
			</Card>

			<Card title="Size" hint="Pick a common size, or set your own below.">
				<Chips<SizePreset>
					value={activeSize}
					isSelected={(option) => option.label === activeSize?.label}
					onChange={({ width, height }) => patchBlank({ width, height })}
					options={SIGN_SIZE_PRESETS.map((preset) => ({
						value: preset,
						label: preset.label,
					}))}
				/>
				<LengthStepper
					label="Width"
					units={units}
					value={blank.width}
					min={0}
					onChange={(width) => patchBlank({ width })}
				/>
				<LengthStepper
					label="Height"
					units={units}
					value={blank.height}
					min={0}
					onChange={(height) => patchBlank({ height })}
				/>
				<LengthStepper
					label="Board thickness"
					units={units}
					value={blank.stockThickness}
					min={0}
					onChange={(stockThickness) =>
						patchBlank({
							stockThickness,
							// Cut a little past the board so the sign actually releases.
							depth: profileDepthFor(stockThickness),
						})
					}
					hint="How thick is the board you're cutting?"
				/>
			</Card>
		</>
	);
};

export default StepShape;
