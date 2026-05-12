"use client"

import {
	LogOutIcon,
	MoreVerticalIcon,
	UserCircleIcon,
} from "lucide-react"

import { UserAvatar } from "@/nexus/components/user-avatar"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/shadcn/components/ui/dropdown-menu"
import {
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	useSidebar,
} from "@/shadcn/components/ui/sidebar"

import { useAuth } from "@/nexus/context/auth-context";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAppContext } from "@/nexus/context/app-context";
import LoadingSpinner from "@/global/ui/components/loading-spinner";



export function NavUser() {
	const [loggingOut, setLoggingOut] = useState(false);
	const { isMobile } = useSidebar()
	const { user } = useAuth();
	const { events } = useAppContext();
	const router = useRouter();

	const LogOut = async () => {
		setLoggingOut(true);
		events.emit("logout");
	}
	const NavTo = (url: string) => {
		router.replace(url)
	};

	return (
		<SidebarMenu>
			<SidebarMenuItem>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<SidebarMenuButton
							size="lg"
							className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
						>
							<UserAvatar user={user} className="h-8 w-8 rounded-lg" />
							<div className="grid flex-1 text-left text-sm leading-tight">
								<span className="truncate font-medium">{user.first_name} {user.last_name}</span>
								<span className="truncate text-xs text-muted-foreground">
									{user.email}
								</span>
							</div>
							<MoreVerticalIcon className="ml-auto size-4" />
						</SidebarMenuButton>
					</DropdownMenuTrigger>
					<DropdownMenuContent
						className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
						side={isMobile ? "bottom" : "right"}
						align="end"
						sideOffset={4}
					>
						<DropdownMenuLabel className="p-0 font-normal">
							<div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
								<UserAvatar user={user} className="h-8 w-8 rounded-lg" />
								<div className="grid flex-1 text-left text-sm leading-tight">
									<span className="truncate font-medium">{user.first_name} {user.last_name}</span>
									<span className="truncate text-xs text-muted-foreground">
										{user.email}
									</span>
								</div>
							</div>
						</DropdownMenuLabel>
						<DropdownMenuSeparator />
						<DropdownMenuGroup>
							<DropdownMenuItem className="cursor-pointer" onClick={() => NavTo("/admin/account")}>
								<UserCircleIcon />
								Account
							</DropdownMenuItem>
						</DropdownMenuGroup>
						<DropdownMenuSeparator />
						<DropdownMenuItem onClick={(e) => { e.preventDefault(); LogOut() }} className="cursor-pointer">
							{loggingOut ?
								<LoadingSpinner vsmall />
							: (
								<LogOutIcon />
							)}
							Log Out
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</SidebarMenuItem>
		</SidebarMenu>
	)
}
