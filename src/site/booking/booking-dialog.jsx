"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogTitle } from "@/shadcn/components/ui/dialog";
import BookingWidget from "./booking-widget";

/**
 * "Book Now" entry point on room pages.
 *
 * Desktop (≥ md): opens an in-place modal hosting the full BookingWidget.
 * Mobile (< md): navigates to `/book?room=<slug>` instead. The page-based
 * flow handles its own scrolling, has the mobile-friendly bottom summary
 * bar, and lets the magic-link tab dance survive without trying to keep
 * a modal alive while the user switches apps.
 *
 * The viewport check happens at click time (not on render) so we don't
 * need to dance around SSR/hydration.
 */
export default function BookingDialog({
	room,
	bookingTypes,
	discounts = [],
	ticketingSettings = null,
	buttonLabel = "Book Now",
	buttonClassName = "w-full h-12 px-8 inline-flex items-center justify-center gap-2 rounded-md font-medium tracking-wide bg-primary text-primary-foreground hover:bg-primary/90 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
}) {
	const router = useRouter();
	const [open, setOpen] = useState(false);

	function handleClick() {
		const isMobile =
			typeof window !== "undefined" &&
			window.matchMedia("(max-width: 767px)").matches;
		if (isMobile && room?.slug) {
			router.push(`/book?room=${encodeURIComponent(room.slug)}`);
			return;
		}
		setOpen(true);
	}

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<button type="button" className={buttonClassName} onClick={handleClick}>
				{buttonLabel}
			</button>
			<DialogContent className="max-w-275 w-[calc(100%-2rem)] h-[calc(100svh-3rem)] sm:h-[calc(100svh-6rem)] max-h-215 p-0 gap-0 flex flex-col overflow-hidden">
				<div className="px-6 pt-6 sm:px-8 sm:pt-8 lg:px-10 lg:pt-10 pb-6 shrink-0">
					<DialogTitle asChild>
						<h2 className="font-display text-2xl sm:text-3xl tracking-tight pr-12">
							Book {room?.name ?? "this room"}
						</h2>
					</DialogTitle>
					<p className="mt-2 text-sm text-muted-foreground">
						Submit an enquiry. We&apos;ll respond within a working day. Nothing is charged until you accept the booking agreement.
					</p>
				</div>
				<div className="flex-1 min-h-0 px-6 pb-6 sm:px-8 sm:pb-8 lg:px-10 lg:pb-10">
					<BookingWidget
						rooms={[room]}
						bookingTypes={bookingTypes}
						discounts={discounts}
						ticketingSettings={ticketingSettings}
						lockedRoomId={room?.id}
						mode="popup"
					/>
				</div>
			</DialogContent>
		</Dialog>
	);
}
