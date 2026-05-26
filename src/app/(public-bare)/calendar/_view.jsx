"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/shadcn/components/ui/button";
import MonthGrid from "./_month-grid";
import WeekGrid from "./_week-grid";
import YearHeatmap from "./_year-heatmap";
import SubscribeButton from "./_subscribe-button";

const monthFmt = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" });
const weekRangeFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });
const yearFmt = new Intl.DateTimeFormat("en-GB", { year: "numeric" });

function pad(n) {
	return String(n).padStart(2, "0");
}

function parseYmd(s) {
	const [y, m, d] = s.split("-").map(Number);
	return new Date(Date.UTC(y, m - 1, d));
}

function formatYmd(d) {
	return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function addDays(d, n) {
	const out = new Date(d);
	out.setUTCDate(out.getUTCDate() + n);
	return out;
}

function shiftMonth(d, delta) {
	return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + delta, 1));
}

function shiftYear(d, delta) {
	return new Date(Date.UTC(d.getUTCFullYear() + delta, d.getUTCMonth(), d.getUTCDate()));
}

function todayYmdLondon() {
	return new Intl.DateTimeFormat("en-CA", {
		timeZone: "Europe/London",
		year: "numeric", month: "2-digit", day: "2-digit",
	}).format(new Date());
}

export default function CalendarView({
	venueName,
	view,
	anchorYmd,
	rooms,
	selectedRoomIds,
	items,
	subscribeUrl,
	httpsSubscribeUrl,
}) {
	const router = useRouter();
	const searchParams = useSearchParams();
	const anchor = useMemo(() => parseYmd(anchorYmd), [anchorYmd]);
	const todayYmd = todayYmdLondon();

	// Local copy of selected rooms so the chips feel snappy; we sync to the
	// URL on every change so it stays bookmarkable.
	const [selected, setSelected] = useState(
		selectedRoomIds && selectedRoomIds.length > 0 ? new Set(selectedRoomIds) : null,
	);

	function setUrl({ view: v, d, r } = {}) {
		const params = new URLSearchParams(searchParams.toString());
		if (v !== undefined) {
			if (v) params.set("view", v);
			else params.delete("view");
		}
		if (d !== undefined) {
			if (d) params.set("d", d);
			else params.delete("d");
		}
		if (r !== undefined) {
			if (r) params.set("r", r);
			else params.delete("r");
		}
		router.push(`/calendar?${params.toString()}`);
	}

	function navPrev() {
		if (view === "week") setUrl({ d: formatYmd(addDays(anchor, -7)) });
		else if (view === "year") setUrl({ d: formatYmd(shiftYear(anchor, -1)) });
		else setUrl({ d: formatYmd(shiftMonth(anchor, -1)) });
	}

	function navNext() {
		if (view === "week") setUrl({ d: formatYmd(addDays(anchor, 7)) });
		else if (view === "year") setUrl({ d: formatYmd(shiftYear(anchor, 1)) });
		else setUrl({ d: formatYmd(shiftMonth(anchor, 1)) });
	}

	function navToday() {
		setUrl({ d: todayYmd });
	}

	function switchView(v) {
		setUrl({ view: v });
	}

	function toggleRoom(id) {
		const allSelected = !selected;
		const current = allSelected ? new Set(rooms.map((r) => r.id)) : new Set(selected);
		if (current.has(id)) current.delete(id);
		else current.add(id);
		// If they re-select everything, drop the filter (cleaner URL).
		if (current.size === rooms.length) {
			setSelected(null);
			setUrl({ r: "" });
			return;
		}
		setSelected(current);
		setUrl({ r: [...current].join(",") });
	}

	function selectAllRooms() {
		setSelected(null);
		setUrl({ r: "" });
	}

	const isRoomActive = (id) => (!selected ? true : selected.has(id));

	let titleLabel;
	if (view === "week") {
		const weekEnd = addDays(anchor, 6);
		titleLabel = `${weekRangeFmt.format(anchor)} – ${weekRangeFmt.format(weekEnd)} ${anchor.getUTCFullYear()}`;
	} else if (view === "year") {
		titleLabel = yearFmt.format(anchor);
	} else {
		titleLabel = monthFmt.format(anchor);
	}

	return (
		<div className="min-h-screen bg-background flex flex-col">
			<header className="border-b bg-card">
				<div className="mx-auto max-w-7xl px-4 sm:px-6 py-4 flex items-center justify-between gap-4 flex-wrap">
					<div>
						<div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
							{venueName} · Room calendar
						</div>
						<h1 className="text-xl sm:text-2xl font-semibold mt-0.5">
							When the rooms are in use
						</h1>
					</div>
					<SubscribeButton
						webcalUrl={subscribeUrl}
						httpsUrl={httpsSubscribeUrl}
					/>
				</div>
			</header>

			<div className="mx-auto max-w-7xl w-full px-4 sm:px-6 py-4 space-y-4">
				<div className="flex items-center justify-between gap-3 flex-wrap">
					<div className="flex items-center gap-2">
						<Button variant="outline" size="sm" onClick={navPrev} aria-label="Previous">
							←
						</Button>
						<Button variant="outline" size="sm" onClick={navToday}>
							Today
						</Button>
						<Button variant="outline" size="sm" onClick={navNext} aria-label="Next">
							→
						</Button>
						<div className="ml-2 text-sm font-medium">{titleLabel}</div>
					</div>
					<div className="inline-flex rounded-md border bg-card overflow-hidden">
						{["month", "week", "year"].map((v) => (
							<button
								key={v}
								type="button"
								onClick={() => switchView(v)}
								className={`px-3 py-1.5 text-xs uppercase tracking-[0.18em] ${
									view === v
										? "bg-primary text-primary-foreground"
										: "hover:bg-accent text-muted-foreground"
								}`}
							>
								{v}
							</button>
						))}
					</div>
				</div>

				<div className="flex items-center gap-2 flex-wrap">
					<span className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
						Rooms
					</span>
					<button
						type="button"
						onClick={selectAllRooms}
						className={`text-xs rounded-full border px-2.5 py-1 ${
							!selected
								? "border-primary/40 bg-primary/10 text-primary"
								: "border-foreground/15 text-muted-foreground hover:text-foreground"
						}`}
					>
						All
					</button>
					{rooms.map((r) => {
						const active = isRoomActive(r.id);
						return (
							<button
								key={r.id}
								type="button"
								onClick={() => toggleRoom(r.id)}
								className={`text-xs rounded-full border px-2.5 py-1 ${
									active
										? "border-primary/40 bg-primary/10 text-primary"
										: "border-foreground/15 text-muted-foreground hover:text-foreground"
								}`}
								aria-pressed={active}
							>
								{r.name}
							</button>
						);
					})}
				</div>

				<KindLegend />

				<div className="rounded-lg border bg-card overflow-hidden">
					{view === "month" && (
						<MonthGrid anchor={anchor} items={items} todayYmd={todayYmd} />
					)}
					{view === "week" && (
						<WeekGrid anchor={anchor} items={items} todayYmd={todayYmd} />
					)}
					{view === "year" && (
						<YearHeatmap anchor={anchor} items={items} todayYmd={todayYmd} onDayClick={(ymd) => setUrl({ view: "week", d: ymd })} />
					)}
				</div>
			</div>
		</div>
	);
}

function KindLegend() {
	const dot = "inline-block w-2.5 h-2.5 rounded-full";
	return (
		<div className="flex items-center gap-4 flex-wrap text-[11px] text-muted-foreground">
			<span className="inline-flex items-center gap-1.5">
				<span className={`${dot} bg-sky-500`} /> External booking
			</span>
			<span className="inline-flex items-center gap-1.5">
				<span className={`${dot} bg-primary`} /> Church booking
			</span>
			<span className="inline-flex items-center gap-1.5">
				<span className={`${dot} bg-amber-500`} /> Published event
			</span>
			<span className="inline-flex items-center gap-1.5">
				<span className={`${dot} bg-muted-foreground/40`} /> Closure
			</span>
			<span className="inline-flex items-center gap-1.5">
				<span className="inline-block w-3 h-2.5 rounded border border-dashed border-foreground/60 opacity-70" /> Pending (not yet confirmed)
			</span>
		</div>
	);
}
