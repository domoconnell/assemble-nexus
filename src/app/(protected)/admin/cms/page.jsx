import { notFound } from "next/navigation";
import Link from "next/link";
import { requireCurrentVenue } from "@/db/queries/venue";
import { getPageContent } from "@/db/queries/site-content";
import { PAGE_SCHEMAS, getPageSchema } from "@/site/content/page-schemas";
import CmsEditor from "./editor";

export const dynamic = "force-dynamic";

export const metadata = { title: "Website CMS - Nexus" };

export default async function CmsPage({ searchParams }) {
	const sp = await searchParams;
	const requestedPage = typeof sp?.page === "string" ? sp.page : null;
	const pageKey = requestedPage && PAGE_SCHEMAS[requestedPage] ? requestedPage : Object.keys(PAGE_SCHEMAS)[0];
	const schema = getPageSchema(pageKey);
	if (!schema) notFound();

	const venue = await requireCurrentVenue();
	const content = await getPageContent(venue.id, pageKey);

	const pageList = Object.entries(PAGE_SCHEMAS).map(([key, s]) => ({
		key,
		label: s.label,
		path: s.path,
	}));

	return (
		<div className="mx-auto p-6 lg:p-10 max-w-6xl">
			<div className="mb-8">
				<h1 className="text-2xl font-semibold">Website CMS</h1>
				<p className="mt-1 text-sm text-muted-foreground max-w-2xl">
					Editable copy and images for the public site. Empty fields fall back to
					the built-in defaults - leave anything blank to use the code's version.
				</p>
			</div>

			<div className="grid gap-8 lg:grid-cols-[220px_1fr]">
				<aside className="space-y-1">
					{pageList.map((p) => (
						<Link
							key={p.key}
							href={`/admin/cms?page=${p.key}`}
							className={`block rounded-md px-3 py-2 text-sm transition ${
								p.key === pageKey
									? "bg-primary text-primary-foreground"
									: "hover:bg-accent text-muted-foreground hover:text-foreground"
							}`}
						>
							<div className="font-medium">{p.label}</div>
							<div className="text-xs opacity-70 font-mono">{p.path}</div>
						</Link>
					))}
				</aside>

				<CmsEditor pageKey={pageKey} schema={schema} initialContent={content} />
			</div>
		</div>
	);
}
