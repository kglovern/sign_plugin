/**
 * The step rail across the top of the plugin.
 *
 * Every step is tappable at any time. The footer's Back / Next pair is the
 * happy path a first-timer follows; this rail is the escape for anyone who
 * knows they only want to change the text and cut again.
 */

export type StepKey = "shape" | "text" | "place" | "tune" | "carve";

export const STEPS: {
	key: StepKey;
	/** Short label for the rail. */
	label: string;
	/** The question the step answers, shown as its heading. */
	title: string;
}[] = [
	{ key: "shape", label: "Shape", title: "What shape is your sign?" },
	{ key: "text", label: "Text", title: "What should it say?" },
	{ key: "place", label: "Place", title: "Move things where you want them" },
	{ key: "tune", label: "Tune", title: "Anything to change before we cut?" },
	{ key: "carve", label: "Carve", title: "Here's what the machine will do" },
];

export const stepIndex = (key: StepKey): number =>
	STEPS.findIndex((s) => s.key === key);

const StepNav = ({
	current,
	onSelect,
	onOpenAllSettings,
}: {
	current: StepKey;
	onSelect: (key: StepKey) => void;
	onOpenAllSettings: () => void;
}) => {
	const currentIndex = stepIndex(current);

	return (
		<nav
			aria-label="Design steps"
			className="flex items-center gap-2 border-b border-gray-200 pb-2 dark:border-gray-800"
		>
			<ol className="m-0 flex min-w-0 grow list-none gap-1 overflow-x-auto p-0">
				{STEPS.map((step, index) => {
					const active = step.key === current;
					const done = index < currentIndex;
					return (
						<li key={step.key} className="shrink-0">
							<button
								type="button"
								aria-current={active ? "step" : undefined}
								onClick={() => onSelect(step.key)}
								className={`flex min-h-12 cursor-pointer items-center gap-2 rounded-xl border-2 px-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 ${
									active
										? "border-blue-500 bg-blue-500 text-white"
										: "border-transparent text-gray-600 hover:border-blue-300 dark:text-gray-300"
								}`}
							>
								<span
									aria-hidden
									className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
										active
											? "bg-white text-blue-700"
											: done
												? "bg-emerald-500 text-white"
												: "bg-gray-200 text-gray-600 dark:bg-slate-600 dark:text-gray-300"
									}`}
								>
									{done ? "✓" : index + 1}
								</span>
								<span className="text-base">{step.label}</span>
							</button>
						</li>
					);
				})}
			</ol>

			<button
				type="button"
				onClick={onOpenAllSettings}
				title="Open every setting at once"
				className="flex min-h-12 shrink-0 cursor-pointer items-center gap-2 rounded-xl border-2 border-gray-300 px-3 text-gray-600 hover:border-blue-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:border-gray-700 dark:text-gray-300"
			>
				<span aria-hidden>⚙</span>
				<span className="hidden text-base sm:inline">All settings</span>
			</button>
		</nav>
	);
};

export default StepNav;
