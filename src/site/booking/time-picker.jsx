"use client";

import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/shadcn/components/ui/select";

const HOURS = Array.from({ length: 17 }, (_, i) => String(i + 7).padStart(2, "0"));
const MINUTES = ["00", "15", "30", "45"];

function splitTime(value) {
	if (!value || typeof value !== "string") return ["", ""];
	const [h, m] = value.split(":");
	return [h ?? "", m ?? ""];
}

export function TimePicker({ value, onChange, disabled, placeholder = "HH:MM" }) {
	const [hour, minute] = splitTime(value);

	function setHour(h) {
		onChange(`${h}:${minute || "00"}`);
	}
	function setMinute(m) {
		onChange(`${hour || "00"}:${m}`);
	}

	return (
		<div className="grid grid-cols-2 gap-1.5">
			<Select value={hour} onValueChange={setHour} disabled={disabled}>
				<SelectTrigger>
					<SelectValue placeholder="HH" />
				</SelectTrigger>
				<SelectContent className="max-h-[260px]">
					{HOURS.map((h) => (
						<SelectItem key={h} value={h}>
							{h}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
			<Select value={minute} onValueChange={setMinute} disabled={disabled}>
				<SelectTrigger>
					<SelectValue placeholder="MM" />
				</SelectTrigger>
				<SelectContent>
					{MINUTES.map((m) => (
						<SelectItem key={m} value={m}>
							{m}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
	);
}
