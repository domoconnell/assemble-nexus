import Image from "next/image";
import Link from "next/link";

const heightClasses = {
	sm: "h-8",
	md: "h-10",
	lg: "h-14",
	xl: "h-20",
};

const variantSrc = {
	white: "/assembly-rooms-white.png",
	black: "/assembly-rooms-black.png",
};

export function Logo({
	href = "/",
	size = "md",
	variant = "white",
	className = "",
	priority = false,
}) {
	const heightClass = heightClasses[size] ?? heightClasses.md;
	const src = variantSrc[variant] ?? variantSrc.white;

	const img = (
		<Image
			src={src}
			alt="The Assembly Rooms"
			width={640}
			height={305}
			className={`${heightClass} w-auto ${className}`}
			priority={priority}
		/>
	);

	if (!href) return img;

	return (
		<Link href={href} aria-label="The Assembly Rooms — home" className="inline-flex items-center">
			{img}
		</Link>
	);
}
