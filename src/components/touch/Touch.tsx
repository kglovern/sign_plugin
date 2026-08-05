/**
 * Touch primitives for the guided workflow.
 *
 * gSender usually runs on a touchscreen bolted to the machine, so every control
 * here is sized for a finger rather than a cursor: nothing is under 48px, text
 * never drops below 16px (smaller than that and mobile browsers zoom the page
 * when a field takes focus), and selection is shown by filling a card rather
 * than by a hairline border nobody can see at arm's length.
 *
 * Tailwind v4 is configured entirely from `index.css` with no config file, so
 * the shared sizes live here as exported class strings — the same approach the
 * older `Fields.tsx` takes with `inputClass`.
 */

import {
	type ReactNode,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";

/** 48px — the floor for anything tappable. */
export const CONTROL = "min-h-12 text-base";
/** 56px — primary actions and stepper buttons. */
export const ACTION = "min-h-14 text-base font-medium";
/** 80px — choice cards, which carry a label and a line of explanation. */
export const CARD = "min-h-20";

const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600";

const SELECTED =
	"border-blue-600 bg-blue-50 text-blue-900 dark:bg-blue-950 dark:text-blue-100";
const UNSELECTED =
	"border-gray-300 hover:border-blue-400 dark:border-gray-700 dark:hover:border-blue-600";

// --- Text --------------------------------------------------------------------

/** Plain-English explanation under a control. This is where the guidance lives. */
export const Hint = ({ children }: { children: ReactNode }) => (
	<p className="m-0 text-sm leading-snug text-gray-500 dark:text-gray-400">
		{children}
	</p>
);

export const FieldLabel = ({ children }: { children: ReactNode }) => (
	<span className="text-sm font-medium text-gray-700 dark:text-gray-300">
		{children}
	</span>
);

/**
 * A titled block within a step. Optionally collapsible, for the settings a
 * first-timer should be able to scroll straight past.
 */
export const Card = ({
	title,
	hint,
	children,
	collapsible = false,
	defaultOpen = true,
}: {
	title: string;
	hint?: ReactNode;
	children: ReactNode;
	collapsible?: boolean;
	defaultOpen?: boolean;
}) => {
	const [open, setOpen] = useState(defaultOpen);
	const isOpen = collapsible ? open : true;

	return (
		<section className="mb-4 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
			{collapsible ? (
				<button
					type="button"
					onClick={() => setOpen((o) => !o)}
					aria-expanded={isOpen}
					className={`${CONTROL} ${FOCUS} -m-1 flex w-full cursor-pointer items-center justify-between rounded-lg p-1 text-left`}
				>
					<span className="text-base font-semibold">{title}</span>
					<span
						aria-hidden
						className={`text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
					>
						▾
					</span>
				</button>
			) : (
				<h2 className="m-0 text-base font-semibold">{title}</h2>
			)}

			{hint && isOpen ? <div className="mt-1">{<Hint>{hint}</Hint>}</div> : null}
			{isOpen ? <div className="mt-3 flex flex-col gap-3">{children}</div> : null}
		</section>
	);
};

// --- Buttons -----------------------------------------------------------------

type ButtonVariant = "primary" | "secondary" | "quiet";

const VARIANTS: Record<ButtonVariant, string> = {
	primary:
		"border-blue-600 bg-blue-600 text-white hover:bg-blue-700 hover:border-blue-700",
	secondary:
		"border-blue-600 text-blue-700 hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-blue-950",
	quiet:
		"border-gray-300 text-gray-700 hover:border-blue-400 dark:border-gray-700 dark:text-gray-300",
};

export const TouchButton = ({
	children,
	onClick,
	variant = "quiet",
	disabled,
	title,
	className = "",
	type = "button",
}: {
	children: ReactNode;
	onClick?: () => void;
	variant?: ButtonVariant;
	disabled?: boolean;
	title?: string;
	className?: string;
	type?: "button" | "submit";
}) => (
	<button
		type={type === "submit" ? "submit" : "button"}
		onClick={onClick}
		disabled={disabled}
		title={title}
		className={`${ACTION} ${FOCUS} ${VARIANTS[variant]} flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 px-4 disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
	>
		{children}
	</button>
);

// --- Choices -----------------------------------------------------------------

export type Choice<T extends string> = {
	value: T;
	label: string;
	hint?: string;
	icon?: ReactNode;
};

/**
 * The main "pick one of a few things" control: a grid of cards big enough to
 * carry an illustration and a line explaining what the option actually does.
 */
export const ChoiceGrid = <T extends string>({
	value,
	options,
	onChange,
	columns = 2,
}: {
	value: T;
	options: Choice<T>[];
	onChange: (value: T) => void;
	columns?: 1 | 2;
}) => (
	<div
		role="radiogroup"
		className={`grid gap-2 ${columns === 1 ? "grid-cols-1" : "grid-cols-2"}`}
	>
		{options.map((option) => {
			const selected = option.value === value;
			return (
				<button
					key={option.value}
					type="button"
					role="radio"
					aria-checked={selected}
					onClick={() => onChange(option.value)}
					className={`${CARD} ${FOCUS} flex cursor-pointer flex-col items-start gap-1 rounded-xl border-2 p-3 text-left ${
						selected ? SELECTED : UNSELECTED
					}`}
				>
					{option.icon ? (
						<span className="pointer-events-none flex h-8 w-full items-center justify-center">
							{option.icon}
						</span>
					) : null}
					<span className="text-base font-medium">{option.label}</span>
					{option.hint ? (
						<span className="text-xs leading-snug text-gray-500 dark:text-gray-400">
							{option.hint}
						</span>
					) : null}
				</button>
			);
		})}
	</div>
);

export type Chip<T> = { value: T; label: string; sub?: string };

/**
 * A wrapping row of pills, for picking from a short list of known-good values —
 * bit sizes, sign sizes, material feeds.
 */
export const Chips = <T,>({
	value,
	options,
	onChange,
	isSelected,
}: {
	value: T | null;
	options: Chip<T>[];
	onChange: (value: T) => void;
	/** Overrides identity comparison, for values that are objects. */
	isSelected?: (option: Chip<T>) => boolean;
}) => (
	<div role="radiogroup" className="flex flex-wrap gap-2">
		{options.map((option) => {
			const selected = isSelected
				? isSelected(option)
				: option.value === value;
			return (
				<button
					key={option.label}
					type="button"
					role="radio"
					aria-checked={selected}
					onClick={() => onChange(option.value)}
					className={`${CONTROL} ${FOCUS} flex cursor-pointer flex-col items-center justify-center rounded-full border-2 px-4 py-1 leading-tight ${
						selected ? SELECTED : UNSELECTED
					}`}
				>
					<span className="font-medium">{option.label}</span>
					{option.sub ? (
						<span className="text-xs text-gray-500 dark:text-gray-400">
							{option.sub}
						</span>
					) : null}
				</button>
			);
		})}
	</div>
);

/** A row of equally sized buttons that fire an action rather than select one. */
export const ActionRow = ({ children }: { children: ReactNode }) => (
	<div className="flex flex-wrap gap-2">{children}</div>
);

export const ActionChip = ({
	label,
	onClick,
	disabled,
}: {
	label: string;
	onClick: () => void;
	disabled?: boolean;
}) => (
	<button
		type="button"
		onClick={onClick}
		disabled={disabled}
		className={`${CONTROL} ${FOCUS} ${UNSELECTED} grow cursor-pointer rounded-full border-2 px-4 disabled:cursor-not-allowed disabled:opacity-40`}
	>
		{label}
	</button>
);

// --- Toggle ------------------------------------------------------------------

export const BigToggle = ({
	label,
	hint,
	checked,
	onChange,
}: {
	label: string;
	hint?: string;
	checked: boolean;
	onChange: (checked: boolean) => void;
}) => (
	<button
		type="button"
		role="switch"
		aria-checked={checked}
		onClick={() => onChange(!checked)}
		className={`${ACTION} ${FOCUS} flex w-full cursor-pointer items-center justify-between gap-3 rounded-xl border-2 px-4 py-2 text-left ${
			checked ? SELECTED : UNSELECTED
		}`}
	>
		<span className="flex flex-col">
			<span>{label}</span>
			{hint ? (
				<span className="text-xs font-normal text-gray-500 dark:text-gray-400">
					{hint}
				</span>
			) : null}
		</span>
		<span
			aria-hidden
			className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${
				checked ? "bg-blue-600" : "bg-gray-300 dark:bg-gray-600"
			}`}
		>
			<span
				className={`absolute top-0.5 h-6 w-6 rounded-full bg-white transition-all ${
					checked ? "left-[1.375rem]" : "left-0.5"
				}`}
			/>
		</span>
	</button>
);

// --- Sheet -------------------------------------------------------------------

/**
 * A full-screen overlay. Full-screen rather than a floating dialog because the
 * things that open one — the font list, every setting at once — are long, and a
 * centred box with its own scrollbar is miserable to use on a touchscreen.
 */
export const Sheet = ({
	title,
	onClose,
	children,
	footer,
}: {
	title: string;
	onClose: () => void;
	children: ReactNode;
	footer?: ReactNode;
}) => {
	useEffect(() => {
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose();
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [onClose]);

	return (
		<div
			role="dialog"
			aria-modal="true"
			aria-label={title}
			className="fixed inset-0 z-50 flex flex-col bg-white text-gray-900 dark:bg-gray-950 dark:text-gray-100"
		>
			<header className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-200 px-4 py-2 dark:border-gray-800">
				<h2 className="m-0 truncate text-lg font-semibold">{title}</h2>
				<TouchButton onClick={onClose} variant="quiet">
					Close
				</TouchButton>
			</header>
			<div className="min-h-0 grow overflow-y-auto p-4">{children}</div>
			{footer ? (
				<footer className="shrink-0 border-t border-gray-200 p-3 dark:border-gray-800">
					{footer}
				</footer>
			) : null}
		</div>
	);
};

// --- Stepper -----------------------------------------------------------------

/** Decimal places implied by a step, so repeated adds do not drift into 0.30000000004. */
const decimalsFor = (step: number): number => {
	const text = String(step);
	const dot = text.indexOf(".");
	return dot === -1 ? 0 : Math.min(text.length - dot - 1, 6);
};

const HOLD_DELAY_MS = 350;
const HOLD_INTERVAL_MS = 80;

/**
 * The workhorse numeric control: big minus and plus buttons around a value that
 * is still tappable to type into.
 *
 * Holding a button repeats, because reaching 1200mm/min at 10 per tap is not a
 * reasonable thing to ask of anyone. The displayed value is a draft string that
 * only commits on blur or Enter — typing "1" on the way to "12" must not be
 * read as a real value and reformatted underneath the user.
 */
export const Stepper = ({
	label,
	value,
	onChange,
	step,
	min,
	max,
	suffix,
	hint,
	disabled,
}: {
	label: string;
	value: number;
	onChange: (value: number) => void;
	step: number;
	min?: number;
	max?: number;
	suffix?: string;
	hint?: ReactNode;
	disabled?: boolean;
}) => {
	const committed = Number.isFinite(value) ? value : 0;
	const [draft, setDraft] = useState(String(committed));
	const [editing, setEditing] = useState(false);

	// Only overwrite the field while it is not being typed into; otherwise a
	// parent re-render mid-edit would yank the caret back.
	useEffect(() => {
		if (!editing) setDraft(String(committed));
	}, [committed, editing]);

	const clamp = useCallback(
		(next: number) => {
			const decimals = decimalsFor(step);
			const rounded = Number(next.toFixed(decimals));
			if (min !== undefined && rounded < min) return min;
			if (max !== undefined && rounded > max) return max;
			return rounded;
		},
		[step, min, max],
	);

	// `value` is stale inside a repeat timer, so the running total lives in a ref.
	const latest = useRef(committed);
	latest.current = committed;

	const timers = useRef<{ timeout?: number; interval?: number }>({});
	const stopHold = useCallback(() => {
		window.clearTimeout(timers.current.timeout);
		window.clearInterval(timers.current.interval);
		timers.current = {};
	}, []);
	useEffect(() => stopHold, [stopHold]);

	const bump = useCallback(
		(direction: 1 | -1) => {
			const next = clamp(latest.current + direction * step);
			latest.current = next;
			onChange(next);
		},
		[clamp, step, onChange],
	);

	const startHold = (direction: 1 | -1) => {
		if (disabled) return;
		bump(direction);
		timers.current.timeout = window.setTimeout(() => {
			timers.current.interval = window.setInterval(
				() => bump(direction),
				HOLD_INTERVAL_MS,
			);
		}, HOLD_DELAY_MS);
	};

	const commit = () => {
		setEditing(false);
		const parsed = Number.parseFloat(draft);
		if (Number.isFinite(parsed)) {
			const next = clamp(parsed);
			latest.current = next;
			onChange(next);
			setDraft(String(next));
		} else {
			setDraft(String(committed));
		}
	};

	const holdHandlers = (direction: 1 | -1) => ({
		onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
			e.preventDefault();
			startHold(direction);
		},
		onPointerUp: stopHold,
		onPointerLeave: stopHold,
		onPointerCancel: stopHold,
	});

	const arrowClass = `${FOCUS} h-14 w-14 shrink-0 cursor-pointer rounded-xl border-2 border-gray-300 text-2xl leading-none select-none hover:border-blue-400 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-700`;

	return (
		<div className="flex flex-col gap-1">
			<FieldLabel>
				{label}
				{suffix ? (
					<span className="font-normal text-gray-400"> ({suffix})</span>
				) : null}
			</FieldLabel>
			<div className="flex items-stretch gap-2">
				<button
					type="button"
					aria-label={`Decrease ${label}`}
					disabled={disabled || (min !== undefined && committed <= min)}
					{...holdHandlers(-1)}
					className={arrowClass}
				>
					−
				</button>
				<input
					type="text"
					inputMode="decimal"
					value={draft}
					disabled={disabled}
					aria-label={label}
					onFocus={(e) => {
						setEditing(true);
						e.currentTarget.select();
					}}
					onChange={(e) => setDraft(e.target.value)}
					onBlur={commit}
					onKeyDown={(e) => {
						if (e.key === "Enter") e.currentTarget.blur();
					}}
					className={`${FOCUS} h-14 w-full rounded-xl border-2 border-gray-300 bg-white text-center text-lg tabular-nums disabled:opacity-40 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100`}
				/>
				<button
					type="button"
					aria-label={`Increase ${label}`}
					disabled={disabled || (max !== undefined && committed >= max)}
					{...holdHandlers(1)}
					className={arrowClass}
				>
					+
				</button>
			</div>
			{hint ? <Hint>{hint}</Hint> : null}
		</div>
	);
};
