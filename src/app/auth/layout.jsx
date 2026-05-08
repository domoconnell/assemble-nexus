import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/utils/auth/auth.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function headersToObject(h) {
    const obj = {};
    h.forEach((value, key) => {
        obj[key] = value;
    });
    return obj;
}

export default async function AuthLayout({ children }) {
    const h = await headers();

    const session = await auth.api.getSession({
        headers: headersToObject(h),
    });

    if (session?.user) {
        redirect("/");
    }

    return children;
}