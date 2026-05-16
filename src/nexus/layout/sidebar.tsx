"use client"

import * as React from "react"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { ScrollArea } from "@/shadcn/components/ui/scroll-area"

import { NavGroup } from "@/nexus/layout/sidebar-items/nav-group"
import { NavUser } from "@/nexus/layout/sidebar-items/nav-user"
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
} from "@/shadcn/components/ui/sidebar"

import mainMenuData from "@/nexus/data/main-menu.json"

function useNavCounts() {
	const pathname = usePathname()
	const [counts, setCounts] = React.useState<Record<string, number>>({})

	React.useEffect(() => {
		let cancelled = false
		async function load() {
			try {
				const res = await fetch("/api/admin/nav-counts", {
					cache: "no-store",
					credentials: "include",
				})
				if (!res.ok) return
				const data = await res.json()
				if (!cancelled) setCounts(data ?? {})
			} catch {
				// Silent - badges just don't render
			}
		}
		load()
		const id = setInterval(load, 60_000)
		return () => {
			cancelled = true
			clearInterval(id)
		}
	}, [pathname])

	return counts
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
	const counts = useNavCounts()
	return (
		<Sidebar collapsible="icon" {...props}>
			<SidebarHeader>
				<SidebarMenu>
					<SidebarMenuItem>
						<SidebarMenuButton
							asChild
							size="lg"
							className="data-[slot=sidebar-menu-button]:!p-1.5"
						>
							<a href="/admin" className="flex items-center gap-3">
								<Image
									src="/assembly-rooms-icon-white.png"
									alt=""
									width={64}
									height={64}
									className="size-8 shrink-0"
									priority
								/>
								<span className="font-display text-base tracking-tight leading-none group-data-[collapsible=icon]:hidden">
									Assembly Rooms
								</span>
							</a>
						</SidebarMenuButton>
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarHeader>
			<SidebarContent>
				<ScrollArea className="h-full w-full scroll-shadow">
					<div className="relative h-full">
						<NavGroup menu={mainMenuData.mainMenu} counts={counts} />
					</div>
				</ScrollArea>
			</SidebarContent>
			<SidebarFooter>
				<NavUser />
			</SidebarFooter>
		</Sidebar>
	)
}
