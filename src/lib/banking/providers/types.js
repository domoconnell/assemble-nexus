/**
 * Banking provider plugin contract.
 *
 * Every connected bank account is owned by exactly one provider plugin
 * (Starling, Revolut, etc). The sync service is provider-agnostic — it
 * dispatches `fetchBalance` / `listTransactions` on the registered plugin
 * for each account and persists the normalised results.
 *
 * @typedef {object} BankAccount
 *   The bank_account row (the `credentials` jsonb shape is plugin-specific).
 * @property {string} id
 * @property {string} venue_id
 * @property {string} provider                "starling" | "revolut" | …
 * @property {string} label
 * @property {string | null} external_account_uid
 * @property {Record<string, any>} credentials
 * @property {string} currency
 *
 * @typedef {object} NormalisedTransaction
 * @property {string} external_id
 *   Provider-stable identifier; unique per bank_account.
 * @property {"IN" | "OUT"} direction
 * @property {number} amount_minor
 * @property {string} currency
 * @property {string | null} counterparty_name
 * @property {string | null} counterparty_account
 *   Best-effort identifier for the OTHER side — sort-code+number,
 *   IBAN, account uid, or whatever's available. Used for transfer
 *   detection so try to be consistent within a provider.
 * @property {string | null} reference
 * @property {string | null} category_uid
 * @property {Date | null} settled_at
 * @property {Date | null} transaction_time
 * @property {unknown} raw_payload
 *
 * @typedef {object} ProviderPlugin
 * @property {string} key                     e.g. "starling"
 * @property {string} label                   e.g. "Starling Bank"
 * @property {string} [helpUrl]               Link to the provider's API docs
 *
 * @property {(account: BankAccount) => Promise<{ ok: boolean, error?: string, status?: number, currency?: string, account_label?: string }>} probe
 *   Sanity-check the saved credentials. Returns ok:true if the provider
 *   accepts the creds and the account is reachable.
 *
 * @property {(account: BankAccount) => Promise<{
 *   ok: boolean,
 *   error?: string,
 *   cleared_minor?: number,
 *   effective_minor?: number,
 *   pending_minor?: number,
 *   currency?: string,
 * }>} fetchBalance
 *
 * @property {(account: BankAccount, range: { from: Date, to: Date }) => Promise<{
 *   ok: boolean,
 *   error?: string,
 *   items?: NormalisedTransaction[],
 * }>} listTransactions
 *
 * @property {(account: BankAccount) => Promise<BankAccount>} [refreshCredentials]
 *   Optional. For OAuth-style providers (Revolut), runs token refresh and
 *   returns the updated account. Sync service calls this before any API
 *   call when the saved token is close to expiry. Plugins that use
 *   long-lived tokens (Starling PAT) can omit this.
 */
export const BANK_PROVIDER_KEYS = ["starling", "revolut"];
