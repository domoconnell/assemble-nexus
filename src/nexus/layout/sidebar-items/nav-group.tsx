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
	badge_key?: string
}

type NavSubSection = {
	section: string
	items: NavSubItem[]
}

type NavItem = {
	title: string
	url: string
	icon?: string
	isActive?: boolean
	minUserLevel?: number
	badge_key?: string
	items?: NavSubItem[]
	sections?: NavSubSection[]
}

type NavGroupProps = {
	label: string
	items: NavItem[]
}

function Badge({ count }: { count: number }) {
	if (!count) return null
	return (
		<span className="ml-auto inline-flex items-center justify-center min-w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-medium px-1.5">
			{count > 99 ? "99+" : count}
		</span>
	)
}

export function NavGroup({
	menu,
	counts = {},
}: {
	menu: NavGroupProps
	counts?: Record<string, number>
}) {
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
					const visibleSections = item.sections
						?.map((sec) => ({
							section: sec.section,
							items: sec.items.filter(
								(sub) => !sub.minUserLevel || userLevel >= sub.minUserLevel
							),
						}))
						.filter((sec) => sec.items.length > 0)
					const hasSubmenu =
						(visibleSubItems && visibleSubItems.length > 0) ||
						(visibleSections && visibleSections.length > 0)
					return (
						<React.Fragment key={item.title}>
							{hasSubmenu ? (
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
												{visibleSections && visibleSections.length > 0
													? visibleSections.map((sec, secIdx) => (
														<React.Fragment key={sec.section}>
															<li className={`px-2 ${secIdx === 0 ? "pt-1" : "pt-2"} pb-0.5 text-[10px] uppercase tracking-[0.18em] text-muted-foreground`}>
																{sec.section}
															</li>
															{sec.items.map((subItem) => (
																<SidebarMenuSubItem key={subItem.title}>
																	<SidebarMenuSubButton asChild>
																		<Link href={subItem.url} prefetch={false} className="ml-4 w-full flex items-center gap-4">
																			<span className="text-nowrap">{subItem.title}</span>
																			{subItem.badge_key && (
																				<Badge count={counts[subItem.badge_key] ?? 0} />
																			)}
																		</Link>
																	</SidebarMenuSubButton>
																</SidebarMenuSubItem>
															))}
														</React.Fragment>
													))
													: visibleSubItems?.map((subItem) => (
														<SidebarMenuSubItem key={subItem.title}>
															<SidebarMenuSubButton asChild>
																<Link href={subItem.url} prefetch={false} className="ml-4 w-full flex items-center gap-4">
																	<span className="text-nowrap">{subItem.title}</span>
																	{subItem.badge_key && (
																		<Badge count={counts[subItem.badge_key] ?? 0} />
																	)}
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
											{item.badge_key && <Badge count={counts[item.badge_key] ?? 0} />}
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
