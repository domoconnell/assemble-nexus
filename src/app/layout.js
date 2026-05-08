import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AppContextProvider } from "../nexus/context/app-context.jsx";
import { BrowserContextProvider } from "../nexus/context/browser-context";

const geistSans = Geist({
	variable: "--font-geist-sans",
	subsets: ["latin"],
});

const geistMono = Geist_Mono({
	variable: "--font-geist-mono",
	subsets: ["latin"],
});

export const metadata = {
	title: "Nexus",
	description: "Nexus",
};

export default function RootLayout({ children }) {
	return (
		<html lang="en">
			<body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
				<AppContextProvider>
					<BrowserContextProvider>
						{children}
					</BrowserContextProvider>
				</AppContextProvider>
			</body>
		</html>
	);
}
