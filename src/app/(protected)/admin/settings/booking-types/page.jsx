import Link from "next/link";
import { asc, isNull } from "drizzle-orm";
import { db } from "@/db/index.js";
import { booking_type } from "@/db/schema/entities/booking_type.js";
import BookingTypesEditor from "./_components/booking-types-editor";

export const dynamic = "force-dynamic";

export default async function BookingTypesPage() {
	const types = await db
		.select()
		.from(booking_type)
		.where(isNull(booking_type.deletedAt))
		.orderBy(asc(booking_type.sort_order), asc(booking_type.label));

	return (
		<div className="mx-auto p-6 lg:p-10 max-w-5xl space-y-8">
			<div>
				<Link href="/admin/settings" className="text-sm text-muted-foreground hover:text-foreground">
					← Settings
				</Link>
				<h1 className="mt-2 text-2xl font-semibold">Booking types</h1>
				<p className="text-sm text-muted-foreground mt-1">
					What kinds of bookings do you offer? Each type carries a default rate modifier
					applied on top of the room&apos;s pricing rule.
				</p>
			</div>
			<BookingTypesEditor initialTypes={types} />
		</div>
	);
}
