/**
 * Step 3 — arranging the sign: where the lettering sits, and where the holding
 * tabs go.
 *
 * The canvas does the interesting work here; this column exists for the things
 * dragging is bad at — landing exactly on centre, moving by a known amount, and
 * being discoverable in the first place.
 */

import { alignTextOffset, type AlignTarget } from "../../lib/presets";
import type { SignGeometry } from "../../lib/generate";
import { evenTabPositions, type Project } from "../../lib/project";
import {
	ActionChip,
	ActionRow,
	BigToggle,
	Card,
	FieldLabel,
	Hint,
	Stepper,
	TouchButton,
} from "../touch/Touch";
import { LengthStepper, unitSteps } from "./Controls";

const PAD_BUTTON =
	"h-16 w-16 cursor-pointer rounded-xl border-2 border-gray-300 text-2xl leading-none select-none hover:border-blue-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:border-gray-700";

const ALIGN_TARGETS: { target: AlignTarget; label: string }[] = [
	{ target: "top", label: "Top" },
	{ target: "bottom", label: "Bottom" },
	{ target: "left", label: "Left" },
	{ target: "right", label: "Right" },
];

const StepPlace = ({
	project,
	setProject,
	geometry,
	onMoveText,
}: {
	project: Project;
	setProject: (updater: (previous: Project) => Project) => void;
	geometry: SignGeometry;
	onMoveText: (x: number, y: number) => void;
}) => {
	const { units, text, tabs, blank } = project;
	const steps = unitSteps(units);

	const patchTabs = (next: Partial<Project["tabs"]>) =>
		setProject((p) => ({ ...p, tabs: { ...p.tabs, ...next } }));

	/** One tap moves by one step of the display units — 0.5mm, or 0.01in. */
	const nudgeBy = steps.length * steps.scale;

	const nudge = (dx: number, dy: number) =>
		onMoveText(text.x + dx * nudgeBy, text.y + dy * nudgeBy);

	const align = (target: AlignTarget) => {
		const next = alignTextOffset(target, geometry.layout.bounds, blank, {
			x: text.x,
			y: text.y,
		});
		onMoveText(next.x, next.y);
	};

	const tabCount = tabs.positions.length;

	return (
		<>
			<Card title="Move the lettering">
				<Hint>
					Drag the letters straight on the sign, or nudge them with the arrows.
					Each tap moves them a small step.
				</Hint>

				<div className="grid grid-cols-3 justify-items-center gap-2 self-center">
					<span />
					<button
						type="button"
						aria-label="Move up"
						className={PAD_BUTTON}
						onClick={() => nudge(0, 1)}
					>
						↑
					</button>
					<span />
					<button
						type="button"
						aria-label="Move left"
						className={PAD_BUTTON}
						onClick={() => nudge(-1, 0)}
					>
						←
					</button>
					<button
						type="button"
						aria-label="Centre the lettering"
						onClick={() => align("centre")}
						className="h-16 w-16 cursor-pointer rounded-xl border-2 border-blue-600 text-sm font-medium text-blue-700 hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:text-blue-300 dark:hover:bg-blue-950"
					>
						Centre
					</button>
					<button
						type="button"
						aria-label="Move right"
						className={PAD_BUTTON}
						onClick={() => nudge(1, 0)}
					>
						→
					</button>
					<span />
					<button
						type="button"
						aria-label="Move down"
						className={PAD_BUTTON}
						onClick={() => nudge(0, -1)}
					>
						↓
					</button>
					<span />
				</div>

				<div className="flex flex-col gap-1">
					<FieldLabel>Push it to an edge</FieldLabel>
					<ActionRow>
						{ALIGN_TARGETS.map(({ target, label }) => (
							<ActionChip
								key={target}
								label={label}
								onClick={() => align(target)}
							/>
						))}
					</ActionRow>
				</div>
			</Card>

			<Card
				title="Holding tabs"
				hint="Small bridges of wood that stop the sign coming loose and getting thrown before the cut finishes."
			>
				{blank.cutProfile ? (
					<>
						<BigToggle
							label="Leave holding tabs"
							checked={tabs.enabled}
							onChange={(enabled) => patchTabs({ enabled })}
						/>
						{tabs.enabled ? (
							<>
								<Stepper
									label="How many"
									value={tabCount}
									step={1}
									min={0}
									max={32}
									onChange={(count) =>
										patchTabs({
											positions: evenTabPositions(
												Math.max(0, Math.min(32, Math.round(count))),
											),
										})
									}
									hint="Tap the dashed line on the sign to add one exactly where you want it. Drag a tab to move it, press and hold to remove it."
								/>
								<TouchButton
									variant="quiet"
									onClick={() =>
										patchTabs({ positions: evenTabPositions(tabCount) })
									}
									disabled={tabCount === 0}
								>
									Space them evenly
								</TouchButton>
								<LengthStepper
									label="Tab thickness"
									units={units}
									value={tabs.height}
									min={0}
									onChange={(height) => patchTabs({ height })}
									hint="Measured up from the bottom of the cut."
								/>
								<LengthStepper
									label="Tab width"
									units={units}
									value={tabs.length}
									min={0}
									onChange={(length) => patchTabs({ length })}
								/>
							</>
						) : null}
					</>
				) : (
					<Hint>
						Tabs only apply when the sign is being cut out. Turn that back on
						under All settings if you want them.
					</Hint>
				)}
			</Card>
		</>
	);
};

export default StepPlace;
