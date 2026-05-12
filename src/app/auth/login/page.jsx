import { redirect } from "next/navigation";
import LoginForm from "@/nexus/app/auth/login_form";
import { LayeredWavesBackground } from "@/nexus/app/graphic/wavy_background";
import { Logo } from "@/site/ui/logo";
import { getServerSession } from "@/utils/auth/server-guard";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
	const session = await getServerSession();
	if (session?.user) redirect("/auth/post-login");
	return (
		<main className="grid min-h-svh lg:grid-cols-2">
            <div className="flex flex-col gap-4 p-6 md:p-10">
                <div className="flex justify-center md:justify-start">
                    <Logo size="md" priority />
                </div>
                <div className="flex flex-1 items-center justify-center">
                    <div className="w-full max-w-xs">
                        <LoginForm />
                    </div>
                </div>
            </div>
            <div className="bg-muted relative hidden lg:block">
                <LayeredWavesBackground />
            </div>
		</main>
	);
}