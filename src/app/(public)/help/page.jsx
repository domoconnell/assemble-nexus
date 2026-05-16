import Link from "next/link";
import { Hero } from "@/site/ui/hero";
import { Section } from "@/site/ui/section";

export const metadata = {
	title: "Help - The Assembly Rooms",
	description: "Everything you need to know about visiting, tickets, payments and refunds at The Assembly Rooms.",
};

const TOPICS = [
	{ id: "visiting", label: "Visiting" },
	{ id: "tickets", label: "Tickets" },
	{ id: "payments", label: "Payments" },
	{ id: "refunds", label: "Refunds & exchanges" },
	{ id: "accessibility", label: "Accessibility" },
	{ id: "cafe", label: "Café & food" },
	{ id: "hire", label: "Hiring the venue" },
	{ id: "contact", label: "Still stuck?" },
];

export default function HelpPage() {
	return (
		<>
			<Hero
				height="short"
				kicker="Help"
				title="Need a hand?"
				subtitle="Most questions answered below. If you can't find what you're looking for, drop us a line and we'll come back to you within a working day."
				hue="from-amber-500/15 via-orange-700/10 to-transparent"
			/>

			<Section>
				<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 max-w-4xl">
					{TOPICS.map((t) => (
						<a
							key={t.id}
							href={`#${t.id}`}
							className="rounded-lg border border-foreground/10 bg-card px-4 py-3 text-sm hover:border-foreground/30 transition"
						>
							<span className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
								Jump to
							</span>
							<div className="mt-1 font-medium">{t.label}</div>
						</a>
					))}
				</div>
			</Section>

			<Section
				id="visiting"
				kicker="Visiting"
				title="Getting to The Assembly Rooms."
			>
				<div className="space-y-6 max-w-2xl text-base leading-relaxed">
					<p className="text-muted-foreground">
						The Assembly Rooms is the hire and events arm of Assemble Church. We're a
						short walk from the centre of town. Step-free access from the main entrance,
						bike racks at the side door, and on-street parking nearby (paid until 6pm).
					</p>
					<Qa
						question="When are you open?"
						answer="The café is open six days a week (closed Mondays). Event nights run later, so check the listing for door times. For hire enquiries, our office hours are weekdays 9am to 5pm."
					/>
					<Qa
						question="Where do I check in for an event?"
						answer="Front door, ticket on phone or paper. We scan the QR code on the door and that's it. No need to print unless you'd prefer to."
					/>
					<Qa
						question="What time should I arrive?"
						answer="Doors usually open 30 minutes before the show. The exact time is on your ticket and on the event page. Show up earlier than that and the team won't be quite ready, but the café will be."
					/>
				</div>
			</Section>

			<Section
				id="tickets"
				kicker="Tickets"
				title="How tickets work."
			>
				<div className="space-y-6 max-w-2xl text-base leading-relaxed">
					<p className="text-muted-foreground">
						When you buy tickets, you'll get a confirmation email straight away with a
						link to view them in your browser. You'll also get a separate email with a
						PDF attachment and "Add to Wallet" buttons for Apple Wallet (and Google
						Wallet, when the event organiser has it set up).
					</p>
					<Qa
						question="I didn't get my email."
						answer="Check spam first. If it's not there, sign in at /my-orders with the email you used to buy. You'll see every order and you can re-download tickets from there. If you still can't find it, contact us with the email address you used."
					/>
					<Qa
						question="Can I transfer my ticket to someone else?"
						answer="Yes. Just forward the wallet email or the PDF. The QR code is what we scan, not the name on it. We don't check IDs on the door for general admission."
					/>
					<Qa
						question="What if I've lost my ticket?"
						answer="Sign in at /my-orders and re-download from your order page. Failing that, bring the email confirmation and a photo ID and we'll find you on the door."
					/>
					<Qa
						question="Do I need to print my ticket?"
						answer="No. A screenshot or the wallet pass on your phone is fine."
					/>
				</div>
			</Section>

			<Section
				id="payments"
				kicker="Payments"
				title="How we take payment."
			>
				<div className="space-y-6 max-w-2xl text-base leading-relaxed">
					<p className="text-muted-foreground">
						We take card payments through Stripe, the same checkout you see on most
						modern sites. Visa, Mastercard, Amex, Apple Pay and Google Pay are all
						supported. The price you see is the price you pay. There are no booking
						fees added at checkout.
					</p>
					<Qa
						question="Is my card information secure?"
						answer="We never see or store your card number. Stripe handles the card details directly. They're PCI-DSS Level 1 certified, the highest tier of payment security."
					/>
					<Qa
						question="Can I pay in cash on the door?"
						answer="Some events do walk-up sales, others sell out in advance. Check the event page or call us. Bookings (room hire) are always advance-payment only."
					/>
					<Qa
						question="Do you charge a booking fee?"
						answer="No. The ticket price on the event page is the price at checkout."
					/>
					<Qa
						question="Can I get an invoice or VAT receipt?"
						answer="Every order generates a receipt automatically. Open /my-orders, click the order, and you'll see a PDF download. For room hire, the invoice goes out with your booking confirmation."
					/>
				</div>
			</Section>

			<Section
				id="refunds"
				kicker="Refunds & exchanges"
				title="If your plans change."
			>
				<div className="space-y-6 max-w-2xl text-base leading-relaxed">
					<p className="text-muted-foreground">
						Tickets are non-refundable as standard. That's how most venues work, and
						it's how we plan staffing and stock. That said, we're not robots about it.
						If something has gone wrong on our end, or you've got a good reason and a
						bit of notice, we'll usually find a way to help.
					</p>
					<Qa
						question="The event was cancelled or postponed. What now?"
						answer="If we cancel an event, you get a full refund automatically. No need to ask. For postponements, your existing ticket usually rolls over to the new date. If the new date doesn't work, email us and we'll refund."
					/>
					<Qa
						question="I can't make it any more. Can I get a refund?"
						answer="Standard tickets aren't refundable, but if you can give us 7+ days' notice we'll often let you swap to another show of similar value, or pass the ticket to a friend (no name change needed, just forward the email)."
					/>
					<Qa
						question="My card was charged but I didn't get tickets."
						answer="That can happen if your bank holds a payment in 'pending' before authorising it. The charge usually drops off within a few days. If you do see a finalised charge with no tickets, email us with the order reference and we'll sort it."
					/>
					<Qa
						question="How long does a refund take?"
						answer="We process refunds the same day we receive the request. Stripe takes 5 to 10 working days to put the money back on your card, which is out of our hands. It'll show up as a credit against the original charge."
					/>
				</div>
			</Section>

			<Section
				id="accessibility"
				kicker="Accessibility"
				title="Coming with a need? Ask."
			>
				<div className="space-y-6 max-w-2xl text-base leading-relaxed">
					<p className="text-muted-foreground">
						Step-free access from the main entrance, accessible toilets on the ground
						floor, a hearing loop in the main hall, and a lift to the upstairs rooms.
						We hold a small number of wheelchair-bay spaces for each event. Book one
						in advance by emailing us with the order reference.
					</p>
					<Qa
						question="Do you offer companion tickets?"
						answer="Yes. One complimentary companion ticket per disabled patron. Email us with a copy of your Access Card, DLA/PIP/AA letter, or similar before booking and we'll set it up."
					/>
					<Qa
						question="Is there a quiet space if I need a break?"
						answer="The mezzanine room is usually available as a quiet space during shows. Ask a steward on the door and they'll point you up."
					/>
					<Qa
						question="Are guide and assistance dogs welcome?"
						answer="Always. Bowl of water at the bar."
					/>
				</div>
			</Section>

			<Section
				id="cafe"
				kicker="Café & food"
				title="The café."
			>
				<div className="space-y-6 max-w-2xl text-base leading-relaxed">
					<p className="text-muted-foreground">
						We run a working café out of the front of the building, open six days a
						week. Speciality coffee, pastries from a local baker, a short lunch menu.
						On show nights the bar opens about an hour before doors and stays open
						through the interval.
					</p>
					<Qa
						question="Can I bring outside food or drink?"
						answer="Sealed water bottles are fine. Beyond that, please support the café. We keep prices reasonable so the venue runs as a venue and not just a wedding hall."
					/>
					<Qa
						question="Do you cater for dietary requirements?"
						answer="The menu always has vegetarian, vegan and gluten-free options. For private hire catering, send us your requirements and we'll work around them."
					/>
				</div>
			</Section>

			<Section
				id="hire"
				kicker="Hiring the venue"
				title="Booking us for something."
			>
				<div className="space-y-6 max-w-2xl text-base leading-relaxed">
					<p className="text-muted-foreground">
						We hire out all three rooms for everything from corporate awaydays and
						wedding receptions to small gigs and rehearsal sessions. The booking form
						is the fastest way to start a conversation. Most enquiries get a reply
						the same working day.
					</p>
					<div className="pt-2">
						<Link
							href="/book"
							className="inline-flex items-center rounded-md border border-primary/40 bg-primary/10 px-4 py-2 text-sm text-primary hover:bg-primary/20 transition"
						>
							Start a booking →
						</Link>
					</div>
					<Qa
						question="How far in advance can I book?"
						answer="Up to 18 months. Beyond that we don't publish availability because room configurations and pricing get reviewed annually."
					/>
					<Qa
						question="Do I need to pay a deposit?"
						answer="For most hires, yes. Typically 25% of the total, payable on confirmation. The balance is due before the event. We send the balance invoice automatically so you don't have to chase us."
					/>
					<Qa
						question="What does the hire fee include?"
						answer="The room, the kit listed for the room (PA, lights, screens depending on which room you book), and a member of the venue team on the night. Catering, additional staff, security and SIA-licensed door staff are extra."
					/>
				</div>
			</Section>

			<Section
				id="contact"
				kicker="Still stuck?"
				title="Talk to a human."
			>
				<div className="space-y-4 max-w-2xl text-base leading-relaxed">
					<p className="text-muted-foreground">
						If your question isn't covered here, the{" "}
						<Link href="/contact" className="text-foreground hover:text-primary transition">
							contact page
						</Link>{" "}
						has the right email address for what you need. For anything time-sensitive
						about a ticket you've already bought, please include the order reference
						(it starts with <span className="font-mono">TX-</span>). That's the
						fastest way for us to find you in the system.
					</p>
				</div>
			</Section>
		</>
	);
}

function Qa({ question, answer }) {
	return (
		<div>
			<h3 className="text-base font-medium">{question}</h3>
			<p className="mt-1.5 text-muted-foreground">{answer}</p>
		</div>
	);
}
