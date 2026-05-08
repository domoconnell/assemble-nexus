"use client"

import * as React from "react"
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

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
	return (
		<Sidebar collapsible="offcanvas" {...props}>
			<SidebarHeader>
				<SidebarMenu>
					<SidebarMenuItem>
						<SidebarMenuButton
							asChild
							className="data-[slot=sidebar-menu-button]:!p-1.5"
						>
							<span>
								<span className="text-base font-semibold">Nexus</span>
							</span>
						</SidebarMenuButton>
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarHeader>
			<SidebarContent>
				<ScrollArea className="h-full w-full scroll-shadow">
					<div className="relative h-full">
						<NavGroup menu={mainMenuData.mainMenu} />
					</div>
				</ScrollArea>
			</SidebarContent>
			<SidebarFooter>
				<NavUser />
			</SidebarFooter>
		</Sidebar>
	)
}
