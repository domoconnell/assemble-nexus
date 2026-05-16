import { Hero } from "@/site/ui/hero";
import { Section } from "@/site/ui/section";
import { requireCurrentVenue } from "@/db/queries/venue";
import { loadBookingFormData } from "@/lib/booking/load-booking-form-data";
import { getPageContent } from "@/db/queries/site-content";
import BookingWidget from "@/site/booking/booking-widget";

export const metadata = {
	title: "Book - The Assembly Rooms",
	description: "Start a hire booking at The Assembly Rooms.",
};

export const dynamic = "force-dynamic";

export default async function BookPage({ searchParams }) {
	const sp = await searchParams;
	const preselectedSlug = typeof sp?.room === "string" ? sp.room : null;

	const venue = await requireCurrentVenue();
	const [{ rooms, bookingTypes, discounts, ticketingSettings }, content] = await Promise.all([
		loadBookingFormData(venue.id),
		getPageContent(venue.id, "book"),
	]);
	const hero = content.hero ?? {};

	return (
		<>
			{/* Hero adds nothing on mobile, eats valuable vertical space, and the
			    sticky bottom summary bar already shows the price. Show it only
			    from md upwards. */}
			<div className="hidden md:block">
				<Hero
					height="short"
					kicker={hero.kicker ?? "Book"}
					title={hero.title ?? "Tell us when, what, and how big."}
					subtitle={hero.subtitle ?? "Submit an enquiry and we'll come back within a working day with your deposit details. Nothing is charged until you accept the booking agreement."}
				/>
			</div>
			<Section>
				<BookingWidget
					rooms={rooms}
					bookingTypes={bookingTypes}
					discounts={discounts}
					ticketingSettings={ticketingSettings}
					preselectedRoomSlug={preselectedSlug}
				/>
			</Section>
		</>
	);
}
