import { notFound, redirect } from "next/navigation";
import { getBookingByReference } from "@/db/queries/bookings";

export const dynamic = "force-dynamic";

export default async function LegacyBookingPayBalanceRedirect({ params }) {
	const { reference } = await params;
	const b = await getBookingByReference(reference);
	if (!b) notFound();
	redirect(`/booking-received/${b.id}`);
}
