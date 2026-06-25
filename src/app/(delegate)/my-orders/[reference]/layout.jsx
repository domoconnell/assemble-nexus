import { notFound } from "next/navigation";
import { Hero } from "@/site/ui/hero";
import { Container } from "@/site/ui/container";
import {
	getOrderByReference,
	getOrderForUserByReference,
} from "@/db/queries/orders";
import { listBookingsForUser } from "@/db/queries/bookings";
import { listEventsForHirer } from "@/db/queries/events";
import { getServerSession } from "@/utils/auth/server-guard";
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

/**
 * Shared chrome for /my-orders/[reference]/... Handles the three auth
 * states — signed out, signed in but order is held against a different
 * email (sign-in-as-buyer prompt), and signed in as the buyer.
 */
export default async function MyOrderLayout({ children, params }) {
	const { reference } = await params;
	const session = await getServerSession();

	if (!session?.user) {
		return (
			<>
				<Hero
					height="short"
					kicker="Your order"
					title="Sign in to see this order."
					subtitle="No password needed - we'll email you a one-click link."
				/>
				<Container className="pt-6 pb-12 lg:pb-16">
					<MagicLinkForm
						callbackURL={`/my-orders/${reference}`}
						heading="See your order"
					/>
				</Container>
			</>
		);
	}

	const order = await getOrderForUserByReference(reference, session.user.id);
	if (!order) {
		const publicOrder = await getOrderByReference(reference);
		if (!publicOrder) notFound();
		return (
			<>
				<Hero
					height="short"
					kicker="Your order"
					title="Sign in as the buyer to see this order."
					subtitle="The order is held against a different email. Sign in with the email you used to buy."
				/>
				<Container className="pt-6 pb-12 lg:pb-16">
					<MagicLinkForm
						callbackURL={`/my-orders/${reference}`}
						heading={`Sign in as ${publicOrder.customer_email}`}
						body="Pop the email you used at checkout in - we'll send a one-click sign-in link."
					/>
				</Container>
			</>
		);
	}

	const [bookings, events] = await Promise.all([
		listBookingsForUser(session.user.id),
		listEventsForHirer(session.user.id),
	]);

	const eventDate = order.event_starts_at ? new Date(order.event_starts_at) : null;
	const eventEnd = order.event_ends_at ? new Date(order.event_ends_at) : null;
	const subtitle = eventDate
		? `${dateFmt.format(eventDate)}${eventEnd ? ` · ${timeFmt.format(eventDate)} - ${timeFmt.format(eventEnd)}` : ""}`
		: undefined;

	return (
		<>
			<Hero
				height="short"
				kicker="Your order"
				title={order.event_title}
				subtitle={subtitle}
			/>
			<Container className="pt-6 pb-12 lg:pb-16 space-y-6 max-w-3xl">
				<MyNav
					current="orders"
					email={session.user.email}
					redirectTo="/my-orders"
					showBookings={bookings.length > 0}
					showEvents={events.length > 0}
				/>
				{children}
			</Container>
		</>
	);
}
