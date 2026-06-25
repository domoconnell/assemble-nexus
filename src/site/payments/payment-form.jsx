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

			<div className="grid gap-3 grid-cols-2 sm:grid-cols-3">
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
 * Stripe form, custom-built to match the site:
 *
 *   ┌──────────────────────────────────┐
 *   │  [  Apple Pay  ] [  Google Pay ] │  ← our buttons, only shown
 *   │                                  │     when the device supports
 *   │  ────────── Or ──────────         │     that wallet
 *   │  Card number                     │
 *   │  Expiry          CVC             │  ← individual Stripe iframes
 *   │  Name            Postcode        │     themed to the site
 *   │  [ Pay £X ]                      │
 *   └──────────────────────────────────┘
 *
 * Wallets use the legacy `stripe.paymentRequest()` API - it lets us own
 * the button visuals and only opens the native wallet sheet on tap. No
 * Stripe-branded button needed. We surface whichever wallets the
 * device reports via canMakePayment(): typically just one per device.
 *
 * Both wallet + card paths confirm the same PaymentIntent client-side.
 * Actual ticket / booking finalisation happens via the webhook firing
 * `payment_intent.succeeded`.
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
	const cardNumberRef = useRef(null);
	const cardExpiryRef = useRef(null);
	const cardCvcRef = useRef(null);
	const stripeRef = useRef(null);
	const elementsRef = useRef(null);
	const paymentRequestRef = useRef(null);
	const [walletKinds, setWalletKinds] = useState({ applePay: false, googlePay: false });
	const [cardReady, setCardReady] = useState(false);
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState(null);
	const [name, setName] = useState("");
	const [postcode, setPostcode] = useState("");

	useEffect(() => {
		let cancelled = false;

		async function mount() {
			try {
				const stripe = await loadStripe(publishableKey);
				if (cancelled || !stripe) return;
				stripeRef.current = stripe;

				const appearance = computeStripeAppearance();

				// PaymentRequest powers the wallet buttons. It lets the
				// browser pre-flight Apple Pay / Google Pay availability,
				// shows the native sheet on demand, then hands back a
				// payment_method we attach to the existing PaymentIntent.
				const pr = stripe.paymentRequest({
					country: "GB",
					currency: currency.toLowerCase(),
					total: { label: "Total", amount: amountCents },
					requestPayerName: true,
					requestPayerEmail: false,
					disableWallets: ["link", "browserCard"],
				});
				const supported = await pr.canMakePayment();
				if (!cancelled && supported) {
					setWalletKinds({
						applePay: !!supported.applePay,
						googlePay: !!supported.googlePay,
					});
					paymentRequestRef.current = pr;
				}
				pr.on("paymentmethod", async (ev) => {
					setSubmitting(true);
					setError(null);
					const { error: confirmError, paymentIntent } =
						await stripe.confirmCardPayment(
							clientSecret,
							{ payment_method: ev.paymentMethod.id },
							{ handleActions: false },
						);
					if (confirmError) {
						ev.complete("fail");
						setError(confirmError.message || "Payment failed");
						onError?.(new Error(confirmError.message || "Payment failed"));
						setSubmitting(false);
						return;
					}
					ev.complete("success");
					// If 3DS challenge is required, finalise that here.
					if (paymentIntent?.status === "requires_action") {
						const next = await stripe.confirmCardPayment(clientSecret);
						if (next.error) {
							setError(next.error.message || "Payment failed");
							onError?.(new Error(next.error.message || "Payment failed"));
							setSubmitting(false);
							return;
						}
						handleSettledIntent(next.paymentIntent);
						return;
					}
					handleSettledIntent(paymentIntent);
				});

				// Card collection. The individual `cardNumber` / `cardExpiry`
				// / `cardCvc` elements are legacy and DO NOT honour the
				// modern `appearance` config — that one only applies to the
				// unified Payment Element. For these we have to pass the
				// classic `style` option on each .create() call instead.
				const cardElements = stripe.elements({ appearance });
				elementsRef.current = cardElements;
				const cardElementStyle = {
					base: {
						color: "#f8fafc",
						backgroundColor: "transparent",
						fontFamily:
							"system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
						fontSize: "16px",
						"::placeholder": {
							color: "#94a3b8",
						},
					},
					invalid: {
						color: "#ef4444",
					},
				};
				const cardNumber = cardElements.create("cardNumber", {
					style: cardElementStyle,
					showIcon: true,
				});
				const cardExpiry = cardElements.create("cardExpiry", {
					style: cardElementStyle,
				});
				const cardCvc = cardElements.create("cardCvc", {
					style: cardElementStyle,
				});
				let mounted = 0;
				const onReady = () => {
					mounted += 1;
					if (mounted === 3 && !cancelled) setCardReady(true);
				};
				cardNumber.on("ready", onReady);
				cardExpiry.on("ready", onReady);
				cardCvc.on("ready", onReady);
				cardNumber.mount(cardNumberRef.current);
				cardExpiry.mount(cardExpiryRef.current);
				cardCvc.mount(cardCvcRef.current);
			} catch (err) {
				console.error("[stripe-element-mount]", err);
				setError("Couldn't load Stripe. Please refresh and try again.");
			}
		}

		function handleSettledIntent(pi) {
			if (!pi) return;
			if (pi.status === "succeeded" || pi.status === "processing") {
				onSuccess?.({
					id: pi.id ?? intentId,
					status: pi.status === "succeeded" ? "succeeded" : "requires_action",
					amount_cents: pi.amount ?? amountCents,
					currency: pi.currency ?? currency,
				});
			} else {
				setError(`Payment status: ${pi.status}. Please try again.`);
				onError?.(new Error(`Payment status: ${pi.status}`));
			}
			setSubmitting(false);
		}

		mount();
		return () => {
			cancelled = true;
			try {
				elementsRef.current?.getElement?.("cardNumber")?.unmount();
				elementsRef.current?.getElement?.("cardExpiry")?.unmount();
				elementsRef.current?.getElement?.("cardCvc")?.unmount();
			} catch { /* ignore */ }
		};
	}, [publishableKey, clientSecret, amountCents, currency, intentId, onSuccess, onError]);

	async function openWallet() {
		const pr = paymentRequestRef.current;
		if (!pr) return;
		try {
			pr.show();
		} catch (err) {
			setError(err?.message || "Couldn't open wallet");
		}
	}

	async function payByCard(e) {
		e.preventDefault();
		const stripe = stripeRef.current;
		const elements = elementsRef.current;
		const cardNumber = elements?.getElement?.("cardNumber");
		if (!stripe || !cardNumber) return;
		setSubmitting(true);
		setError(null);

		const { error: confirmError, paymentIntent } = await stripe.confirmCardPayment(
			clientSecret,
			{
				payment_method: {
					card: cardNumber,
					billing_details: {
						name: name || undefined,
						address: postcode ? { postal_code: postcode } : undefined,
					},
				},
			},
		);

		if (confirmError) {
			setError(confirmError.message || "Payment failed");
			onError?.(new Error(confirmError.message || "Payment failed"));
			setSubmitting(false);
			return;
		}

		if (paymentIntent?.status === "succeeded" || paymentIntent?.status === "processing") {
			onSuccess?.({
				id: paymentIntent.id ?? intentId,
				status: paymentIntent.status === "succeeded" ? "succeeded" : "requires_action",
				amount_cents: paymentIntent.amount ?? amountCents,
				currency: paymentIntent.currency ?? currency,
			});
		} else if (paymentIntent) {
			setError(`Payment status: ${paymentIntent.status}. Please try again.`);
			onError?.(new Error(`Payment status: ${paymentIntent.status}`));
		}
		setSubmitting(false);
	}

	const total =
		currency === "gbp"
			? gbp.format(amountCents / 100)
			: `${(amountCents / 100).toFixed(2)} ${currency.toUpperCase()}`;

	const hasAnyWallet = walletKinds.applePay || walletKinds.googlePay;

	return (
		<form onSubmit={payByCard} className="rounded-xl border border-foreground/10 bg-card p-6 space-y-5">
			<div>
				<h2 className="text-xs uppercase tracking-[0.22em] text-foreground/70">Pay securely</h2>
				<p className="mt-2 text-xs text-muted-foreground">
					Card details are tokenised in your browser and never reach our servers.
				</p>
			</div>

			{error && (
				<div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive space-y-1">
					<div>{error}</div>
					<div className="text-xs text-destructive/80">
						Update the card details below and tap <strong>Pay</strong> again, or try a different card.
					</div>
				</div>
			)}

			{hasAnyWallet && (
				<>
					<div
						className={`grid gap-2 ${
							walletKinds.applePay && walletKinds.googlePay
								? "grid-cols-1 sm:grid-cols-2"
								: "grid-cols-1"
						}`}
					>
						{walletKinds.applePay && (
							<button
								type="button"
								onClick={openWallet}
								disabled={submitting}
								aria-label="Pay with Apple Pay"
								className="h-12 rounded-md bg-black text-white flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-50 transition"
							>
								<AppleLogo className="h-5 w-5" />
								<span className="text-sm font-medium tracking-tight">Pay</span>
							</button>
						)}
						{walletKinds.googlePay && (
							<button
								type="button"
								onClick={openWallet}
								disabled={submitting}
								aria-label="Pay with Google Pay"
								className="h-12 rounded-md bg-black text-white flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-50 transition"
							>
								<GoogleGlyph className="h-5 w-5" />
								<span className="text-sm font-medium tracking-tight">Pay</span>
							</button>
						)}
					</div>
					<div className="flex items-center gap-3 text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
						<span className="h-px flex-1 bg-foreground/10" />
						or
						<span className="h-px flex-1 bg-foreground/10" />
					</div>
				</>
			)}

			{/* Card fields - rendered as themed Stripe iframes */}
			<div className="space-y-3">
				<div className="space-y-1.5">
					<Label>Card number</Label>
					<div
						ref={cardNumberRef}
						className="rounded-md border border-input bg-background px-3 py-2.5 min-h-10"
					/>
				</div>
				<div className="grid grid-cols-2 gap-3">
					<div className="space-y-1.5">
						<Label>Expiry</Label>
						<div
							ref={cardExpiryRef}
							className="rounded-md border border-input bg-background px-3 py-2.5 min-h-10"
						/>
					</div>
					<div className="space-y-1.5">
						<Label>CVC</Label>
						<div
							ref={cardCvcRef}
							className="rounded-md border border-input bg-background px-3 py-2.5 min-h-10"
						/>
					</div>
				</div>
				<div className="grid gap-3 sm:grid-cols-2">
					<div className="space-y-1.5">
						<Label>Name on card</Label>
						<Input
							value={name}
							onChange={(e) => setName(e.target.value)}
							autoComplete="cc-name"
							className="text-foreground"
						/>
					</div>
					<div className="space-y-1.5">
						<Label>Postcode</Label>
						<Input
							value={postcode}
							onChange={(e) => setPostcode(e.target.value)}
							autoComplete="postal-code"
							className="text-foreground"
						/>
					</div>
				</div>
			</div>

			{!cardReady && (
				<div className="text-xs text-muted-foreground">Loading secure card form…</div>
			)}

			<Button type="submit" disabled={submitting || !cardReady} className="w-full" size="lg">
				{submitting ? "Processing…" : `Pay ${total}`}
			</Button>
		</form>
	);
}

function AppleLogo({ className }) {
	return (
		<svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
			<path d="M17.564 12.853c-.026-2.638 2.155-3.91 2.253-3.972-1.226-1.791-3.135-2.037-3.815-2.065-1.625-.164-3.171.957-3.998.957-.825 0-2.097-.933-3.45-.907-1.776.027-3.412 1.032-4.327 2.622-1.844 3.193-.471 7.916 1.328 10.509.88 1.27 1.929 2.696 3.305 2.645 1.327-.054 1.827-.86 3.43-.86 1.601 0 2.053.86 3.456.833 1.426-.027 2.331-1.293 3.205-2.572 1.01-1.476 1.426-2.905 1.45-2.978-.031-.013-2.779-1.067-2.807-4.212zM14.918 5.187c.728-.881 1.218-2.106 1.083-3.327-1.047.043-2.318.697-3.07 1.578-.673.78-1.263 2.027-1.105 3.225 1.169.09 2.363-.595 3.092-1.476z" />
		</svg>
	);
}

function GoogleGlyph({ className }) {
	return (
		<svg className={className} viewBox="0 0 24 24" aria-hidden>
			<path fill="#4285F4" d="M22.501 12.233c0-.815-.073-1.6-.21-2.355H12v4.451h5.882a5.033 5.033 0 0 1-2.181 3.303v2.747h3.527c2.064-1.9 3.273-4.704 3.273-8.146z" />
			<path fill="#34A853" d="M12 22.5c2.946 0 5.418-.973 7.224-2.621l-3.527-2.747c-.98.66-2.235 1.05-3.697 1.05-2.842 0-5.249-1.918-6.108-4.498H2.252v2.83A10.498 10.498 0 0 0 12 22.5z" />
			<path fill="#FBBC04" d="M5.892 13.684A6.31 6.31 0 0 1 5.566 12c0-.585.1-1.152.276-1.684V7.486H2.252A10.498 10.498 0 0 0 1.5 12c0 1.685.404 3.279 1.116 4.685l3.276-3.001z" />
			<path fill="#EA4335" d="M12 5.502c1.603 0 3.04.552 4.173 1.633l3.125-3.125C17.41 2.182 14.94 1.5 12 1.5A10.498 10.498 0 0 0 2.252 7.486l3.64 2.83C6.748 7.62 9.156 5.502 12 5.502z" />
		</svg>
	);
}

/**
 * Stripe Elements appearance. Hardcoded values rather than probing CSS
 * variables — the iframe can't read our cascade anyway, and var() in
 * fontFamily was silently rejecting the whole config. Values match the
 * .theme-site palette closely enough; tweak here if the palette shifts.
 */
/**
 * Modern Stripe Elements `appearance` config — applied to the unified
 * Payment Element and the Payment Request (Apple Pay / Google Pay) sheet.
 * The individual card elements (cardNumber/cardExpiry/cardCvc) IGNORE
 * this entirely and are styled via the legacy `style` option at
 * .create() time, see the StripePaymentForm component.
 */
function computeStripeAppearance() {
	return {
		theme: "night",
		variables: {
			fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
			fontSizeBase: "14px",
			colorText: "#f8fafc",
			colorTextPlaceholder: "#94a3b8",
			colorPrimary: "#0f766e",
			colorDanger: "#ef4444",
			colorBackground: "#0f172a",
			borderRadius: "6px",
		},
	};
}
