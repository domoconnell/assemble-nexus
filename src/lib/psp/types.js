/**
 * Payment Service Provider abstraction.
 *
 * Every card-payment touch-point in the app — booking deposits, balance
 * invoices, ticket orders, refunds — goes through this interface. Concrete
 * drivers (FakePSP, Stripe) implement it identically so consumers don't care
 * which provider is active.
 *
 * @typedef {"requires_payment_method"|"requires_action"|"succeeded"|"canceled"|"failed"} PspIntentStatus
 *
 * @typedef {object} PaymentIntent
 * @property {string}            id              PSP-side intent id, prefixed by provider (fpi_… / pi_…).
 * @property {PspIntentStatus}   status
 * @property {number}            amount_cents
 * @property {string}            currency        ISO 4217 lower-case (e.g. "gbp").
 * @property {string}            client_secret   Opaque token consumed by the client SDK.
 * @property {Record<string,unknown>} metadata
 *
 * @typedef {object} Refund
 * @property {string}                                id
 * @property {string}                                payment_intent_id
 * @property {number}                                amount_cents
 * @property {"succeeded"|"pending"|"failed"}        status
 *
 * @typedef {object} CardDetails
 * @property {string} number
 * @property {number} exp_month
 * @property {number} exp_year
 * @property {string} cvc
 * @property {string} [postcode]
 * @property {string} [name]
 *
 * @typedef {object} PaymentMethodDetails
 * @property {CardDetails} [card]
 *
 * @typedef {object} PspDriver
 * @property {"fake"|"stripe"} key
 * @property {boolean}         requiresClientSdk   true → load Stripe.js (or similar) on the client.
 * @property {(args: {
 *   amount_cents: number,
 *   currency?: string,
 *   metadata?: Record<string, unknown>,
 *   idempotency_key?: string,
 *   ticket_order_id?: string,
 *   booking_id?: string,
 * }) => Promise<PaymentIntent>} createPaymentIntent
 * @property {(id: string) => Promise<PaymentIntent | null>} retrievePaymentIntent
 * @property {(args: {
 *   intent_id: string,
 *   payment_method_details: PaymentMethodDetails,
 * }) => Promise<PaymentIntent>} confirmPayment
 * @property {(args: { intent_id: string, amount_cents: number }) => Promise<Refund>} createRefund
 * @property {(args: { signature?: string, body: string | Buffer }) => Promise<{ type: string, data: unknown }>} parseWebhook
 */

export const PSP_KEYS = ["fake", "stripe"];
