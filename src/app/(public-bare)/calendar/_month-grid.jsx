"use client";

import Link from "next/link";
import { KIND_COLOUR, KIND_DOT, pad, groupItemsByDay, timeFmt } from "./_helpers";

const dayHeaderFmt = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function startOfWeekMonday(d) {
	const out = new Date(d);
	const dow = (out.getUTCDay() + 6) % 7;
	out.setUTCDate(out.getUTCDate() - dow);
	out.setUTCHours(0, 0, 0, 0);
	return out;
}

function buildGrid(anchor) {
	const monthStart = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), 1));
	const gridStart = startOfWeekMonday(monthStart);
	const days = [];
	for (let i = 0; i < 42; i++) {
		const d = new Date(gridStart);
		d.setUTCDate(d.getUTCDate() + i);
		days.push(d);
	}
	return { days, monthIndex: anchor.getUTCMonth() };
}

export default function MonthGrid({ anchor, items, todayYmd }) {
	const { days, monthIndex } = buildGrid(anchor);
	const byDay = groupItemsByDay(items);

	return (
		<div>
			<div className="grid grid-cols-7 border-b text-[10px] uppercase tracking-[0.22em] text-muted-foreground bg-muted/30">
				{dayHeaderFmt.map((d) => (
					<div key={d} className="px-2 py-2 text-center">{d}</div>
				))}
			</div>
			<div className="grid grid-cols-7 auto-rows-fr">
				{days.map((d, idx) => {
					const ymd = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
					const inMonth = d.getUTCMonth() === monthIndex;
					const isToday = ymd === todayYmd;
					const dayItems = byDay.get(ymd) ?? [];
					return (
						<div
							key={idx}
							className={`min-h-28 border-r border-b last:[&:nth-child(7n)]:border-r-0 p-1.5 space-y-1 ${
								inMonth ? "" : "bg-muted/30"
							}`}
						>
							<div className={`text-xs flex items-baseline gap-1.5 ${
								inMonth ? "" : "text-muted-foreground/60"
							}`}>
								<span className={`${
									isToday ? "inline-flex w-5 h-5 rounded-full bg-primary text-primary-foreground items-center justify-center font-medium" : ""
								}`}>
									{d.getUTCDate()}
								</span>
								{dayItems.length > 3 && (
									<span className="text-[10px] text-muted-foreground">
										{dayItems.length}
									</span>
								)}
							</div>
							<div className="space-y-0.5">
								{dayItems.slice(0, 4).map((it) => {
									const chipClass = `block text-[10px] rounded border px-1.5 py-0.5 truncate ${KIND_COLOUR[it.kind] || KIND_COLOUR.closure}${
										it.tentative ? " border-dashed opacity-70" : ""
									}`;
									const roomNames = (it.rooms ?? []).map((r) => r.room_name);
									const roomLabel =
										roomNames.length === 0
											? ""
											: roomNames.length === 1
												? roomNames[0]
												: `${roomNames.length} rooms`;
									// Lead with the room (or count) - the chip colour already
									// conveys the booking type, so the room is the more useful
									// "what's happening here" cue at month-zoom.
									const label = (
										<>
											<span className="font-medium">{roomLabel}</span>{" "}
											<span className="opacity-70">
												{timeFmt.format(new Date(it.starts_at))}
											</span>
										</>
									);
									const titleAttr = `${it.title}${roomNames.length ? " · " + roomNames.join(", ") : ""}`;
									if (it.kind === "event" && it.href) {
										return (
											<Link
												key={it.id}
												href={it.href}
												className={chipClass}
												title={titleAttr}
											>
												{label}
											</Link>
										);
									}
									return (
										<span
											key={it.id}
											className={chipClass}
											title={titleAttr}
										>
											{label}
										</span>
									);
								})}
								{dayItems.length > 4 && (
									<span className="block text-[10px] text-muted-foreground pl-1">
										+ {dayItems.length - 4} more
									</span>
								)}
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);
}
