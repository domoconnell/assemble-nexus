"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/shadcn/components/ui/select";
import { Button } from "@/shadcn/components/ui/button";
import { assignBookingOrganisationAction } from "../actions";

const NONE = "__none__";

export default function BookingOrganisationPicker({
	bookingId,
	currentOrgId,
	currentOrgName,
	organisations,
}) {
	const router = useRouter();
	const [pending, startTransition] = useTransition();
	const [value, setValue] = useState(currentOrgId || NONE);

	function save(next) {
		setValue(next);
		startTransition(async () => {
			try {
				await assignBookingOrganisationAction({
					booking_id: bookingId,
					organisation_id: next === NONE ? null : next,
				});
				toast.success(next === NONE ? "Unlinked" : "Organisation set");
				router.refresh();
			} catch (err) {
				toast.error(err?.message || "Couldn't update");
			}
		});
	}

	return (
		<section className="rounded-lg border bg-card p-6 space-y-3">
			<div className="flex items-baseline justify-between gap-3">
				<h2 className="text-sm uppercase tracking-[0.2em] text-muted-foreground">
					Organisation
				</h2>
				{currentOrgId && (
					<Button asChild variant="ghost" size="sm">
						<Link href={`/admin/crm/${currentOrgId}`}>Open →</Link>
					</Button>
				)}
			</div>
			<Select value={value} onValueChange={save} disabled={pending}>
				<SelectTrigger>
					<SelectValue placeholder="None" />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value={NONE}>None</SelectItem>
					{organisations.map((o) => (
						<SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
					))}
				</SelectContent>
			</Select>
			<p className="text-xs text-muted-foreground">
				Link this booking to an organisation so it rolls up into their CRM balance.
			</p>
		</section>
	);
}
