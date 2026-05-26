"use client";

import Link from "next/link";
import { KIND_COLOUR, londonDayKey, pad, timeFmt } from "./_helpers";

const dayLabelFmt = new Intl.DateTimeFormat("en-GB", {
	weekday: "short", day: "numeric", month: "short", timeZone: "Europe/London",
});

const HOUR_START = 7;   // 07:00
const HOUR_END = 23;    // 23:00 (exclusive)
const HOURS = Array.from({ length: HOUR_END - HOUR_START }, (_, i) => HOUR_START + i);
const ROW_HEIGHT_PX = 44; // 1 hour = 44px

function startOfWeekMonday(d) {
	const out = new Date(d);
	const dow = (out.getUTCDay() + 6) % 7;
	out.setUTCDate(out.getUTCDate() - dow);
	out.setUTCHours(0, 0, 0, 0);
	return out;
}

function londonComponents(date) {
	const parts = new Intl.DateTimeFormat("en-GB", {
		timeZone: "Europe/London", hour12: false,
		year: "numeric", month: "2-digit", day: "2-digit",
		hour: "2-digit", minute: "2-digit",
	}).formatToParts(date);
	const lookup = Object.fromEntries(parts.map((p) => [p.type, p.value]));
	return {
		y: Number(lookup.year),
		mo: Number(lookup.month),
		d: Number(lookup.day),
		h: Number(lookup.hour),
		mi: Number(lookup.minute),
		ymd: `${lookup.year}-${lookup.month}-${lookup.day}`,
	};
}

export default function WeekGrid({ anchor, items, todayYmd }) {
	const weekStart = startOfWeekMonday(anchor);
	const days = Array.from({ length: 7 }, (_, i) => {
		const d = new Date(weekStart);
		d.setUTCDate(d.getUTCDate() + i);
		return d;
	});

	// Index items by day, with London-time hour offset for positioning.
	const byDay = new Map();
	for (let i = 0; i < 7; i++) byDay.set(londonDayKey(days[i]), []);
	for (const it of items) {
		const start = new Date(it.starts_at);
		const end = new Date(it.ends_at);
		const sParts = londonComponents(start);
		const eParts = londonComponents(end);
		const dayKey = sParts.ymd;
		if (!byDay.has(dayKey)) continue;
		const startHour = sParts.h + sParts.mi / 60;
		const sameDay = sParts.ymd === eParts.ymd;
		const endHour = sameDay ? eParts.h + eParts.mi / 60 : HOUR_END;
		byDay.get(dayKey).push({ it, startHour, endHour });
	}

	const totalHeight = (HOUR_END - HOUR_START) * ROW_HEIGHT_PX;

	return (
		<div>
			<div className="grid grid-cols-[60px_repeat(7,minmax(0,1fr))] border-b text-[10px] uppercase tracking-[0.22em] text-muted-foreground bg-muted/30">
				<div />
				{days.map((d) => {
					const ymd = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
					const isToday = ymd === todayYmd;
					return (
						<div
							key={ymd}
							className={`px-2 py-2 text-center ${isToday ? "text-primary" : ""}`}
						>
							{dayLabelFmt.format(d)}
						</div>
					);
				})}
			</div>
			<div className="grid grid-cols-[60px_repeat(7,minmax(0,1fr))]">
				<div className="border-r" style={{ height: totalHeight }}>
					{HOURS.map((h) => (
						<div
							key={h}
							className="border-b text-[10px] text-muted-foreground px-1.5 pt-0.5"
							style={{ height: ROW_HEIGHT_PX }}
						>
							{String(h).padStart(2, "0")}:00
						</div>
					))}
				</div>
				{days.map((d) => {
					const dayKey = londonDayKey(d);
					const dayItems = byDay.get(dayKey) ?? [];
					return (
						<div
							key={dayKey}
							className="border-r last:border-r-0 relative"
							style={{ height: totalHeight }}
						>
							{HOURS.map((h) => (
								<div
									key={h}
									className="border-b"
									style={{ height: ROW_HEIGHT_PX }}
								/>
							))}
							{dayItems.map(({ it, startHour, endHour }) => {
								const top = Math.max(0, (startHour - HOUR_START) * ROW_HEIGHT_PX);
								const height = Math.max(
									18,
									(Math.min(endHour, HOUR_END) - Math.max(startHour, HOUR_START)) * ROW_HEIGHT_PX,
								);
								const chipClass = `absolute inset-x-1 rounded border px-1.5 py-0.5 text-[10px] overflow-hidden leading-tight space-y-0.5 ${KIND_COLOUR[it.kind] || KIND_COLOUR.closure}${
								it.tentative ? " border-dashed opacity-70" : ""
							}`;
								const roomNames = (it.rooms ?? []).map((r) => r.room_name);
								const titleAttr = `${it.title}${roomNames.length ? " · " + roomNames.join(", ") : ""}`;
								const inner = (
									<>
										<div className="font-medium truncate">{it.title}</div>
										<div className="opacity-80 truncate">
											{timeFmt.format(new Date(it.starts_at))}
										</div>
										{roomNames.length > 0 && (
											<ul className="opacity-80 leading-tight list-none">
												{roomNames.map((name) => (
													<li key={name} className="truncate">{name}</li>
												))}
											</ul>
										)}
									</>
								);
								if (it.kind === "event" && it.href) {
									return (
										<Link
											key={it.id}
											href={it.href}
											className={chipClass}
											style={{ top, height }}
											title={titleAttr}
										>
											{inner}
										</Link>
									);
								}
								return (
									<div
										key={it.id}
										className={chipClass}
										style={{ top, height }}
										title={titleAttr}
									>
										{inner}
									</div>
								);
							})}
						</div>
					);
				})}
			</div>
		</div>
	);
}
