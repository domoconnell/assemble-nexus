"use client"

import { ChevronRight, type LucideIcon } from "lucide-react"

import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/shadcn/components/ui/collapsible"
import {
	SidebarGroup,
	SidebarGroupLabel,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarMenuSub,
	SidebarMenuSubButton,
	SidebarMenuSubItem,
} from "@/shadcn/components/ui/sidebar"

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { byPrefixAndName } from "@awesome.me/kit-71c392801a/icons";
import React from "react";
import Link from "next/link";
import { useAuth } from "@/nexus/context/auth-context";

type NavSubItem = {
	title: string
	url: string
	minUserLevel?: number
}

type NavItem = {
	title: string
	url: string
	icon?: string
	isActive?: boolean
	minUserLevel?: number
	items?: NavSubItem[]
}

type NavGroupProps = {
	label: string
	items: NavItem[]
}

export function NavGroup({ menu }: { menu: NavGroupProps }) {
	const { label, items } = menu
	const { user } = useAuth()
	const userLevel = user?.level ?? 0

	const visibleItems = items.filter(
		(item) => !item.minUserLevel || userLevel >= item.minUserLevel
	)

	return (
		<SidebarGroup>
			<SidebarGroupLabel>{label}</SidebarGroupLabel>
			<SidebarMenu>
				{visibleItems.map((item) => {
					const visibleSubItems = item.items?.filter(
						(sub) => !sub.minUserLevel || userLevel >= sub.minUserLevel
					)
					return (
						<React.Fragment key={item.title}>
							{visibleSubItems && visibleSubItems.length > 0 ? (
								<Collapsible
									key={item.title}
									asChild
									defaultOpen={item.isActive}
									className="group/collapsible"
								>
									<SidebarMenuItem>
										<CollapsibleTrigger asChild>
											<SidebarMenuButton tooltip={item.title} className="gap-4">
												{item.icon && <span className="w-5 h-5 flex items-center justify-center"><FontAwesomeIcon icon={byPrefixAndName.fas[item.icon]} /></span>}
												<span className="text-nowrap">{item.title}</span>
												<ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
											</SidebarMenuButton>
										</CollapsibleTrigger>
										<CollapsibleContent>
											<SidebarMenuSub>
												{visibleSubItems.map((subItem) => (
													<SidebarMenuSubItem key={subItem.title}>
														<SidebarMenuSubButton asChild>
															<Link href={subItem.url} className="ml-4 w-full flex items-center gap-4">
																<span className="text-nowrap">{subItem.title}</span>
															</Link>
														</SidebarMenuSubButton>
													</SidebarMenuSubItem>
												))}
											</SidebarMenuSub>
										</CollapsibleContent>
									</SidebarMenuItem>
								</Collapsible>
							) : (
								<SidebarMenuItem key={item.title}>
									<SidebarMenuButton tooltip={item.title}>
										<Link href={item.url} className="w-full flex items-center gap-4">
											{item.icon && <span className="w-5 h-5 flex items-center justify-center"><FontAwesomeIcon icon={byPrefixAndName.fas[item.icon]} /></span>}
											<span className="text-nowrap">{item.title}</span>
										</Link>
									</SidebarMenuButton>
								</SidebarMenuItem>
							)}
						</React.Fragment>
					)
				})}
			</SidebarMenu>
		</SidebarGroup>
	)
}
