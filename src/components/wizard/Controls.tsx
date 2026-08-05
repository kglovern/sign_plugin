/**
 * The bridge between the generic touch primitives and the project model.
 *
 * The model is millimetres throughout; gSender decides whether the user sees
 * millimetres or inches. Everything that converts between the two lives here,
 * so no step component has to remember to do it.
 */

import type { ReactNode } from "react";

import { type Units, unitsScale } from "../../lib/project";
import { Stepper } from "../touch/Touch";

/**
 * Increments that feel like "one nudge" in each unit system. Same values the
 * original options panel used, so a metric user's steps do not change.
 */
export const unitSteps = (units: Units) => {
	const imperial = units === "in";
	return {
		imperial,
		scale: unitsScale(units),
		/** Ordinary dimensions. */
		length: imperial ? 0.01 : 0.5,
		/** Tool diameters and other places a coarse step would be useless. */
		fine: imperial ? 0.001 : 0.1,
		/** Feeds, which live in whole numbers per minute. */
		feed: imperial ? 1 : 10,
	};
};

/** Trims the float noise a millimetre-to-inch round trip introduces. */
export const clean = (value: number): number => Number(value.toFixed(4));

/** A millimetre value written the way the user has asked to read it. */
export const formatLength = (mm: number, units: Units, decimals?: number): string => {
	const scale = unitsScale(units);
	const places = decimals ?? (units === "in" ? 3 : 1);
	return `${(mm / scale).toFixed(places)} ${units}`;
};

/**
 * A `Stepper` over a millimetre-valued field. Named after the `Length` helper it
 * replaces from the old options panel, and defined at module scope for the same
 * reason: a component identity that changes every render would remount the
 * input and drop focus mid-edit.
 */
export const LengthStepper = ({
	label,
	value,
	onChange,
	units,
	step,
	min,
	max,
	hint,
	suffix,
	disabled,
}: {
	label: string;
	/** Millimetres. */
	value: number;
	/** Called with millimetres. */
	onChange: (mm: number) => void;
	units: Units;
	step?: number;
	min?: number;
	max?: number;
	hint?: ReactNode;
	/** Defaults to the unit name; override for rates, which are per minute. */
	suffix?: string;
	disabled?: boolean;
}) => {
	const steps = unitSteps(units);
	return (
		<Stepper
			label={label}
			suffix={suffix ?? units}
			value={clean(value / steps.scale)}
			step={step ?? steps.length}
			min={min === undefined ? undefined : min / steps.scale}
			max={max === undefined ? undefined : max / steps.scale}
			hint={hint}
			disabled={disabled}
			onChange={(displayed) => onChange(displayed * steps.scale)}
		/>
	);
};
