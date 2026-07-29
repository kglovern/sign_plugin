import type { ReactNode } from "react";

const inputClass =
	"w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm " +
	"dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100";

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
		<legend className="flex items-center gap-2 px-1 text-sm font-semibold">
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
}) => (
	<label className="mb-2 flex flex-col gap-1 text-xs" title={title}>
		<span className="text-gray-600 dark:text-gray-400">
			{label}
			{suffix ? <span className="text-gray-400"> ({suffix})</span> : null}
		</span>
		<input
			type="number"
			value={Number.isFinite(value) ? value : 0}
			step={step}
			min={min}
			max={max}
			disabled={disabled}
			onChange={(e) => {
				const next = e.target.valueAsNumber;
				if (Number.isFinite(next)) onChange(next);
			}}
			className={`${inputClass} disabled:opacity-50`}
		/>
	</label>
);

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
	<label className="mb-2 flex flex-col gap-1 text-xs" title={title}>
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
	<label className="mb-2 flex items-center gap-2 text-xs" title={title}>
		<input
			type="checkbox"
			checked={checked}
			onChange={(e) => onChange(e.target.checked)}
			className="h-4 w-4"
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
	<label className="mb-2 flex flex-col gap-1 text-xs">
		<span className="text-gray-600 dark:text-gray-400">{label}</span>
		<textarea
			value={value}
			rows={rows}
			onChange={(e) => onChange(e.target.value)}
			className={`${inputClass} resize-y font-mono`}
		/>
	</label>
);
