/**
 * Render the tenancy-agreement HTML by substituting handlebars-style
 * {{var}} tokens with values from the live tenancy + venue + lines.
 *
 * Unknown variables are left in place so authors notice typos.
 */

const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
const fmtGbp = (cents) => gbp.format((cents ?? 0) / 100);
const dateFmt = new Intl.DateTimeFormat("en-GB", {
	day: "numeric", month: "long", year: "numeric",
});

const WEEKDAY_LABELS = {
	MO: "Monday", TU: "Tuesday", WE: "Wednesday", TH: "Thursday",
	FR: "Friday", SA: "Saturday", SU: "Sunday",
};

function fmtDate(ymd) {
	if (!ymd) return "";
	const [y, m, d] = ymd.split("-").map(Number);
	return dateFmt.format(new Date(Date.UTC(y, m - 1, d)));
}

function describeRule(rule) {
	const days = (rule?.by_weekday ?? [])
		.map((k) => WEEKDAY_LABELS[k])
		.filter(Boolean)
		.join("/");
	const time =
		rule?.time_start && rule?.time_end
			? ` ${rule.time_start}–${rule.time_end}`
			: "";
	return `${days || "weekly"}${time}`;
}

function describeLine(line) {
	const roomName = line.room_name || "(room)";
	if (line.kind === "occupancy") {
		const rate = line.monthly_rate_cents != null
			? ` — ${fmtGbp(line.monthly_rate_cents)} / month`
			: "";
		return `${roomName} — full-time occupancy${rate}`;
	}
	const rules = Array.isArray(line.schedule_rule) ? line.schedule_rule : [];
	const ruleDesc = rules.map(describeRule).join("; ");
	let rate = "";
	if (line.billing_mode === "per_session" && line.per_session_rate_cents != null) {
		rate = ` — ${fmtGbp(line.per_session_rate_cents)} / session`;
	} else if (line.billing_mode === "per_hour" && line.per_hour_rate_cents != null) {
		rate = ` — ${fmtGbp(line.per_hour_rate_cents)} / hour`;
	} else if (line.billing_mode === "fixed_monthly" && line.fixed_monthly_rate_cents != null) {
		rate = ` — ${fmtGbp(line.fixed_monthly_rate_cents)} / month (fixed)`;
	}
	return `${roomName} — ${ruleDesc || "scheduled"}${rate}`;
}

/**
 * Build the merge-variable map for a given tenancy + venue + lines.
 * Lines is the array returned by listLinesForTenancy (each row carries
 * room_name from the join).
 */
export function buildAgreementVars({ tenancy, venue, lines }) {
	const address = Array.isArray(venue?.address_lines) ? venue.address_lines.filter(Boolean) : [];
	const lineList = Array.isArray(lines) ? lines : [];

	const roomNames = Array.from(
		new Set(lineList.map((l) => l.room_name).filter(Boolean)),
	).join(", ");

	const occupancyTotal = lineList
		.filter((l) => l.kind === "occupancy")
		.reduce((sum, l) => sum + (l.monthly_rate_cents ?? 0), 0);

	const monthlyRate =
		tenancy.monthly_override_cents != null
			? fmtGbp(tenancy.monthly_override_cents)
			: occupancyTotal > 0
				? fmtGbp(occupancyTotal)
				: "";

	const sessionRates = lineList
		.filter((l) => l.kind === "scheduled" && l.billing_mode === "per_session")
		.map((l) => l.per_session_rate_cents)
		.filter((c) => c != null);
	let perSessionRate = "";
	if (sessionRates.length > 0) {
		const min = Math.min(...sessionRates);
		const max = Math.max(...sessionRates);
		perSessionRate = min === max ? fmtGbp(min) : `${fmtGbp(min)} - ${fmtGbp(max)}`;
	}

	const linesSummary = lineList.map(describeLine).join("\n");

	return {
		venue_name: venue?.name ?? "",
		venue_address: address.join(", "),
		organisation_name: tenancy.organisation_name ?? "",
		room_name: roomNames,
		starts_on: fmtDate(tenancy.starts_on),
		ends_on: tenancy.ends_on ? fmtDate(tenancy.ends_on) : "ongoing",
		monthly_rate: monthlyRate,
		per_session_rate: perSessionRate,
		invoice_day_of_month: String(tenancy.invoice_day_of_month ?? 1),
		lines_summary: linesSummary,
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
