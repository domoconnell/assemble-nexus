import { notFound } from "next/navigation";
import { Hero } from "@/site/ui/hero";
import { Container } from "@/site/ui/container";
import { getServerSession } from "@/utils/auth/server-guard";
import { getBookingForUser, listBookingSegments } from "@/db/queries/bookings";
import MagicLinkForm from "../../_components/magic-link-form";
import MyNav from "@/site/ui/my-nav";

export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("en-GB", {
	weekday: "long",
	day: "numeric",
	month: "long",
	year: "numeric",
	timeZone: "Europe/London",
});
const timeFmt = new Intl.DateTimeFormat("en-GB", {
	hour: "2-digit",
	minute: "2-digit",
	timeZone: "Europe/London",
});

function buildSubtitle(segments) {
	if (!Array.isArray(segments) || segments.length === 0) return undefined;
	const sorted = [...segments].sort(
		(a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime(),
	);
	const first = sorted[0];
	const start = new Date(first.starts_at);
	const end = first.ends_at ? new Date(first.ends_at) : null;
	const roomNames = [...new Set(sorted.map((s) => s.room_name).filter(Boolean))];
	const roomLabel = roomNames.length === 1 ? roomNames[0] : roomNames.join(", ");
	const timeLabel = end
		? `${dateFmt.format(start)} · ${timeFmt.format(start)}-${timeFmt.format(end)}`
		: dateFmt.format(start);
	return roomLabel ? `${roomLabel} · ${timeLabel}` : timeLabel;
}

/**
 * Shared chrome for every page rooted at /my-bookings/[id]/... — the
 * detail page, the per-instalment pay page, and any future child. Auth
 * is gated here once; the Hero (booking reference) and the MyNav pill
 * render in the same place so the header doesn't shift as the booker
 * moves between Pay and Back-to-my-booking.
 */
export default async function MyBookingLayout({ children, params }) {
	const { id } = await params;
	const session = await getServerSession();

	if (!session?.user) {
		return (
			<>
				<Hero
					height="short"
					kicker="Your booking"
					title="Sign in to see this booking."
					subtitle="No password needed - we'll email you a one-click link."
				/>
				<Container className="pt-6 pb-12 lg:pb-16">
					<MagicLinkForm
						callbackURL={`/my-bookings/${id}`}
						heading="See your booking"
					/>
				</Container>
			</>
		);
	}

	const b = await getBookingForUser(id, session.user.id);
	if (!b) notFound();

	const segments = await listBookingSegments(b.id);
	const subtitle = buildSubtitle(segments);

	return (
		<>
			<Hero
				height="short"
				kicker="Booking"
				title={b.reference}
				subtitle={subtitle}
			/>
			<Container className="pt-6 pb-12 lg:pb-16 space-y-6">
				<MyNav
					current="bookings"
					email={session.user.email}
					redirectTo="/my-bookings"
				/>
				{children}
			</Container>
		</>
	);
}
