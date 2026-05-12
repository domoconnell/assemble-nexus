import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/utils/auth/auth.js";
import { AuthProvider } from "@/nexus/context/auth-context";
import ApplicationLayout from "@/nexus/layout/application_layout";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function ProtectedLayout({ children }) {
    const h = await headers();

    const session = await auth.api.getSession({
        headers: h,
    });

    if (!session?.user) {
        redirect("/auth/login?callbackURL=/admin");
    }

    return (
        <AuthProvider initialSession={session}>
            <ApplicationLayout>{children}</ApplicationLayout>
        </AuthProvider>
    );
}