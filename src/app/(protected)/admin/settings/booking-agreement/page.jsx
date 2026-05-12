import Link from "next/link";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db/index.js";
import { booking_agreement } from "@/db/schema/entities/booking_agreement.js";
import { requireCurrentVenue } from "@/db/queries/venue";
import BookingAgreementEditor from "./_components/booking-agreement-editor";

export const dynamic = "force-dynamic";

export default async function BookingAgreementPage() {
	const venue = await requireCurrentVenue();
	const [active] = await db
		.select()
		.from(booking_agreement)
		.where(
			and(
				eq(booking_agreement.venue_id, venue.id),
				eq(booking_agreement.is_active, true),
				isNull(booking_agreement.deletedAt),
			),
		)
		.orderBy(desc(booking_agreement.createdAt))
		.limit(1);

	return (
		<div className="mx-auto p-6 lg:p-10 max-w-4xl space-y-8">
			<div>
				<Link href="/admin/settings" className="text-sm text-muted-foreground hover:text-foreground">
					← Settings
				</Link>
				<h1 className="mt-2 text-2xl font-semibold">Booking agreement</h1>
				<p className="text-sm text-muted-foreground mt-1">
					Customers see this when paying their deposit. The current version is snapshotted onto each booking
					at approval time, so old bookings keep their original wording.
				</p>
			</div>
			<BookingAgreementEditor initialAgreement={active ?? null} />
		</div>
	);
}
