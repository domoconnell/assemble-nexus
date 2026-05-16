"use client";
import React, { useEffect, useRef, useState } from "react";
import { authClient } from "@/utils/auth/auth-client";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/shadcn/components/ui/table";
import { Button } from "@/shadcn/components/ui/button";
import { Badge } from "@/shadcn/components/ui/badge";
import { Input } from "@/shadcn/components/ui/input";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/shadcn/components/ui/alert-dialog";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { byPrefixAndName } from "@awesome.me/kit-71c392801a/icons";
import LoadingSpinner from "@/global/ui/components/loading-spinner";

const ENV_TAG = process.env.NODE_ENV === "production" ? "PROD" : "DEV";
const SESSION_MAX_AGE_MS = 15 * 60 * 1000; // 15 minutes

const METHOD_CONFIG = {
    passkey: {
        label: "Passkey",
        icon: () => byPrefixAndName.fas["fingerprint"],
    },
    credential: {
        label: "Password",
        icon: () => byPrefixAndName.fas["lock"],
    },
    "magic-link": {
        label: "Magic Link",
        icon: () => byPrefixAndName.fas["envelope"],
    },
};

function parsePasskeyName(rawName) {
    if (!rawName) return { name: "Unnamed device", env: null };
    const match = rawName.match(/^(.*)\s\[(PROD|DEV)\]$/);
    if (match) return { name: match[1].trim() || "Unnamed device", env: match[2] };
    return { name: rawName, env: null };
}

function formatDate(date) {
    if (!date) return "-";
    return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(new Date(date));
}

export default function MyAccount_Authentication() {
    const [accounts, setAccounts] = useState([]);
    const [passkeys, setPasskeys] = useState([]);
    const [loading, setLoading] = useState(true);

    const [addDialogOpen, setAddDialogOpen] = useState(false);
    const [newPasskeyName, setNewPasskeyName] = useState("");
    const [adding, setAdding] = useState(false);

    const [pendingDelete, setPendingDelete] = useState(null);
    const [deleting, setDeleting] = useState(false);

    const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [passwordSaving, setPasswordSaving] = useState(false);
    const [passwordError, setPasswordError] = useState("");
    const [sessionTooOld, setSessionTooOld] = useState(false);

    const nameInputRef = useRef(null);

    useEffect(() => {
        fetchData();
    }, []);

    function isSessionRecent(session) {
        if (!session?.session?.createdAt) return false;
        const created = new Date(session.session.createdAt).getTime();
        return Date.now() - created < SESSION_MAX_AGE_MS;
    }

    async function fetchData() {
        setLoading(true);
        const [{ data: accountData }, { data: passkeyData }] = await Promise.all([
            authClient.$fetch("/list-accounts", { method: "GET" }),
            authClient.$fetch("/passkey/list-user-passkeys", { method: "GET" }),
        ]);
        setAccounts(accountData ?? []);
        setPasskeys(passkeyData ?? []);
        setLoading(false);
    }

    async function confirmAddPasskey() {
        if (!newPasskeyName.trim()) return;
        setAdding(true);
        const fullName = `${newPasskeyName.trim()} [${ENV_TAG}]`;
        const { error } = await authClient.passkey.addPasskey({
            name: fullName,
            authenticatorAttachment: "platform",
        });
        setAdding(false);
        if (!error) {
            setAddDialogOpen(false);
            setNewPasskeyName("");
            fetchData();
        }
    }

    async function openPasswordDialog() {
        setPasswordError("");
        setNewPassword("");
        setConfirmPassword("");
        setSessionTooOld(false);

        const { data: session } = await authClient.getSession();
        if (!isSessionRecent(session)) {
            setSessionTooOld(true);
            setPasswordDialogOpen(true);
            return;
        }
        setPasswordDialogOpen(true);
    }

    async function confirmSetPassword() {
        setPasswordError("");
        if (newPassword.length < 8) {
            setPasswordError("Password must be at least 8 characters.");
            return;
        }
        if (newPassword !== confirmPassword) {
            setPasswordError("Passwords do not match.");
            return;
        }
        setPasswordSaving(true);
        try {
            const res = await fetch("/api/auth/set-password", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ newPassword }),
            });
            const data = await res.json();
            setPasswordSaving(false);
            if (!res.ok) {
                setPasswordError(data.error || "Failed to set password.");
                return;
            }
        } catch {
            setPasswordSaving(false);
            setPasswordError("Failed to set password.");
            return;
        }
        setPasswordDialogOpen(false);
        setNewPassword("");
        setConfirmPassword("");
        fetchData();
    }

    async function confirmDelete() {
        if (!pendingDelete) return;
        setDeleting(true);
        if (pendingDelete.type === "passkey") {
            await authClient.$fetch("/passkey/delete-passkey", {
                method: "POST",
                body: { id: pendingDelete.rawId },
            });
        } else {
            await authClient.$fetch("/unlink-account", {
                method: "POST",
                body: { providerId: pendingDelete.type, accountId: pendingDelete.rawAccountId },
            });
        }
        setDeleting(false);
        setPendingDelete(null);
        fetchData();
    }

    const hasPassword = accounts.some((a) => a.providerId === "credential");

    const rows = [
        {
            id: "password",
            rawId: null,
            rawAccountId: null,
            type: "password",
            label: "Password",
            icon: METHOD_CONFIG.credential.icon(),
            detail: hasPassword ? "Password set" : "Not set",
            env: null,
            createdAt: null,
            isPasswordRow: true,
        },
        ...accounts
            .filter((a) => a.providerId !== "credential")
            .map((a) => ({
                id: `account-${a.id}`,
                rawId: a.id,
                rawAccountId: a.accountId,
                type: a.providerId,
                label: METHOD_CONFIG[a.providerId]?.label ?? a.providerId,
                icon: METHOD_CONFIG[a.providerId]?.icon(),
                detail: a.accountId,
                env: null,
                createdAt: a.createdAt,
            })),
        ...passkeys.map((p) => {
            const { name, env } = parsePasskeyName(p.name);
            return {
                id: `passkey-${p.id}`,
                rawId: p.id,
                rawAccountId: null,
                type: "passkey",
                label: "Passkey",
                icon: METHOD_CONFIG.passkey.icon(),
                detail: name,
                env,
                createdAt: p.createdAt,
            };
        }),
    ];

    return (
        <div className="flex justify-center py-8 px-4">
            <div className="w-full max-w-6xl space-y-6">
                <div>
                    <h2 className="text-lg font-semibold">Authentication Methods</h2>
                    <p className="text-sm text-muted-foreground mt-1">
                        Manage how you sign in to your account.
                    </p>
                </div>

                {loading ? (
                    <LoadingSpinner />
                ) : rows.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4">
                        No authentication methods found.
                    </p>
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-10" />
                                <TableHead>Method</TableHead>
                                <TableHead>Name / Detail</TableHead>
                                <TableHead>Environment</TableHead>
                                <TableHead>Added</TableHead>
                                <TableHead className="w-10" />
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {rows.map((row) => (
                                <TableRow key={row.id}>
                                    <TableCell>
                                        {row.icon && (
                                            <FontAwesomeIcon
                                                icon={row.icon}
                                                className="text-muted-foreground w-4 h-4"
                                            />
                                        )}
                                    </TableCell>
                                    <TableCell className="font-medium">{row.label}</TableCell>
                                    <TableCell className="text-muted-foreground">{row.detail}</TableCell>
                                    <TableCell>
                                        {row.env === "PROD" && <Badge>PROD</Badge>}
                                        {row.env === "DEV" && <Badge variant="secondary">DEV</Badge>}
                                    </TableCell>
                                    <TableCell className="text-muted-foreground">{formatDate(row.createdAt)}</TableCell>
                                    <TableCell>
                                        {row.isPasswordRow ? (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="text-muted-foreground"
                                                onClick={openPasswordDialog}
                                            >
                                                {hasPassword ? "Change" : "Set"}
                                            </Button>
                                        ) : (
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="text-muted-foreground hover:text-destructive"
                                                onClick={() => setPendingDelete(row)}
                                            >
                                                <FontAwesomeIcon icon={byPrefixAndName.fas["trash"]} className="w-4 h-4" />
                                            </Button>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}

                <div className="flex gap-2 pt-2">
                    <Button variant="outline" size="sm" onClick={() => setAddDialogOpen(true)}>
                        <FontAwesomeIcon icon={byPrefixAndName.fas["fingerprint"]} className="mr-2" />
                        Add Passkey
                    </Button>
                </div>
            </div>

            {/* Add passkey dialog */}
            <AlertDialog open={addDialogOpen} onOpenChange={(open) => { setAddDialogOpen(open); if (!open) setNewPasskeyName(""); }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Name your passkey</AlertDialogTitle>
                        <AlertDialogDescription>
                            Give this passkey a recognisable name, e.g. "MacBook Pro" or "iPhone".
                            It will be tagged as <strong>{ENV_TAG}</strong> automatically.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <Input
                        ref={nameInputRef}
                        placeholder="e.g. MacBook Pro"
                        value={newPasskeyName}
                        onChange={(e) => setNewPasskeyName(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && !adding && newPasskeyName.trim() && confirmAddPasskey()}
                        autoFocus
                    />
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => { setAddDialogOpen(false); setNewPasskeyName(""); }} disabled={adding}>
                            Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction onClick={confirmAddPasskey} disabled={adding || !newPasskeyName.trim()}>
                            {adding && <FontAwesomeIcon icon={byPrefixAndName.fas["spinner"]} className="animate-spin mr-2" />}
                            Add Passkey
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Set / change password dialog */}
            <AlertDialog open={passwordDialogOpen} onOpenChange={(open) => { if (!open) { setPasswordDialogOpen(false); setNewPassword(""); setConfirmPassword(""); setPasswordError(""); } }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{hasPassword ? "Change password" : "Set a password"}</AlertDialogTitle>
                        <AlertDialogDescription>
                            {sessionTooOld
                                ? "Your session is too old to change your password. Please log out and log back in using a magic link or passkey, then try again."
                                : `Enter your new password below. It must be at least 8 characters.`}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    {!sessionTooOld && (
                        <div className="flex flex-col gap-3">
                            <Input
                                type="password"
                                placeholder="New password"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                autoFocus
                            />
                            <Input
                                type="password"
                                placeholder="Confirm password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && !passwordSaving && newPassword && confirmPassword && confirmSetPassword()}
                            />
                            {passwordError && <p className="text-sm text-destructive">{passwordError}</p>}
                        </div>
                    )}
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={passwordSaving}>Cancel</AlertDialogCancel>
                        {!sessionTooOld && (
                            <AlertDialogAction onClick={confirmSetPassword} disabled={passwordSaving || !newPassword || !confirmPassword}>
                                {passwordSaving && <FontAwesomeIcon icon={byPrefixAndName.fas["spinner"]} className="animate-spin mr-2" />}
                                {hasPassword ? "Change Password" : "Set Password"}
                            </AlertDialogAction>
                        )}
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Delete confirmation dialog */}
            <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Remove {pendingDelete?.label}?</AlertDialogTitle>
                        <AlertDialogDescription>
                            {pendingDelete?.type === "passkey"
                                ? `"${pendingDelete?.detail}" will be removed. You won't be able to use this passkey to sign in.`
                                : `Your ${pendingDelete?.label} account will be unlinked. You won't be able to sign in with it.`}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setPendingDelete(null)} disabled={deleting}>
                            Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction onClick={confirmDelete} disabled={deleting}>
                            {deleting && <FontAwesomeIcon icon={byPrefixAndName.fas["spinner"]} className="animate-spin mr-2" />}
                            Remove
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
