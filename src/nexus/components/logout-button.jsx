"use client";

import { useRouter } from "next/navigation";
import { authClient } from "@/utils/auth/auth-client";
import { Button } from "@/shadcn/components/ui/button";
import { useState } from "react";
import LoadingSpinner from "@/global/ui/components/loading-spinner";

export function LogoutButton() {
    const [disabled, setDisabled] = useState(false);
    const [loading, setLoading] = useState(false);
    const router = useRouter();

    async function logout() {
        setDisabled(true);
        setLoading(true);
        await authClient.signOut();
        router.replace("/auth/login");
    }

    return (
        <Button variant="ghost" onClick={logout} className="w-20" disabled={disabled}>
            {loading ? 
                <LoadingSpinner small />
            :
                "Logout"
            }
        </Button>
    );
}