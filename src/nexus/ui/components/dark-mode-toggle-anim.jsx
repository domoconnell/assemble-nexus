"use client";

import { useAppContext } from "@/nexus/context/app-context";
import { useState, useEffect } from "react";

export default function DarkModeToggleAnim({ use, displayOnly = false }) {
    const { state, ui } = useAppContext();
    const [cxPosition, setCxPosition] = useState(150);

    const isDarkMode = state?.prefs.darkMode ?? false; // Default to `false` if state is null

    // Ensure `useEffect` is always called
    useEffect(() => {
        if (state) {
            setCxPosition(isDarkMode ? 80 : 150);
        }
    }, [isDarkMode, state]);

    // Return `null` after hooks have been called if state is unavailable
    if (!state) return null;

    return (
        <div
            className={`
        ${use !== "icon" ? "w-10" : ""}
        ${use !== "icon" && isDarkMode ? "scale-100 rotate-0" : ""}
        ${use !== "icon" && !isDarkMode ? "scale-75 rotate-90" : ""}
        ${use === "icon" && isDarkMode ? "scale-75 rotate-0 -translate-x-1" : ""}
        ${use === "icon" && !isDarkMode ? "scale-50 rotate-90 -translate-x-1" : ""}
        h-10 
        relative 
        flex 
        items-center 
        justify-center 
        cursor-pointer 
        transition-all 
        duration-1000`}
            onClick={() => {
                if (!displayOnly) ui.toggleDarkMode();
            }}
        >
            <svg
                viewBox="0 0 100 100"
                xmlns="http://www.w3.org/2000/svg"
                className="h-6 w-6"
            >
                <defs>
                    <mask id="crescent-mask">
                        <rect x="0" y="0" width="100" height="100" fill="white" />
                        <circle
                            cx={cxPosition}
                            cy="30"
                            r="45"
                            fill="black"
                            style={{
                                transition: "cx 0.5s ease-in-out",
                            }}
                        />
                    </mask>
                </defs>

                <circle
                    cx="50"
                    cy="50"
                    r="40"
                    fill={isDarkMode ? "#374151" : "#00A6F4"}
                    mask="url(#crescent-mask)"
                />
            </svg>

            {/* Rays */}
            {[...Array(8)].map((_, index) => (
                <div
                    key={index}
                    className={`h-1 rounded-full absolute transition-all duration-1000 ${isDarkMode ? "opacity-0" : "opacity-100"
                        }`}
                    style={{
                        transform: `rotate(${index * 45}deg) translate(15px) scale(${isDarkMode ? 0 : 1
                            })`,
                        width: index % 2 === 0 ? "0.4rem" : "0.5rem",
                        backgroundColor: isDarkMode ? "#374151" : "#00A6F4",
                    }}
                ></div>
            ))}
        </div>
    );
}