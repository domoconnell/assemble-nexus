import LoginForm from "@/nexus/app/auth/login_form";
import { LayeredWavesBackground } from "@/nexus/app/graphic/wavy_background";

export default async function LoginPage() {
	return (
		<main className="grid min-h-svh lg:grid-cols-2">
            <div className="flex flex-col gap-4 p-6 md:p-10">
                <div className="flex justify-center gap-2 md:justify-start">
                    <span className="flex items-center gap-2 font-medium">
                        Nexus
                    </span>
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