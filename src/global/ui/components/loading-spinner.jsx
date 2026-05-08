import React from "react";

export default function LoadingSpinner({
    dark = false,
    large = false,
    small = false,
    vsmall = false,
    fullH = false,
    className = "",
}) {
    const sizeClass = large ? "h-14 w-14 border-[4px]" : vsmall ? "h-4 w-4 border-2" : small ? "h-6 w-6 border-2" : "h-8 w-8 border-[3px]";
    const containerClass = fullH
        ? "absolute inset-0 flex items-center justify-center"
        : "flex items-center justify-center";

    const colourClass = dark
        ? "text-primary border-border/40 border-t-primary"
        : "text-primary border-border/50 border-t-primary";

    return (
        <div className={`${containerClass} ${className}`} role="status" aria-live="polite">
            <div
                className={[
                    "animate-spin rounded-full border-solid",
                    "bg-transparent",
                    sizeClass,
                    colourClass,
                ].join(" ")}
                aria-label="Loading"
            />
            <span className="sr-only">Loading</span>
        </div>
    );
}