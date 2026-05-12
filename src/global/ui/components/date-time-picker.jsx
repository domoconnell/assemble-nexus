"use client";

import { DatePicker } from "@/site/booking/date-picker";
import { TimePicker } from "@/site/booking/time-picker";

/**
 * Shadcn-themed date + time picker. Accepts and emits a `YYYY-MM-DDTHH:mm`
 * string (matches the shape that `<Input type="datetime-local">` emits, so
 * server actions that already parse via `new Date(value)` keep working).
 *
 * Time is locked to 15-minute increments by the underlying TimePicker.
 */
/**
 * Parses the stored value. We support three shapes so the surrounding state
 * can represent "date picked but time not chosen yet":
 *   - ""                          → empty
 *   - "YYYY-MM-DD"                → date only
 *   - "YYYY-MM-DDTHH:mm"          → full
 */
export function splitDateTime(v) {
	if (!v || typeof v !== "string") return { date: "", time: "" };
	const [d, t = ""] = v.split("T");
	return { date: d ?? "", time: t.slice(0, 5) };
}

export function combineDateTime(date, time) {
	if (!date) return "";
	return time ? `${date}T${time}` : date;
}

export function DateTimePicker({
	value,
	onChange,
	onDateChange,
	onTimeChange,
	disabled,
	datePlaceholder = "Pick a date",
	allowPast = true,
}) {
	const { date, time } = splitDateTime(value);

	function setDate(nextDate) {
		if (!nextDate) {
			onChange?.("");
			onDateChange?.("");
			return;
		}
		onChange?.(combineDateTime(nextDate, time));
		onDateChange?.(nextDate);
	}

	function setTime(nextTime) {
		if (!date) return; // need a date first for the combined value to mean anything
		onChange?.(combineDateTime(date, nextTime));
		onTimeChange?.(nextTime);
	}

	return (
		<div className="grid gap-2 sm:grid-cols-[1.6fr_1fr]">
			<DatePicker
				value={date}
				onChange={setDate}
				placeholder={datePlaceholder}
				disabled={disabled}
				allowPast={allowPast}
			/>
			<TimePicker value={time} onChange={setTime} disabled={disabled || !date} />
		</div>
	);
}
