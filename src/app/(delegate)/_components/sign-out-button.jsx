"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/utils/auth/auth-client";

export default function SignOutButton({ redirectTo = "/my-tickets" }) {
	const router = useRouter();
	const [pending, startTransition] = useTransition();

	function signOut() {
		startTransition(async () => {
			try {
				await authClient.signOut();
			} catch {}
			router.refresh();
			router.push(redirectTo);
		});
	}

	return (
		<button
			type="button"
			onClick={signOut}
			disabled={pending}
			className="text-xs text-muted-foreground hover:text-foreground underline disabled:opacity-50"
		>
			{pending ? "Signing out…" : "Sign out"}
		</button>
	);
}
