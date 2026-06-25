import { notFound } from "next/navigation";
import { Hero } from "@/site/ui/hero";
import { Container } from "@/site/ui/container";
import { getEventById, userCanEditEvent } from "@/db/queries/events";
import { getServerSession } from "@/utils/auth/server-guard";
import MagicLinkForm from "../../_components/magic-link-form";
import MyNav from "@/site/ui/my-nav";

export const dynamic = "force-dynamic";

/**
 * Shared chrome for every page under /my-events/[id]/... — view, edit,
 * setup wizard. Owns the auth gate, the booking-ownership check, the
 * Hero (event title + when), and the MyNav pill so headers don't shift
 * between routes.
 */
export default async function MyEventLayout({ children, params }) {
	const { id } = await params;
	const session = await getServerSession();

	if (!session?.user) {
		return (
			<>
				<Hero
					height="short"
					kicker="Your event"
					title="Sign in to see this event."
					subtitle="No password needed - we'll email you a one-click link."
				/>
				<Container className="pt-6 pb-12 lg:pb-16">
					<MagicLinkForm
						callbackURL={`/my-events/${id}`}
						heading="See your event"
					/>
				</Container>
			</>
		);
	}

	const ev = await getEventById(id);
	if (!ev) notFound();
	const canEdit = await userCanEditEvent(session.user.id, ev.id);
	if (!canEdit) notFound();

	const start = ev.starts_at ? new Date(ev.starts_at) : null;
	const end = ev.ends_at ? new Date(ev.ends_at) : null;
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
	const subtitle = start
		? `${dateFmt.format(start)}${end ? ` · ${timeFmt.format(start)}-${timeFmt.format(end)}` : ""}`
		: undefined;

	return (
		<>
			<Hero height="short" kicker="Your event" title={ev.title} subtitle={subtitle} />
			<Container className="pt-6 pb-12 lg:pb-16 space-y-6">
				<MyNav
					current="events"
					email={session.user.email}
					redirectTo="/my-events"
				/>
				{children}
			</Container>
		</>
	);
}
