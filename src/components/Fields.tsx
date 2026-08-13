import { type ReactNode, useEffect, useState } from "react";

/**
 * Shared by every control in this file and by `FontPicker`. Sized for a finger:
 * 48px tall, and 16px text — anything smaller and a mobile browser zooms the
 * page when the field takes focus.
 */
export const inputClass =
	"w-full min-h-12 rounded-md border border-gray-300 bg-white px-3 py-2 text-base " +
	"dark:border-gray-700 dark:bg-slate-700 dark:text-gray-100";

export const Section = ({
	title,
	children,
	right,
}: {
	title: string;
	children: ReactNode;
	right?: ReactNode;
}) => (
	<fieldset className="mb-4 rounded-lg border border-gray-300 p-3 dark:border-gray-700">
		<legend className="flex items-center gap-2 px-1 text-base font-semibold">
			{title}
			{right}
		</legend>
		{children}
	</fieldset>
);

export const Row = ({ children }: { children: ReactNode }) => (
	<div className="grid grid-cols-2 gap-2">{children}</div>
);

export const NumberField = ({
	label,
	value,
	onChange,
	step = 0.1,
	min,
	max,
	suffix,
	title,
	disabled,
}: {
	label: string;
	value: number;
	onChange: (value: number) => void;
	step?: number;
	min?: number;
	max?: number;
	suffix?: string;
	title?: string;
	disabled?: boolean;
}) => {
	const committed = Number.isFinite(value) ? value : 0;
	const [draft, setDraft] = useState(String(committed));

	// Keep the draft in sync when the value changes for reasons other than
	// this field's own edits (unit conversion, another control, undo, etc.).
	useEffect(() => {
		setDraft(String(committed));
	}, [committed]);

	const commit = () => {
		const next = Number.parseFloat(draft);
		if (Number.isFinite(next)) {
			onChange(next);
		} else {
			setDraft(String(committed));
		}
	};

	return (
		<label className="mb-3 flex flex-col gap-1 text-sm" title={title}>
			<span className="text-gray-600 dark:text-gray-400">
				{label}
				{suffix ? <span className="text-gray-400"> ({suffix})</span> : null}
			</span>
			<input
				type="number"
				value={draft}
				step={step}
				min={min}
				max={max}
				disabled={disabled}
				onChange={(e) => setDraft(e.target.value)}
				onBlur={commit}
				onKeyDown={(e) => {
					if (e.key === "Enter") e.currentTarget.blur();
				}}
				className={`${inputClass} disabled:opacity-50`}
			/>
		</label>
	);
};

export const SelectField = <T extends string>({
	label,
	value,
	options,
	onChange,
	title,
}: {
	label: string;
	value: T;
	options: { value: T; label: string }[];
	onChange: (value: T) => void;
	title?: string;
}) => (
	<label className="mb-3 flex flex-col gap-1 text-sm" title={title}>
		<span className="text-gray-600 dark:text-gray-400">{label}</span>
		<select
			value={value}
			onChange={(e) => onChange(e.target.value as T)}
			className={inputClass}
		>
			{options.map((o) => (
				<option key={o.value} value={o.value}>
					{o.label}
				</option>
			))}
		</select>
	</label>
);

export const CheckField = ({
	label,
	checked,
	onChange,
	title,
}: {
	label: string;
	checked: boolean;
	onChange: (checked: boolean) => void;
	title?: string;
}) => (
	<label className="mb-3 flex min-h-12 items-center gap-3 text-sm" title={title}>
		<input
			type="checkbox"
			checked={checked}
			onChange={(e) => onChange(e.target.checked)}
			className="h-6 w-6"
		/>
		<span className="text-gray-600 dark:text-gray-400">{label}</span>
	</label>
);

export const TextAreaField = ({
	label,
	value,
	onChange,
	rows = 3,
}: {
	label: string;
	value: string;
	onChange: (value: string) => void;
	rows?: number;
}) => (
	<label className="mb-3 flex flex-col gap-1 text-sm">
		<span className="text-gray-600 dark:text-gray-400">{label}</span>
		<textarea
			value={value}
			rows={rows}
			onChange={(e) => onChange(e.target.value)}
			className={`${inputClass} resize-y font-mono`}
		/>
	</label>
);
