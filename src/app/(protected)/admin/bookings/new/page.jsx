import Link from "next/link";
import { requireCurrentVenue } from "@/db/queries/venue";
import { loadBookingFormData } from "@/lib/booking/load-booking-form-data";
import { listOrganisations } from "@/db/queries/crm";
import BookingWidget from "@/site/booking/booking-widget";

export const dynamic = "force-dynamic";

export const metadata = {
	title: "New booking - Nexus",
};

export default async function AdminNewBookingPage({ searchParams }) {
	const sp = await searchParams;
	const preselectedSlug = typeof sp?.room === "string" ? sp.room : null;

	const venue = await requireCurrentVenue();
	const [{ rooms, bookingTypes, discounts, ticketingSettings }, organisations] =
		await Promise.all([
			loadBookingFormData(venue.id),
			listOrganisations(venue.id),
		]);

	return (
		<div className="mx-auto p-6 lg:p-10 max-w-6xl space-y-6 theme-site">
			<div>
				<Link
					href="/admin/bookings"
					className="text-sm text-muted-foreground hover:text-foreground"
				>
					← All bookings
				</Link>
				<h1 className="mt-2 text-2xl font-semibold">New booking</h1>
				<p className="mt-1 text-sm text-muted-foreground">
					Create a booking on a customer&apos;s behalf. They&apos;ll appear in the
					inbox as pending - approve immediately if you&apos;ve already taken the
					enquiry, or leave for them to confirm via the deposit link.
				</p>
			</div>
			<BookingWidget
				rooms={rooms}
				bookingTypes={bookingTypes}
				discounts={discounts}
				ticketingSettings={ticketingSettings}
				preselectedRoomSlug={preselectedSlug}
				mode="admin"
				availableOrganisations={organisations}
			/>
		</div>
	);
}
