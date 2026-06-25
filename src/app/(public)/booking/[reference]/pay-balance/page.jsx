import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function LegacyBookingPayBalanceRedirect({ params }) {
	const { reference } = await params;
	redirect(`/booking/${reference}`);
}
