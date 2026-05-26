"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/shadcn/components/ui/button";

/**
 * Two-button group sitting in the centre of the page header:
 *   - `Subscribe to calendar` opens a webcal:// link so the default
 *     calendar app prompts to add the subscription
 *   - A small icon button beside it copies the https URL to the
 *     clipboard for users who prefer to paste it into Google Calendar
 *     or another app manually
 */
export default function SubscribeButton({ webcalUrl, httpsUrl }) {
	const [copied, setCopied] = useState(false);

	async function copyHttps() {
		try {
			await navigator.clipboard.writeText(httpsUrl);
			setCopied(true);
			toast.success("Calendar URL copied");
			setTimeout(() => setCopied(false), 1500);
		} catch {
			toast.error("Copy failed - select and copy manually.");
		}
	}

	return (
		<div className="flex items-center gap-2">
			<Button asChild>
				<a href={webcalUrl}>Subscribe to calendar</a>
			</Button>
			<Button
				size="icon"
				variant="outline"
				onClick={copyHttps}
				aria-label="Copy calendar URL"
				title={httpsUrl}
			>
				{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
			</Button>
		</div>
	);
}
