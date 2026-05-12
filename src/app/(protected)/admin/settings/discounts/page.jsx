import Link from "next/link";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/db/index.js";
import { discount } from "@/db/schema/entities/discount.js";
import { requireCurrentVenue } from "@/db/queries/venue";
import DiscountsEditor from "./_components/discounts-editor";

export const dynamic = "force-dynamic";

export default async function DiscountsPage() {
	const venue = await requireCurrentVenue();
	const discounts = await db
		.select()
		.from(discount)
		.where(and(eq(discount.venue_id, venue.id), isNull(discount.deletedAt)))
		.orderBy(asc(discount.sort_order), asc(discount.label));

	return (
		<div className="mx-auto p-6 lg:p-10 max-w-5xl space-y-8">
			<div>
				<Link href="/admin/settings" className="text-sm text-muted-foreground hover:text-foreground">
					← Settings
				</Link>
				<h1 className="mt-2 text-2xl font-semibold">Discounts</h1>
				<p className="text-sm text-muted-foreground mt-1">
					Discounts that customers can apply to their booking. Applies to room hire only — never to add-ons.
				</p>
			</div>
			<DiscountsEditor initialDiscounts={discounts} />
		</div>
	);
}
