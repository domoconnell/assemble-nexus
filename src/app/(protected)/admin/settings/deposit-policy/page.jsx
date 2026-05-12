import Link from "next/link";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db/index.js";
import { deposit_policy } from "@/db/schema/entities/deposit_policy.js";
import { requireCurrentVenue } from "@/db/queries/venue";
import DepositPolicyEditor from "./_components/deposit-policy-editor";

export const dynamic = "force-dynamic";

export default async function DepositPolicyPage() {
	const venue = await requireCurrentVenue();
	const [active] = await db
		.select()
		.from(deposit_policy)
		.where(
			and(
				eq(deposit_policy.venue_id, venue.id),
				eq(deposit_policy.is_active, true),
				isNull(deposit_policy.deletedAt),
			),
		)
		.orderBy(desc(deposit_policy.createdAt))
		.limit(1);

	return (
		<div className="mx-auto p-6 lg:p-10 max-w-3xl space-y-8">
			<div>
				<Link href="/admin/settings" className="text-sm text-muted-foreground hover:text-foreground">
					← Settings
				</Link>
				<h1 className="mt-2 text-2xl font-semibold">Deposit policy</h1>
				<p className="text-sm text-muted-foreground mt-1">
					Snapshotted onto each booking at submit time, so changes here only affect new bookings.
				</p>
			</div>
			<DepositPolicyEditor initialPolicy={active ?? null} />
		</div>
	);
}
