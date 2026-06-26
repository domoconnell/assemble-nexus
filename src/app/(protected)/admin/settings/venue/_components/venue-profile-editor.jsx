"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/shadcn/components/ui/button";
import { Input } from "@/shadcn/components/ui/input";
import { Label } from "@/shadcn/components/ui/label";
import { Textarea } from "@/shadcn/components/ui/textarea";
import { saveVenueProfileAction } from "../actions";

export default function VenueProfileEditor({ initial }) {
	const router = useRouter();
	const [name, setName] = useState(initial?.name ?? "");
	const [addressText, setAddressText] = useState(
		Array.isArray(initial?.address_lines) ? initial.address_lines.join("\n") : "",
	);
	const [timezone, setTimezone] = useState(initial?.timezone ?? "Europe/London");
	const [phone, setPhone] = useState(initial?.phone ?? "");
	const [contactEmail, setContactEmail] = useState(initial?.contact_email ?? "");
	const [sendgridFrom, setSendgridFrom] = useState(initial?.sendgrid_from_email ?? "");
	const [saving, setSaving] = useState(false);

	async function save(e) {
		e.preventDefault();
		const trimmed = name.trim();
		if (!trimmed) return;
		setSaving(true);
		try {
			await saveVenueProfileAction({
				name: trimmed,
				address_lines: addressText
					.split(/\r?\n/)
					.map((s) => s.trim())
					.filter(Boolean),
				timezone: timezone.trim(),
				phone: phone.trim(),
				contact_email: contactEmail.trim(),
				sendgrid_from_email: sendgridFrom.trim(),
			});
			toast.success("Saved");
			router.refresh();
		} catch (err) {
			toast.error(err?.message || "Couldn't save the venue profile.");
		} finally {
			setSaving(false);
		}
	}

	return (
		<form onSubmit={save} className="rounded-lg border bg-card p-6 space-y-6">
			<div className="space-y-2">
				<Label htmlFor="venue-name">Venue name</Label>
				<Input
					id="venue-name"
					type="text"
					placeholder="The Assembly Rooms Newark"
					value={name}
					onChange={(e) => setName(e.target.value)}
					required
					maxLength={200}
				/>
				<p className="text-xs text-muted-foreground">
					Used in every email signoff, the board pack PDF header, and any
					other place the platform refers to the venue by name.
				</p>
			</div>

			<div className="space-y-2">
				<Label htmlFor="venue-address">Address</Label>
				<Textarea
					id="venue-address"
					rows={5}
					placeholder={"The Assembly Rooms Newark\n12 Castle Gate\nNewark\nNG24 1BG\nUnited Kingdom"}
					value={addressText}
					onChange={(e) => setAddressText(e.target.value)}
				/>
				<p className="text-xs text-muted-foreground">
					One line per row. Appears on ticket invoices and Schema.org event
					metadata for SEO.
				</p>
			</div>

			<div className="grid gap-4 sm:grid-cols-2">
				<div className="space-y-2">
					<Label htmlFor="venue-phone">Phone number</Label>
					<Input
						id="venue-phone"
						type="tel"
						placeholder="01636 000000"
						value={phone}
						onChange={(e) => setPhone(e.target.value)}
					/>
					<p className="text-xs text-muted-foreground">
						Public-facing number shown in the site footer + contact page.
					</p>
				</div>
				<div className="space-y-2">
					<Label htmlFor="venue-contact-email">Contact email</Label>
					<Input
						id="venue-contact-email"
						type="email"
						placeholder="enquire@assembly-rooms.com"
						value={contactEmail}
						onChange={(e) => setContactEmail(e.target.value)}
					/>
					<p className="text-xs text-muted-foreground">
						Public-facing email shown in the site footer + contact page.
					</p>
				</div>
			</div>

			<div className="grid gap-4 sm:grid-cols-2">
				<div className="space-y-2">
					<Label htmlFor="venue-timezone">Timezone</Label>
					<Input
						id="venue-timezone"
						type="text"
						placeholder="Europe/London"
						value={timezone}
						onChange={(e) => setTimezone(e.target.value)}
					/>
					<p className="text-xs text-muted-foreground">
						IANA timezone (e.g. <code>Europe/London</code>). All finance
						reporting + email date formatting uses this.
					</p>
				</div>
				<div className="space-y-2">
					<Label htmlFor="venue-from-email">Email &quot;from&quot; address</Label>
					<Input
						id="venue-from-email"
						type="email"
						placeholder="(uses SENDGRID_FROM_EMAIL env var)"
						value={sendgridFrom}
						onChange={(e) => setSendgridFrom(e.target.value)}
					/>
					<p className="text-xs text-muted-foreground">
						Optional override for the platform-wide SendGrid sender. Leave
						blank to use the env-configured address.
					</p>
				</div>
			</div>

			<div className="flex items-center justify-end gap-3 pt-2 border-t border-foreground/10">
				<Button type="submit" disabled={saving || !name.trim()}>
					{saving ? "Saving…" : "Save"}
				</Button>
			</div>
		</form>
	);
}
