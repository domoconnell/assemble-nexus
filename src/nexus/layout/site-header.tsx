"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import { Separator } from "@/shadcn/components/ui/separator"
import { SidebarTrigger } from "@/shadcn/components/ui/sidebar"


import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { byPrefixAndName } from "@awesome.me/kit-71c392801a/icons";
import { useTab } from "@/nexus/layout/site-header-items/tabs-provider";


import mainMenuData from "@/nexus/data/main-menu.json"

type MenuLeaf = { title: string; url: string }
type MenuItem = { title: string; url: string; icon?: string; items?: MenuLeaf[] }
type MenuGroup = { label: string; items: MenuItem[] }
type MenuJson = Record<string, MenuGroup>

type Crumb = { title: string; url: string; icon?: string }

function buildUrlIndex(menu: MenuJson) {
	const index = new Map<string, { title: string; parentUrl?: string; icon?: string }>()
	const normalise = (p: string) => (p.length > 1 ? p.replace(/\/+$/, "") : p)

	Object.values(menu).forEach((group) => {
		group.items.forEach((item) => {
			const u = normalise(item.url)
			index.set(u, { title: item.title, icon: item.icon })

			item.items?.forEach((sub) => {
				const su = normalise(sub.url)
				index.set(su, { title: sub.title, parentUrl: u, icon: item.icon })
			})
		})
	})

	return { index, normalise }
}

function findBestMatch(
	pathname: string,
	index: Map<string, any>,
	normalise: (p: string) => string
) {
	const p = normalise(pathname)
	if (index.has(p)) return p

	const parts = p.split("/").filter(Boolean)
	for (let i = parts.length - 1; i > 0; i--) {
		const candidate = normalise("/" + parts.slice(0, i).join("/"))
		if (index.has(candidate)) return candidate
	}
	return null
}

function buildCrumbs(matchedUrl: string, index: Map<string, { title: string; parentUrl?: string; icon?: string }>) {
	const crumbs: Crumb[] = []
	let cur: string | undefined = matchedUrl

	while (cur) {
		const node = index.get(cur)
		if (!node) break
		crumbs.unshift({ title: node.title, url: cur, icon: node.icon })
		cur = node.parentUrl
	}

	

	return crumbs
}



export function SiteHeader() {
	const pathname = usePathname()
	const menu = mainMenuData as unknown as MenuJson

	const { index, normalise } = buildUrlIndex(menu)
	const matched = findBestMatch(pathname, index, normalise)
	const crumbs = matched ? buildCrumbs(matched, index) : []

	const { tabContent } = useTab()

	return (
		<header className="group-has-data-[collapsible=icon]/sidebar-wrapper:h-12 flex h-12 shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear">
			<div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6 justify-between">
				<div className="hidden">
					<SidebarTrigger className="-ml-1" />
					<Separator orientation="vertical" className="mx-2 data-[orientation=vertical]:h-4" />
				</div>

				<nav aria-label="Breadcrumb" className="flex items-center gap-1 text-sm">
					{crumbs.map((c, i) => {
						const isLast = i === crumbs.length - 1
						const isFirst = i === 0
						return (
							<span key={c.url} className="flex items-center gap-1">
								{i > 0 && <span className="text-muted-foreground">/</span>}
								{isFirst && <FontAwesomeIcon icon={byPrefixAndName.fas[c.icon]} />}

								{isLast ? (
									<span className="font-medium">{c.title}</span>
								) : (
									/*
									could link here, but not usually actually a page, so just render as text for now
									<Link href={c.url} className="text-muted-foreground hover:text-foreground transition-colors">
										{c.title}
									</Link>
									*/
									<span className="text-muted-foreground">{c.title}</span>
								)}
							</span>
						)
					})}
				</nav>
				<div>{tabContent}</div>
			</div>
		</header>
	)
}