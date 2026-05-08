"use client";

import { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react";
import { authClient } from "@/utils/auth/auth-client";

const AuthContext = createContext(null);

export function AuthProvider({ children, initialSession = null }) {
    const [session, setSession] = useState(initialSession);
    const [profile, setProfile] = useState(null);
    const [isLoading, setIsLoading] = useState(!initialSession);
    const [isHydratingProfile, setIsHydratingProfile] = useState(false);

    const user = useMemo(() => {
        const base = session?.user ?? null;
        if (!base) return null;
        return { ...base, ...(profile ?? {}) };
    }, [session, profile]);


    const silentlyRefreshAndReturnProfile = useCallback(async () => {
        try {
            const { data, error } = await authClient.getSession();
            if (error || !data) {
                setSession(null);
                setProfile(null);
                return null;
            }
            setSession(data);
            const res = await fetch("/api/me", {
                method: "GET",
                credentials: "include",
                headers: { "Accept": "application/json" },
            });
            if (!res.ok) {
                setProfile(null);
                return null;
            }
            const dataProfile = await res.json();
            if (!dataProfile || !dataProfile.id) {
                setProfile(null);
                return null;
            }
            setProfile(dataProfile);
            return dataProfile;
        } catch {
            setSession(null);
            setProfile(null);
            return null;
        }
    }, []);

    const fetchProfile = useCallback(async () => {
        if (!session?.user?.id) {
            setProfile(null);
            return;
        }

        setIsHydratingProfile(true);
        try {
            const res = await fetch("/api/me", {
                method: "GET",
                credentials: "include",
                headers: { "Accept": "application/json" },
            });

            if (!res.ok) {
                console.log("failed to fetch profile");
                setProfile(null);
                return;
            }

            const data = await res.json();

            if (!data || !data.id) {
                setProfile(null);
                return;
            }

            setProfile(data);
        } catch {
            setProfile(null);
        } finally {
            setIsHydratingProfile(false);
        }
    }, [session?.user?.id]);

    const refresh = useCallback(async ({ silent = false } = {}) => {
        if (!silent) setIsLoading(true);
        try {
            const { data, error } = await authClient.getSession();
            if (error) {
                setSession(null);
                setProfile(null);
            } else {
                setSession(data ?? null);
            }
        } finally {
            if (!silent) setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!initialSession) refresh();
    }, [initialSession, refresh]);

    useEffect(() => {
        if (!session?.user?.id) {
            setProfile(null);
            return;
        }
        fetchProfile();
    }, [session?.user?.id, fetchProfile]);

    useEffect(() => {
        const onFocus = () => refresh({ silent: true });
        window.addEventListener("focus", onFocus);
        return () => window.removeEventListener("focus", onFocus);
    }, [refresh]);

    const value = useMemo(
        () => ({
            session,
            user,
            profile,
            isLoading,
            isHydratingProfile,
            setSession,
            refresh,
            refreshProfile: fetchProfile,
            silentlyRefreshAndReturnProfile
        }),
        [session, user, profile, isLoading, isHydratingProfile, refresh, fetchProfile],
    );

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error("useAuth must be used within <AuthProvider />");
    return ctx;
}