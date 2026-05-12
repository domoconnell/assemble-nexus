import { redirect } from "next/navigation";
import { getServerSession } from "@/utils/auth/server-guard";
import { getUserAccess } from "@/utils/auth/rbac";

export const dynamic = "force-dynamic";

export default async function PostLoginPage() {
	const session = await getServerSession();
	if (!session?.user) redirect("/auth/login");

	const { roles } = await getUserAccess(session.user.id);

	if (roles.includes("admin") || roles.includes("staff")) redirect("/admin");
	if (roles.includes("hirer")) redirect("/my-bookings");
	if (roles.includes("delegate")) redirect("/my-tickets");

	redirect("/");
}
