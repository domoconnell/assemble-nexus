"use client";
import { useAuth } from "@/nexus/context/auth-context";

export default function HomePage() {
	const { user } = useAuth();

	return (
		<main className="flex flex-1 items-center justify-center p-8">
			<div className="text-center space-y-2">
				<h1 className="text-2xl font-semibold">Welcome{user?.first_name ? `, ${user.first_name}` : ""}</h1>
				<p className="text-muted-foreground">Nexus is ready.</p>
			</div>
		</main>
	);
}