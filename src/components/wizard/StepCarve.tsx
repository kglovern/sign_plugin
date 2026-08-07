/**
 * Step 5 — review and send.
 *
 * Reaching this step generates the toolpath by itself. The old panel required
 * the user to know they had to press "Generate toolpath" before anything would
 * appear, which is exactly the kind of hidden step a first-timer gets stuck on.
 *
 * The work origin lives here rather than with the other machine settings
 * because this is the moment it matters: the next thing the user does is walk
 * to the machine and zero it.
 */

import type { GenerateResult } from "../../lib/generate";
import type { OriginMode, Project } from "../../lib/project";
import { Card, Chips, Hint, TouchButton } from "../touch/Touch";
import { formatLength } from "./Controls";

const STRATEGY_NAMES: Record<Project["text"]["strategy"], string> = {
	pocket: "Pocket",
	outline: "Outline",
	engrave: "Engrave",
};

const Row = ({ label, value }: { label: string; value: string }) => (
	<div className="flex items-baseline justify-between gap-3 border-b border-gray-100 py-2 last:border-b-0 dark:border-gray-800">
		<span className="text-sm text-gray-500 dark:text-gray-400">{label}</span>
		<span className="text-right text-base font-medium tabular-nums">{value}</span>
	</div>
);

const StepCarve = ({
	project,
	setProject,
	result,
	busy,
	stale,
	sending,
	status,
	onGenerate,
	onLoad,
	onSave,
}: {
	project: Project;
	setProject: (updater: (previous: Project) => Project) => void;
	result: GenerateResult | null;
	busy: boolean;
	stale: boolean;
	sending: boolean;
	status: string | null;
	onGenerate: () => void;
	onLoad: () => void;
	onSave: () => void;
}) => {
	const { units, text, tool } = project;
	const passes = result?.toolpath.passes.length ?? 0;
	const warnings = result?.warnings ?? [];
	const nothingToCut = result !== null && passes === 0;

	return (
		<>
			<Card title="Where you zeroed the machine">
				<Chips<OriginMode>
					value={project.origin}
					onChange={(origin) => setProject((p) => ({ ...p, origin }))}
					options={[
						{ value: "center", label: "Middle of the board" },
						{ value: "lower-left", label: "Bottom-left corner" },
					]}
				/>
				<Hint>
					{project.origin === "center"
						? "Set X0 Y0 with the bit over the centre of the board, and Z0 on its top face."
						: "Set X0 Y0 with the bit over the bottom-left corner of the board, and Z0 on its top face."}
				</Hint>
			</Card>

			<Card title="The cut">
				{busy ? (
					<Hint>Working out the toolpath…</Hint>
				) : result === null ? (
					<TouchButton variant="secondary" onClick={onGenerate}>
						Work out the toolpath
					</TouchButton>
				) : (
					<div>
						<Row label="Passes" value={String(passes)} />
						<Row
							label="Deepest cut"
							value={formatLength(Math.abs(result.toolpath.minZ), units)}
						/>
						<Row label="Letters" value={STRATEGY_NAMES[text.strategy]} />
						<Row
							label="Bit"
							value={formatLength(
								tool.endmillDiameter,
								units,
								units === "in" ? 3 : 2,
							)}
						/>
						<Row
							label="Cut the sign out"
							value={project.blank.cutProfile ? "Yes" : "No"}
						/>
					</div>
				)}

				{stale && !busy ? (
					<p className="m-0 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
						The design changed since this was worked out.{" "}
						<button
							type="button"
							onClick={onGenerate}
							className="cursor-pointer underline"
						>
							Update it
						</button>
						.
					</p>
				) : null}
			</Card>

			{nothingToCut ? (
				<Card title="Nothing to cut">
					<Hint>
						No toolpath came out of these settings. Check that the sign has text,
						that a font is selected, and that the depths are above zero.
					</Hint>
				</Card>
			) : null}

			{warnings.length > 0 ? (
				<section className="mb-4 rounded-xl border-2 border-amber-400 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-950">
					<h2 className="m-0 text-base font-semibold text-amber-900 dark:text-amber-200">
						Worth checking
					</h2>
					<ul className="m-0 mt-2 flex list-disc flex-col gap-1 pl-5 text-sm text-amber-900 dark:text-amber-200">
						{warnings.map((warning) => (
							<li key={warning}>{warning}</li>
						))}
					</ul>
				</section>
			) : null}

			<Card title="Send it to the machine">
				<TouchButton
					variant="primary"
					className="min-h-16 text-lg"
					onClick={onLoad}
					disabled={sending || busy}
				>
					{sending ? "Loading…" : "Load to gSender →"}
				</TouchButton>
				<Hint>
					This loads the program into gSender ready to run. Nothing moves until
					you start it there.
				</Hint>
				<TouchButton variant="quiet" onClick={onSave} disabled={busy}>
					Save as a .nc file
				</TouchButton>
				{status ? (
					<p className="m-0 text-sm text-gray-600 dark:text-gray-300">{status}</p>
				) : null}
			</Card>
		</>
	);
};

export default StepCarve;
