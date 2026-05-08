"use client";
import LoadingSpinner from "@/global/ui/components/loading-spinner";
import Show from "@/global/ui/components/show";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/nexus/context/auth-context";

import { AppSidebar } from "@/nexus/layout/sidebar"
import { SiteHeader } from "@/nexus/layout/site-header"
import {
	SidebarInset,
	SidebarProvider,
} from "@/shadcn/components/ui/sidebar"
import { useAppContext } from "@/nexus/context/app-context";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/utils/auth/auth-client";
import { TabProvider } from "@/nexus/layout/site-header-items/tabs-provider";

export default function ApplicationLayout({children}) {
	const { isHydratingProfile } = useAuth();
	const { events } = useAppContext();
	const router = useRouter();
	const [loadingOverlay, setLoadingOverlay] = useState(false);

	useEffect(() => {
		events.on("logout", LogOut);
		return () => {
			events.off("logout", LogOut);
		};
	}, []);

	const show = (() => {
		const [v, setV] = useState(false)

		useEffect(() => {
			if (!isHydratingProfile) {
				const t = setTimeout(() => setV(true), 100)
				return () => clearTimeout(t)
			}
			setV(false)
		}, [isHydratingProfile])

		return v
	})()

	const LogOut = async () => {
		setLoadingOverlay(true);
		await authClient.signOut();
		router.replace("/auth/login?logout");
	}

	if (isHydratingProfile) {
		return (
			<div className="flex items-center justify-center min-h-screen">
				<LoadingSpinner large />
			</div>
		);
	}

	return (
		<>
			<Show show={show}>
				<SidebarProvider
					style={{
						"--sidebar-width": "calc(var(--spacing) * 72)",
						"--header-height": "calc(var(--spacing) * 12)",
					}}
				>
					<AppSidebar variant="inset" collapsible="icon" />
					<TabProvider>
						<SidebarInset>
							<SiteHeader />
							<div className="flex flex-1 flex-col">
								<div className="@container/main">
									{children}
								</div>
							</div>
						</SidebarInset>
					</TabProvider>
				</SidebarProvider>
			</Show>
			<AnimatePresence>
				{loadingOverlay && (
					<motion.div
						key="loading-overlay"
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						transition={{ duration: 0.2, ease: "easeOut" }}
						className="fixed inset-0 z-[51] bg-zinc-900/50 backdrop-blur-sm flex items-center justify-center"
					>
						<LoadingSpinner large />
					</motion.div>
				)}
			</AnimatePresence>
		</>
	);
}
