"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/shadcn/components/ui/dialog";
import BookingWidget from "./booking-widget";

export default function BookingDialog({
	room,
	bookingTypes,
	discounts = [],
	ticketingSettings = null,
	buttonLabel = "Book Now",
	buttonClassName = "w-full h-12 px-8 inline-flex items-center justify-center gap-2 rounded-md font-medium tracking-wide bg-primary text-primary-foreground hover:bg-primary/90 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
}) {
	const [open, setOpen] = useState(false);

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<button
				type="button"
				className={buttonClassName}
				onClick={() => setOpen(true)}
			>
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
						Submit an enquiry — we&apos;ll respond within a working day. Nothing is charged until you accept the booking agreement.
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
