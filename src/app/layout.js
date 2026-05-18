import { Geist, Geist_Mono, Fraunces, Caveat } from "next/font/google";
import "./globals.css";
import { AppContextProvider } from "../nexus/context/app-context.jsx";
import { BrowserContextProvider } from "../nexus/context/browser-context";
import { Toaster } from "@/shadcn/components/ui/sonner";

const geistSans = Geist({
	variable: "--font-geist-sans",
	subsets: ["latin"],
});

const geistMono = Geist_Mono({
	variable: "--font-geist-mono",
	subsets: ["latin"],
});

const fraunces = Fraunces({
	variable: "--font-fraunces",
	subsets: ["latin"],
	weight: ["400", "500", "600", "700"],
	style: ["normal", "italic"],
	display: "swap",
});

const caveat = Caveat({
	variable: "--font-caveat",
	subsets: ["latin"],
	weight: ["500", "600", "700"],
	display: "swap",
});

export const metadata = {
	title: "The Assembly Rooms",
	description: "A music venue and corporate hire space at the heart of Assemble Church.",
};

export default function RootLayout({ children }) {
	return (
		<html lang="en">
			<body className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} ${caveat.variable} antialiased`}>
				<AppContextProvider>
					<BrowserContextProvider>
						{children}
						<Toaster richColors position="top-center" />
					</BrowserContextProvider>
				</AppContextProvider>
			</body>
		</html>
	);
}
