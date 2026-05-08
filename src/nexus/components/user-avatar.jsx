"use client";

import { cn } from "@/shadcn/lib/utils";

export function UserAvatar({ user, className }) {
    const initials = [user?.first_name?.[0], user?.last_name?.[0]]
        .filter(Boolean)
        .join("")
        .toUpperCase();

    return (
        <div
            className={cn(
                "@container relative shrink-0 overflow-hidden rounded-full bg-muted",
                className,
            )}
        >
            <div className="flex h-full w-full items-center justify-center">
                <span className="select-none font-semibold leading-none text-muted-foreground text-[35cqi]">
                    {initials}
                </span>
            </div>
        </div>
    );
}
