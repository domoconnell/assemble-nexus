"use client";

import Image from "next/image";
import { QRCodeSVG } from "qrcode.react";

/**
 * Themed QR card. QR modules themselves are painted with a linear gradient
 * from the theme primary into a lighter tint, on a transparent background.
 * Single SVG <linearGradient> defs node is referenced by id from the QR's
 * fill attribute — works because browsers resolve fill="url(#id)" against
 * any same-document SVG defs.
 */
export default function TicketQrCard({ name, code, status }) {
	const valid = status === "valid";
	return (
		<div
			className={`rounded-xl border p-6 space-y-4 ${
				valid
					? "border-primary/30 bg-card"
					: "border-destructive/30 bg-destructive/5 opacity-70"
			}`}
		>
			<div className="text-xs uppercase tracking-[0.22em] text-muted-foreground text-center">
				{name}
			</div>
			<div className="flex justify-center">
				<svg
					aria-hidden
					width="0"
					height="0"
					style={{ position: "absolute", width: 0, height: 0 }}
				>
					<defs>
						<linearGradient id="qr-gradient" x1="0" y1="0" x2="1" y2="1">
							<stop offset="0%" stopColor="var(--color-primary)" />
							<stop
								offset="100%"
								stopColor="color-mix(in oklch, var(--color-primary), white 55%)"
							/>
						</linearGradient>
					</defs>
				</svg>
				<div className="p-6">
					<QRCodeSVG
						value={code}
						size={220}
						level="M"
						marginSize={0}
						bgColor="transparent"
						fgColor="url(#qr-gradient)"
					/>
				</div>
			</div>
			<div className="text-center font-mono text-sm text-muted-foreground">{code}</div>
			{!valid && (
				<div className="text-center text-xs text-destructive uppercase tracking-[0.18em]">
					{status === "used" ? "Used" : status === "refunded" ? "Refunded" : "Void"}
				</div>
			)}
			{valid && (
				<div className="space-y-3 pt-2 border-t border-foreground/10">
					<a
						href={`/api/tickets/${code}/pdf`}
						className="block text-center text-sm px-4 py-2.5 rounded-md border border-foreground/15 hover:border-foreground/30 hover:bg-foreground/5 transition"
					>
						Download PDF
					</a>
					<div className="grid grid-cols-2 gap-2">
						<button
							type="button"
							disabled
							title="Coming soon — wallet passes are configured per venue."
							className="inline-flex items-center justify-center rounded-md overflow-hidden disabled:cursor-not-allowed disabled:opacity-60"
						>
							<Image
								src="/wallet/add-to-apple-wallet.svg"
								alt="Add to Apple Wallet"
								width={170}
								height={44}
								className="h-11 w-auto"
							/>
						</button>
						<button
							type="button"
							disabled
							title="Coming soon — wallet passes are configured per venue."
							className="inline-flex items-center justify-center rounded-md overflow-hidden disabled:cursor-not-allowed disabled:opacity-60"
						>
							<Image
								src="/wallet/add-to-google-wallet.svg"
								alt="Add to Google Wallet"
								width={170}
								height={44}
								className="h-11 w-auto"
							/>
						</button>
					</div>
				</div>
			)}
		</div>
	);
}
