import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function LegacyBookingPayRedirect({ params }) {
	const { reference } = await params;
	redirect(`/booking/${reference}`);
}
