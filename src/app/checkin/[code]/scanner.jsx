"use client";

import { useCallback, useRef, useState } from "react";
import { Scanner } from "@yudiel/react-qr-scanner";
import { Button } from "@/shadcn/components/ui/button";
import { Input } from "@/shadcn/components/ui/input";

const RESULT_DISPLAY_MS = 2500;
const SCAN_COOLDOWN_MS = 1500;

function statusStyles(status) {
	switch (status) {
		case "ok":
			return "bg-emerald-600 text-white";
		case "already_used":
			return "bg-amber-500 text-white";
		case "wrong_event":
		case "refunded":
		case "unpaid":
		case "invalid":
			return "bg-rose-600 text-white";
		default:
			return "bg-muted text-foreground";
	}
}

function statusLabel(status) {
	switch (status) {
		case "ok":
			return "Checked in";
		case "already_used":
			return "Already used";
		case "wrong_event":
			return "Wrong event";
		case "refunded":
			return "Refunded";
		case "unpaid":
			return "Unpaid";
		case "invalid":
		default:
			return "Not recognised";
	}
}

const timeFmt = new Intl.DateTimeFormat("en-GB", {
	hour: "2-digit",
	minute: "2-digit",
	timeZone: "Europe/London",
});

export default function CheckinScanner({
	checkinCode,
	eventTitle,
	startsLabel,
	initialUsed,
	initialTotal,
}) {
	const [used, setUsed] = useState(initialUsed);
	const [total] = useState(initialTotal);
	const [result, setResult] = useState(null);
	const [manualCode, setManualCode] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [paused, setPaused] = useState(false);
	const lastScanRef = useRef({ code: "", at: 0 });

	const submit = useCallback(
		async (ticketCode) => {
			if (!ticketCode) return;
			setSubmitting(true);
			try {
				const response = await fetch("/api/tickets/redeem", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						checkin_code: checkinCode,
						ticket_code: ticketCode,
					}),
				});
				const data = await response.json();
				const status = data.status ?? (response.ok ? "ok" : "invalid");
				setResult({
					status,
					ticket: data.ticket ?? null,
					error: data.error ?? null,
					at: Date.now(),
				});
				if (status === "ok") setUsed((u) => u + 1);
				try {
					if (typeof window !== "undefined" && window.navigator?.vibrate) {
						window.navigator.vibrate(status === "ok" ? 80 : [50, 80, 50]);
					}
				} catch {}
			} catch {
				setResult({ status: "invalid", error: "Network error", at: Date.now() });
			} finally {
				setSubmitting(false);
				setPaused(true);
				setTimeout(() => setPaused(false), SCAN_COOLDOWN_MS);
				setTimeout(() => {
					setResult((r) => (r && Date.now() - r.at >= RESULT_DISPLAY_MS ? null : r));
				}, RESULT_DISPLAY_MS + 50);
			}
		},
		[checkinCode],
	);

	const handleScan = useCallback(
		(detected) => {
			if (paused || submitting) return;
			const value = Array.isArray(detected)
				? detected[0]?.rawValue ?? detected[0]?.value
				: detected?.rawValue ?? detected?.value;
			if (!value) return;
			const now = Date.now();
			if (lastScanRef.current.code === value && now - lastScanRef.current.at < 4000) return;
			lastScanRef.current = { code: value, at: now };
			submit(value);
		},
		[paused, submitting, submit],
	);

	const handleManualSubmit = useCallback(
		(e) => {
			e.preventDefault();
			if (!manualCode.trim()) return;
			submit(manualCode.trim());
			setManualCode("");
		},
		[manualCode, submit],
	);

	return (
		<div className="mx-auto flex min-h-svh max-w-md flex-col gap-4 p-4">
			<header className="space-y-1 pt-2">
				<h1 className="font-display text-2xl tracking-tight">{eventTitle}</h1>
				{startsLabel && (
					<p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
						{startsLabel}
					</p>
				)}
				<div className="flex items-baseline justify-between pt-2">
					<span className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
						Checked in
					</span>
					<span className="font-mono text-2xl tabular-nums">
						{used}
						<span className="text-muted-foreground">/{total}</span>
					</span>
				</div>
			</header>

			<div className="relative aspect-square overflow-hidden rounded-xl border border-foreground/15 bg-black">
				<Scanner
					onScan={handleScan}
					onError={() => {}}
					constraints={{ facingMode: "environment" }}
					paused={paused}
					styles={{
						container: { width: "100%", height: "100%" },
						video: { width: "100%", height: "100%", objectFit: "cover" },
					}}
					components={{ finder: false, audio: false, torch: true }}
				/>
				{result && (
					<div
						className={`absolute inset-x-0 bottom-0 px-5 py-4 ${statusStyles(result.status)}`}
					>
						<div className="flex items-baseline justify-between gap-3">
							<span className="text-xs uppercase tracking-[0.2em] opacity-90">
								{statusLabel(result.status)}
							</span>
							{result.ticket?.used_at && result.status !== "ok" && (
								<span className="text-xs opacity-80">
									{timeFmt.format(new Date(result.ticket.used_at))}
								</span>
							)}
						</div>
						<div className="mt-1 font-display text-xl tracking-tight">
							{result.ticket?.holder_name ||
								result.ticket?.ticket_type ||
								result.error ||
								"Unknown ticket"}
						</div>
						{result.ticket?.ticket_type && result.ticket?.holder_name && (
							<div className="text-sm opacity-90">{result.ticket.ticket_type}</div>
						)}
					</div>
				)}
			</div>

			<form className="flex gap-2" onSubmit={handleManualSubmit}>
				<Input
					type="text"
					value={manualCode}
					onChange={(e) => setManualCode(e.target.value)}
					placeholder="Or type a ticket code"
					autoComplete="off"
					autoCapitalize="off"
					spellCheck={false}
				/>
				<Button type="submit" disabled={!manualCode.trim() || submitting}>
					Check in
				</Button>
			</form>

			<p className="text-center text-xs text-muted-foreground">
				Anyone with this link can check tickets in. Rotate it from the event page if it leaks.
			</p>
		</div>
	);
}
