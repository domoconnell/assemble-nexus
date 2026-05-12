"use client"

import * as React from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { DayPicker } from "react-day-picker"

import { cn } from "@/shadcn/lib/utils"
import { buttonVariants } from "@/shadcn/components/ui/button"

function Calendar({
	className,
	classNames,
	showOutsideDays = true,
	...props
}: React.ComponentProps<typeof DayPicker>) {
	return (
		<DayPicker
			showOutsideDays={showOutsideDays}
			className={cn("p-3", className)}
			classNames={{
				months: "flex flex-col sm:flex-row gap-4",
				month: "space-y-4",
				month_caption: "flex justify-center pt-1 relative items-center w-full",
				caption_label: "text-sm font-medium",
				nav: "absolute inset-x-1 flex items-center justify-between",
				button_previous: cn(
					buttonVariants({ variant: "outline" }),
					"h-7 w-7 bg-transparent p-0 opacity-70 hover:opacity-100",
				),
				button_next: cn(
					buttonVariants({ variant: "outline" }),
					"h-7 w-7 bg-transparent p-0 opacity-70 hover:opacity-100",
				),
				month_grid: "w-full border-collapse",
				weekdays: "flex",
				weekday:
					"text-muted-foreground w-9 font-normal text-[0.8rem] text-center",
				week: "flex w-full mt-2",
				day: "relative h-9 w-9 p-0 text-center text-sm",
				day_button: cn(
					buttonVariants({ variant: "ghost" }),
					"h-9 w-9 p-0 font-normal aria-selected:opacity-100",
				),
				range_start: "rounded-l-md",
				range_end: "rounded-r-md",
				selected:
					"[&>button]:bg-primary [&>button]:text-primary-foreground [&>button:hover]:bg-primary [&>button:hover]:text-primary-foreground [&>button:focus]:bg-primary [&>button:focus]:text-primary-foreground",
				today:
					"[&>button]:bg-accent [&>button]:text-accent-foreground",
				outside: "text-muted-foreground opacity-50",
				disabled: "text-muted-foreground opacity-50 pointer-events-none",
				range_middle:
					"[&>button]:bg-accent [&>button]:text-accent-foreground rounded-none",
				hidden: "invisible",
				...classNames,
			}}
			components={{
				Chevron: ({ orientation, ...iconProps }) =>
					orientation === "left" ? (
						<ChevronLeft className="h-4 w-4" {...iconProps} />
					) : (
						<ChevronRight className="h-4 w-4" {...iconProps} />
					),
			}}
			{...props}
		/>
	)
}

Calendar.displayName = "Calendar"

export { Calendar }
