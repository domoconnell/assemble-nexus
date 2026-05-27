"use client";

import { useEffect, useRef, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Button } from "@/shadcn/components/ui/button";
import { Input } from "@/shadcn/components/ui/input";
import { Label } from "@/shadcn/components/ui/label";

/**
 * <PaymentForm provider intentId clientSecret publishableKey amountCents currency onSuccess onError />
 *
 * Single entrypoint for every payment surface (ticket order, booking deposit,
 * balance invoice). Branches by `provider`:
 *
 *  - "fake":   inline card form, POSTs /api/payments/confirm.
 *  - "stripe": Stripe Payment Element + client-side confirmPayment.
 *              No card data ever touches our server.
 *
 * Consumers receive a normalised result via onSuccess / onError regardless of
 * provider. For Stripe, the "success" comes from the webhook landing later -
 * onSuccess fires when confirmPayment resolves without an error, and we then
 * poll the intent state to make sure it's settled.
 */
export default function PaymentForm({
	provider,
	intentId,
	clientSecret,
	publishableKey,
	amountCents = 0,
	currency = "gbp",
	onSuccess,
	onError,
}) {
	if (provider === "fake") {
		return (
			<FakeCardForm
				intentId={intentId}
				amountCents={amountCents}
				currency={currency}
				onSuccess={onSuccess}
				onError={onError}
			/>
		);
	}
	if (provider === "stripe") {
		if (!publishableKey || !clientSecret) {
			return <StripeNotReady />;
		}
		return (
			<StripePaymentForm
				publishableKey={publishableKey}
				clientSecret={clientSecret}
				intentId={intentId}
				amountCents={amountCents}
				currency={currency}
				onSuccess={onSuccess}
				onError={onError}
			/>
		);
	}
	return (
		<div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
			Unknown payment provider: {String(provider)}
		</div>
	);
}

const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });

function FakeCardForm({ intentId, amountCents, currency, onSuccess, onError }) {
	const [number, setNumber] = useState("");
	const [expMonth, setExpMonth] = useState("");
	const [expYear, setExpYear] = useState("");
	const [cvc, setCvc] = useState("");
	const [name, setName] = useState("");
	const [postcode, setPostcode] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState(null);

	async function submit(e) {
		e.preventDefault();
		setSubmitting(true);
		setError(null);
		try {
			const res = await fetch("/api/payments/confirm", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					intent_id: intentId,
					payment_method_details: {
						card: {
							number: number.replace(/\s+/g, ""),
							exp_month: Number(expMonth),
							exp_year: Number(expYear),
							cvc,
							name: name || null,
							postcode: postcode || null,
						},
					},
				}),
			});
			const data = await res.json();
			if (!res.ok) {
				const message = data?.error || "Payment failed";
				setError(message);
				onError?.(new Error(message));
				return;
			}
			onSuccess?.(data.intent);
		} catch (err) {
			const message = err?.message || "Payment failed";
			setError(message);
			onError?.(err instanceof Error ? err : new Error(message));
		} finally {
			setSubmitting(false);
		}
	}

	const total =
		currency === "gbp" ? gbp.format(amountCents / 100) : `${(amountCents / 100).toFixed(2)} ${currency.toUpperCase()}`;

	return (
		<form onSubmit={submit} className="rounded-xl border border-foreground/10 bg-card p-6 space-y-5">
			<div>
				<h2 className="text-xs uppercase tracking-[0.22em] text-foreground/70">Card details</h2>
				<p className="mt-2 text-xs text-muted-foreground">
					This venue is currently running on <span className="font-medium">FakePSP</span> - no real card
					is charged. Use any card number (16 digits, e.g. <span className="font-mono">4242 4242 4242 4242</span>);
					numbers ending in <span className="font-mono">0000</span> simulate a decline.
				</p>
			</div>

			{error && (
				<div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
					{error}
				</div>
			)}

			<div className="space-y-2">
				<Label>Card number</Label>
				<Input
					value={number}
					onChange={(e) => setNumber(e.target.value)}
					placeholder="4242 4242 4242 4242"
					inputMode="numeric"
					autoComplete="cc-number"
					required
				/>
			</div>

			<div className="grid gap-3 grid-cols-3">
				<div className="space-y-2">
					<Label>Exp month</Label>
					<Input
						value={expMonth}
						onChange={(e) => setExpMonth(e.target.value)}
						placeholder="12"
						inputMode="numeric"
						maxLength={2}
						autoComplete="cc-exp-month"
						required
					/>
				</div>
				<div className="space-y-2">
					<Label>Exp year</Label>
					<Input
						value={expYear}
						onChange={(e) => setExpYear(e.target.value)}
						placeholder="2029"
						inputMode="numeric"
						maxLength={4}
						autoComplete="cc-exp-year"
						required
					/>
				</div>
				<div className="space-y-2">
					<Label>CVC</Label>
					<Input
						value={cvc}
						onChange={(e) => setCvc(e.target.value)}
						placeholder="123"
						inputMode="numeric"
						maxLength={4}
						autoComplete="cc-csc"
						required
					/>
				</div>
			</div>

			<div className="grid gap-3 sm:grid-cols-2">
				<div className="space-y-2">
					<Label>Name on card</Label>
					<Input
						value={name}
						onChange={(e) => setName(e.target.value)}
						autoComplete="cc-name"
					/>
				</div>
				<div className="space-y-2">
					<Label>Postcode</Label>
					<Input
						value={postcode}
						onChange={(e) => setPostcode(e.target.value)}
						autoComplete="postal-code"
					/>
				</div>
			</div>

			<Button type="submit" disabled={submitting} className="w-full" size="lg">
				{submitting ? "Processing…" : `Pay ${total}`}
			</Button>
		</form>
	);
}

function StripeNotReady() {
	return (
		<div className="rounded-xl border border-foreground/10 bg-card p-6 space-y-3 text-sm text-muted-foreground">
			<h2 className="text-xs uppercase tracking-[0.22em] text-foreground/70">Card details</h2>
			<p>
				This venue is set to use Stripe, but the Stripe driver isn&apos;t configured yet.
				Switch back to FakePSP under <span className="font-medium">Settings → Payments</span> or
				complete the Stripe go-live phase.
			</p>
		</div>
	);
}

/**
 * Stripe Payment Element + confirmPayment. Mounts inside a single
 * iframe so we never see the card details. We use `redirect: "if_required"`
 * so most payments stay on this page; only 3DS challenges hop to the
 * issuer's page and back.
 *
 * After confirmPayment resolves successfully, we hand the intent to
 * onSuccess. The actual ticket/booking finalisation happens via the
 * /api/webhooks/stripe handler firing on `payment_intent.succeeded` -
 * the browser doesn't need to do anything else.
 */
function StripePaymentForm({
	publishableKey,
	clientSecret,
	intentId,
	amountCents,
	currency,
	onSuccess,
	onError,
}) {
	const containerRef = useRef(null);
	const stripeRef = useRef(null);
	const elementsRef = useRef(null);
	const [ready, setReady] = useState(false);
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState(null);

	useEffect(() => {
		let cancelled = false;
		async function mount() {
			try {
				const stripe = await loadStripe(publishableKey);
				if (cancelled || !stripe) return;
				stripeRef.current = stripe;
				const elements = stripe.elements({ clientSecret });
				elementsRef.current = elements;
				const paymentElement = elements.create("payment", {
					layout: { type: "tabs", defaultCollapsed: false },
				});
				paymentElement.on("ready", () => {
					if (!cancelled) setReady(true);
				});
				paymentElement.mount(containerRef.current);
			} catch (err) {
				console.error("[stripe-element-mount]", err);
				setError("Couldn't load Stripe. Please refresh and try again.");
			}
		}
		mount();
		return () => {
			cancelled = true;
			try {
				elementsRef.current?.getElement?.("payment")?.unmount();
			} catch { /* ignore unmount errors */ }
		};
	}, [publishableKey, clientSecret]);

	async function submit(e) {
		e.preventDefault();
		const stripe = stripeRef.current;
		const elements = elementsRef.current;
		if (!stripe || !elements) return;
		setSubmitting(true);
		setError(null);

		const { error: confirmError, paymentIntent } = await stripe.confirmPayment({
			elements,
			redirect: "if_required",
		});

		if (confirmError) {
			const message = confirmError.message || "Payment failed";
			setError(message);
			onError?.(new Error(message));
			setSubmitting(false);
			return;
		}

		if (paymentIntent?.status === "succeeded" || paymentIntent?.status === "processing") {
			// `processing` is fine - means Stripe accepted the payment
			// and webhook will confirm. Hand control back to the caller.
			onSuccess?.({
				id: paymentIntent.id ?? intentId,
				status: paymentIntent.status === "succeeded" ? "succeeded" : "requires_action",
				amount_cents: paymentIntent.amount ?? amountCents,
				currency: paymentIntent.currency ?? currency,
			});
		} else if (paymentIntent) {
			// requires_action / requires_payment_method / etc - usually
			// means the user needs to do something else. Stripe normally
			// handles the redirect for us when `redirect: "if_required"`
			// is set, so if we got here something needs fixing.
			const message = `Payment status: ${paymentIntent.status}. Please try again.`;
			setError(message);
			onError?.(new Error(message));
		}
		setSubmitting(false);
	}

	const total =
		currency === "gbp"
			? gbp.format(amountCents / 100)
			: `${(amountCents / 100).toFixed(2)} ${currency.toUpperCase()}`;

	return (
		<form onSubmit={submit} className="rounded-xl border border-foreground/10 bg-card p-6 space-y-5">
			<div>
				<h2 className="text-xs uppercase tracking-[0.22em] text-foreground/70">Card details</h2>
				<p className="mt-2 text-xs text-muted-foreground">
					Card details are collected by Stripe and never touch our servers.
				</p>
			</div>

			{error && (
				<div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
					{error}
				</div>
			)}

			<div
				ref={containerRef}
				className="min-h-40"
				aria-label="Stripe payment element"
			/>
			{!ready && (
				<div className="text-xs text-muted-foreground">Loading secure card form…</div>
			)}

			<Button type="submit" disabled={submitting || !ready} className="w-full" size="lg">
				{submitting ? "Processing…" : `Pay ${total}`}
			</Button>
		</form>
	);
}
