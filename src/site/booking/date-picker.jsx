"use client";

import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/shadcn/components/ui/popover";
import { Calendar } from "@/shadcn/components/ui/calendar";
import { Button } from "@/shadcn/components/ui/button";

const dateLabel = new Intl.DateTimeFormat("en-GB", {
	weekday: "short",
	day: "numeric",
	month: "short",
	year: "numeric",
});

function parseYmd(s) {
	if (!s) return undefined;
	const d = new Date(`${s}T00:00:00`);
	if (Number.isNaN(d.valueOf())) return undefined;
	return d;
}

function formatYmd(d) {
	if (!d) return "";
	const yyyy = d.getFullYear();
	const mm = String(d.getMonth() + 1).padStart(2, "0");
	const dd = String(d.getDate()).padStart(2, "0");
	return `${yyyy}-${mm}-${dd}`;
}

export function DatePicker({ value, onChange, placeholder = "Pick a date", className = "", disabled, allowPast = false }) {
	const [open, setOpen] = useState(false);
	const selected = parseYmd(value);
	const display = selected ? dateLabel.format(selected) : "";

	const today = new Date();
	today.setHours(0, 0, 0, 0);
	const disableDay = allowPast ? undefined : (d) => d <= today;

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					type="button"
					variant="outline"
					disabled={disabled}
					className={`w-full justify-start text-left font-normal ${
						selected ? "" : "text-muted-foreground"
					} ${className}`}
				>
					{display || placeholder}
				</Button>
			</PopoverTrigger>
			<PopoverContent className="w-auto p-0" align="start">
				<Calendar
					mode="single"
					selected={selected}
					onSelect={(d) => {
						if (d) onChange(formatYmd(d));
						setOpen(false);
					}}
					weekStartsOn={1}
					disabled={disableDay}
				/>
			</PopoverContent>
		</Popover>
	);
}
