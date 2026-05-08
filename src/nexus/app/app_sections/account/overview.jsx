"use client";
import React, { useEffect, useState } from "react";
import { useAuth } from "@/nexus/context/auth-context";
import { Button } from "@/shadcn/components/ui/button";
import { Input } from "@/shadcn/components/ui/input";
import { Label } from "@/shadcn/components/ui/label";
import { Badge } from "@/shadcn/components/ui/badge";
import { Separator } from "@/shadcn/components/ui/separator";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { byPrefixAndName } from "@awesome.me/kit-71c392801a/icons";
import { UserAvatar } from "@/nexus/components/user-avatar";

function formatDate(date) {
    if (!date) return "—";
    return new Intl.DateTimeFormat("en-GB", { dateStyle: "long" }).format(new Date(date));
}

function Row({ label, value, empty = "—" }) {
    return (
        <div className="flex items-center justify-between py-3">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="text-right font-medium">
                {value !== null && value !== undefined && value !== ""
                    ? value
                    : <span className="text-muted-foreground font-normal">{empty}</span>}
            </dd>
        </div>
    );
}

export default function MyAccount_Overview() {
    const { user, refreshProfile } = useAuth();

    const [editing, setEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({ first_name: "", last_name: "", mobile_number: "" });

    useEffect(() => {
        if (user) {
            setForm({
                first_name: user.first_name ?? "",
                last_name: user.last_name ?? "",
                mobile_number: user.mobile_number ?? "",
            });
        }
    }, [user]);

    function handleCancel() {
        setForm({
            first_name: user?.first_name ?? "",
            last_name: user?.last_name ?? "",
            mobile_number: user?.mobile_number ?? "",
        });
        setEditing(false);
    }

    async function handleSave() {
        setSaving(true);
        await fetch("/api/me", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
                first_name: form.first_name.trim(),
                last_name: form.last_name.trim(),
                mobile_number: form.mobile_number.trim() || null,
            }),
        });
        setSaving(false);
        setEditing(false);
        refreshProfile();
    }

    const fullName = [user?.first_name, user?.last_name].filter(Boolean).join(" ") || "—";

    return (
        <div className="flex justify-center py-8 px-4">
            <div className="w-full max-w-6xl space-y-8">

                {/* Profile header */}
                <div className="flex items-center gap-4">
                    <UserAvatar user={user} className="h-16 w-16" />
                    <div>
                        <p className="text-lg font-semibold leading-tight">{fullName}</p>
                        <p className="text-sm text-muted-foreground">{user?.email ?? "—"}</p>
                    </div>
                </div>

                <Separator />

                {/* Personal details */}
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-base font-semibold">Personal Details</h2>
                            <p className="text-sm text-muted-foreground">Your name and contact information.</p>
                        </div>
                        {!editing && (
                            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                                <FontAwesomeIcon icon={byPrefixAndName.fas["pen"]} className="mr-2 h-3 w-3" />
                                Edit
                            </Button>
                        )}
                    </div>

                    {editing ? (
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <Label htmlFor="first_name">First Name</Label>
                                    <Input
                                        id="first_name"
                                        value={form.first_name}
                                        onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))}
                                        disabled={saving}
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="last_name">Last Name</Label>
                                    <Input
                                        id="last_name"
                                        value={form.last_name}
                                        onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))}
                                        disabled={saving}
                                    />
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="mobile_number">Mobile Number</Label>
                                <Input
                                    id="mobile_number"
                                    type="tel"
                                    placeholder="e.g. +44 7700 900000"
                                    value={form.mobile_number}
                                    onChange={(e) => setForm((f) => ({ ...f, mobile_number: e.target.value }))}
                                    disabled={saving}
                                />
                            </div>
                            <div className="flex gap-2">
                                <Button
                                    size="sm"
                                    onClick={handleSave}
                                    disabled={saving || !form.first_name.trim() || !form.last_name.trim()}
                                >
                                    {saving && (
                                        <FontAwesomeIcon
                                            icon={byPrefixAndName.fas["spinner"]}
                                            className="animate-spin mr-2"
                                        />
                                    )}
                                    Save Changes
                                </Button>
                                <Button variant="outline" size="sm" onClick={handleCancel} disabled={saving}>
                                    Cancel
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <dl className="divide-y text-sm">
                            <Row label="First Name" value={user?.first_name} />
                            <Row label="Last Name" value={user?.last_name} />
                            <Row label="Mobile" value={user?.mobile_number} empty="Not set" />
                        </dl>
                    )}
                </div>

                <Separator />

                {/* Account info — read-only */}
                <div className="space-y-4">
                    <div>
                        <h2 className="text-base font-semibold">Account Information</h2>
                        <p className="text-sm text-muted-foreground">Read-only details about your account.</p>
                    </div>
                    <dl className="divide-y text-sm">
                        <Row
                            label="Email"
                            value={
                                <span className="flex items-center gap-2">
                                    {user?.email ?? "—"}
                                    {user?.emailVerified
                                        ? <Badge variant="secondary" className="text-xs">Verified</Badge>
                                        : <Badge variant="destructive" className="text-xs">Unverified</Badge>}
                                </span>
                            }
                        />
                        <Row label="Access Level" value={user?.level ?? "—"} />
                        <Row label="Member Since" value={formatDate(user?.createdAt)} />
                        <Row
                            label="User ID"
                            value={
                                <span className="font-mono text-xs text-muted-foreground">
                                    {user?.id ?? "—"}
                                </span>
                            }
                        />
                    </dl>
                </div>

            </div>
        </div>
    );
}
