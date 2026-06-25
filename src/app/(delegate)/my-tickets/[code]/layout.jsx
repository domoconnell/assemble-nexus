import { notFound } from "next/navigation";
import { Hero } from "@/site/ui/hero";
import { Container } from "@/site/ui/container";
import { getTicketForUserByCode } from "@/db/queries/orders";
import { listBookingsForUser } from "@/db/queries/bookings";
import { listEventsForHirer } from "@/db/queries/events";
import { getServerSession } from "@/utils/auth/server-guard";
import MagicLinkForm from "../../_components/magic-link-form";
import MyNav from "@/site/ui/my-nav";

export const dynamic = "force-dynamic";

/**
 * Shared chrome for /my-tickets/[code]/... Auth-gated; shows the ticket
 * event title in the Hero and the MyNav pill above the children.
 */
export default async function MyTicketLayout({ children, params }) {
	const { code } = await params;
	const session = await getServerSession();

	if (!session?.user) {
		return (
			<>
				<Hero
					height="short"
					kicker="Your ticket"
					title="Sign in to see this ticket."
					subtitle="No password needed - we'll email you a one-click link."
				/>
				<Container className="pt-6 pb-12 lg:pb-16">
					<MagicLinkForm
						callbackURL={`/my-tickets/${code}`}
						heading="See your ticket"
					/>
				</Container>
			</>
		);
	}

	const ticket = await getTicketForUserByCode(code, session.user.id);
	if (!ticket) notFound();

	const [bookings, events] = await Promise.all([
		listBookingsForUser(session.user.id),
		listEventsForHirer(session.user.id),
	]);

	return (
		<>
			<Hero
				height="short"
				kicker="Your ticket"
				title={ticket.event_title}
				subtitle={ticket.ticket_type_label}
			/>
			<Container className="pt-6 pb-12 lg:pb-16 space-y-6 max-w-2xl">
				<MyNav
					current="tickets"
					email={session.user.email}
					redirectTo="/my-tickets"
					showBookings={bookings.length > 0}
					showEvents={events.length > 0}
				/>
				{children}
			</Container>
		</>
	);
}
