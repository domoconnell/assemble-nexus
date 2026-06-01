/**
 * Catalog of staff-bound email notifications a user can opt in/out of.
 *
 * Each entry is a SendGrid template key (must exist in templates.js).
 * The admin user-manager UI renders one checkbox column per entry; the
 * recipient resolvers (e.g. booking-staff-notification) call
 * `isSubscribed(user, key)` to decide whether to include each user.
 *
 * Add a new staff notification: append an entry here, then the resolver
 * for that template uses `isSubscribed` against it. Defaults to opt-in
 * (missing = subscribed), so newly-added types don't silently drop
 * existing users off the list.
 */

export const STAFF_NOTIFICATION_TYPES = [
	{
		key: "booking-staff-notification",
		label: "New booking enquiries",
		description:
			"Sent the moment a new booking is submitted. Includes the customer, rooms, dates, and a link to review.",
	},
	{
		key: "monthly-board-pack",
		label: "Monthly board pack",
		description:
			"PDF report sent on the 1st of every month covering the previous month's P&L.",
	},
];

export function isSubscribed(user, key) {
	const subs = user?.email_subscriptions ?? {};
	// Default to subscribed; only explicit `false` opts out.
	return subs[key] !== false;
}

export function staffNotificationKeys() {
	return STAFF_NOTIFICATION_TYPES.map((t) => t.key);
}
