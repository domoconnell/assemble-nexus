export function Container({ as: As = "div", className = "", children, ...props }) {
	return (
		<As
			className={`mx-auto w-full max-w-310 px-6 sm:px-8 lg:px-12 ${className}`}
			{...props}
		>
			{children}
		</As>
	);
}
