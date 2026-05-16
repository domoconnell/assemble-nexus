import Link from "next/link";
import { Button } from "@/shadcn/components/ui/button";
import { Badge } from "@/shadcn/components/ui/badge";
import { listRoomsForAdmin } from "@/db/queries/rooms";
import { requireCurrentVenue } from "@/db/queries/venue";

export const dynamic = "force-dynamic";

export default async function AdminRoomsPage() {
	const venue = await requireCurrentVenue();
	const rooms = await listRoomsForAdmin(venue.id);

	return (
		<div className="mx-auto p-6 lg:p-10 max-w-6xl">
			<div className="flex items-center justify-between gap-4 mb-8">
				<div>
					<h1 className="text-2xl font-semibold">Rooms</h1>
					<p className="text-sm text-muted-foreground mt-1">
						Manage the rooms shown on the public site.
					</p>
				</div>
				<Button asChild>
					<Link href="/admin/rooms/new">New room</Link>
				</Button>
			</div>

			<div className="rounded-lg border bg-card">
				<table className="w-full">
					<thead>
						<tr className="border-b text-left text-xs uppercase tracking-[0.18em] text-muted-foreground">
							<th className="px-4 py-3 font-medium">Name</th>
							<th className="px-4 py-3 font-medium">Slug</th>
							<th className="px-4 py-3 font-medium">Capacities</th>
							<th className="px-4 py-3 font-medium">Status</th>
							<th className="px-4 py-3"></th>
						</tr>
					</thead>
					<tbody>
						{rooms.length === 0 && (
							<tr>
								<td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">
									No rooms yet. Create your first one.
								</td>
							</tr>
						)}
						{rooms.map((r) => (
							<tr key={r.id} className="border-b last:border-b-0 text-sm">
								<td className="px-4 py-3 font-medium">{r.name}</td>
								<td className="px-4 py-3 text-muted-foreground font-mono text-xs">
									{r.slug}
								</td>
								<td className="px-4 py-3 text-muted-foreground">
									{r.capacities?.length
										? r.capacities.map((c) => `${c.label} ${c.value}`).join(" · ")
										: "-"}
								</td>
								<td className="px-4 py-3">
									{r.is_published ? (
										<Badge>Published</Badge>
									) : (
										<Badge variant="secondary">Draft</Badge>
									)}
								</td>
								<td className="px-4 py-3 text-right">
									<Button asChild variant="ghost" size="sm">
										<Link href={`/admin/rooms/${r.id}`}>Edit</Link>
									</Button>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</div>
	);
}
