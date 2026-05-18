/**
 * Render the tenancy-agreement HTML by substituting handlebars-style
 * {{var}} tokens with values from the live tenancy + venue. We deliberately
 * do NOT pull in Handlebars - the variables are a fixed allowlist and the
 * HTML itself is admin-authored, so a simple replace is safer and avoids
 * the dependency surface.
 *
 * Unknown variables are left in place so authors notice typos.
 */

const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
const fmtGbp = (cents) => gbp.format((cents ?? 0) / 100);
const dateFmt = new Intl.DateTimeFormat("en-GB", {
	day: "numeric", month: "long", year: "numeric",
});

function fmtDate(ymd) {
	if (!ymd) return "";
	const [y, m, d] = ymd.split("-").map(Number);
	return dateFmt.format(new Date(Date.UTC(y, m - 1, d)));
}

/**
 * Build the merge-variable map for a given tenancy + venue. Both objects
 * carry the shapes the queries already return.
 */
export function buildAgreementVars({ tenancy, venue }) {
	const address = Array.isArray(venue?.address_lines) ? venue.address_lines.filter(Boolean) : [];
	return {
		venue_name: venue?.name ?? "",
		venue_address: address.join(", "),
		organisation_name: tenancy.organisation_name ?? "",
		room_name: tenancy.room_name ?? "",
		starts_on: fmtDate(tenancy.starts_on),
		ends_on: tenancy.ends_on ? fmtDate(tenancy.ends_on) : "ongoing",
		monthly_rate:
			tenancy.kind === "private_rental"
				? fmtGbp(tenancy.monthly_rate_cents)
				: "",
		per_session_rate:
			tenancy.kind === "scheduled_recurring"
				? fmtGbp(tenancy.per_session_rate_cents)
				: "",
		invoice_day_of_month: String(tenancy.invoice_day_of_month ?? 1),
	};
}

export function renderAgreementHtml(html, vars) {
	if (!html) return "";
	return html.replace(/{{\s*([a-z_][a-z_0-9]*)\s*}}/gi, (match, name) => {
		if (Object.prototype.hasOwnProperty.call(vars, name)) {
			const v = vars[name];
			// minimal HTML-escape so values can't break out of attribute context
			return String(v ?? "")
				.replace(/&/g, "&amp;")
				.replace(/</g, "&lt;")
				.replace(/>/g, "&gt;");
		}
		return match;
	});
}
