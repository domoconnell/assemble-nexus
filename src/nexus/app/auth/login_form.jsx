"use client";

import { useRef, useState, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/shadcn/components/ui/button";
import {
    Field,
    FieldGroup,
} from "@/shadcn/components/ui/field";
import {
    InputGroup,
    InputGroupAddon,
    InputGroupInput,
} from "@/shadcn/components/ui/input-group";
import { Input } from "@/shadcn/components/ui/input";
import Show from "@/global/ui/components/show";
import LoadingSpinner from "@/global/ui/components/loading-spinner";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { byPrefixAndName } from "@awesome.me/kit-71c392801a/icons";
import { authClient } from "@/utils/auth/auth-client";
import { useRouter } from "next/navigation";

function safeNextPath(nextParam) {
    if (!nextParam) return "/";
    if (typeof nextParam !== "string") return "/";
    if (!nextParam.startsWith("/")) return "/";
    if (nextParam.startsWith("//")) return "/";
    return nextParam;
}

export default function LoginForm(className, ...props) {
    const loginFormRef = useRef(null);
    const searchParams = useSearchParams();
    const router = useRouter();

    const nextPath = useMemo(() => {
        return safeNextPath(searchParams.get("next"));
    }, [searchParams]);

    const [formDisabled, setFormDisabled] = useState(false);
    const [showLoadingIcon, setShowLoadingIcon] = useState(false);
    const [showErrorMessage, setShowErrorMessage] = useState(false);
    const [showSuccessMessage, setShowSuccessMessage] = useState(false);
    const [showLoginButton, setShowLoginButton] = useState(true);

    const [showMagicLinkButton, setShowMagicLinkButton] = useState(false);
    const [showPasswordForm, setShowPasswordForm] = useState(false);
    const [passwordValue, setPasswordValue] = useState("");
    const [showPasskeyButton, setShowPasskeyButton] = useState(false);

    async function getLoginMethods() {
        const email = loginFormRef.current.querySelector("#email").value;

        setFormDisabled(true);
        setShowLoginButton(false);
        setShowLoadingIcon(true);
        setShowErrorMessage(false);

        const response = await fetch(
            `/api/auth/methods?email=${encodeURIComponent(email)}`,
            {
                method: "GET",
                headers: { "Content-Type": "application/json" },
            },
        );

        let error = false;
        let methods = {};
        if (response.ok) {
            const data = await response.json();
            if (!data.user) {
                error = "Not the one we were looking for.";
            } else {
                methods = data.methods;
            }
        } else {
            error = "Nope, didn't work.";
        }

        if (error) {
            setShowErrorMessage(error);
            setShowLoginButton(true);
            setShowLoadingIcon(false);
            setFormDisabled(false);
            return;
        } else {
            setShowLoadingIcon(false);
            if (methods.magicLink) setShowMagicLinkButton(true);
            if (methods.password) setShowPasswordForm(true);
            if (methods.passkey) setShowPasskeyButton(true)
        }
    }
    

    function isPasskeyCancelError(err) {
        const name = err?.name || err?.cause?.name;
        const msg = String(err?.message || err?.cause?.message || "");
        const code = err?.code || err?.cause?.code;
        return (
            name === "AbortError" ||
            name === "NotAllowedError" ||
            code === "AUTH_CANCELLED" ||
            msg.toLowerCase().includes("abort") ||
            msg.toLowerCase().includes("not allowed")
        );
    }


    function handleSpecificPasskeyError(error) {
        if (!isPasskeyCancelError(error)) {
            setShowErrorMessage(error.message || "Passkey sign-in failed.");
        }
    }


    async function signInWithPasskey() {
        setFormDisabled(true);
        setShowErrorMessage(false);
        setShowLoadingIcon(true);

        try {
            const email = loginFormRef.current.querySelector("#email").value;

            const { data, error } = await authClient.signIn.passkey({
                email,
                autoFill: false,
            });

            if (error) {
                handleSpecificPasskeyError(error);
                setFormDisabled(false);
                setShowLoadingIcon(false);
                return;
            }
            router.push(nextPath);
            router.refresh();
        } catch (err) {
            handleSpecificPasskeyError(err);
            setFormDisabled(false);
            setShowLoadingIcon(false);
        }
    }

    async function signInWithPassword() {
        const email = loginFormRef.current.querySelector("#email").value;
        setShowErrorMessage(false);
        setShowLoadingIcon(true);

        const { error } = await authClient.signIn.email({
            email,
            password: passwordValue,
        });

        setShowLoadingIcon(false);
        if (error) {
            setShowErrorMessage(error.message || "Incorrect password.");
            return;
        }
        router.push(nextPath);
        router.refresh();
    }

    async function sendMagicLink() {
        const email = loginFormRef.current.querySelector("#email").value;
        setFormDisabled(true);
        setShowErrorMessage(false);
        setShowLoadingIcon(true);
        setShowMagicLinkButton(false);

        const { data, error } = await authClient.signIn.magicLink({
            email,
            callbackURL: nextPath,
        });
        setShowLoadingIcon(false);
        if (error) {
            setShowMagicLinkButton(true);
            setShowErrorMessage(error.message);
            return;
        } else {
            setShowSuccessMessage("Magic link sent! Please check your email.");
        }

    }

    return (
        <div>
            <form
                className="w-full flex flex-col"
                {...props}
                onSubmit={(e) => {
                    e.preventDefault();
                    getLoginMethods();
                }}
                ref={loginFormRef}
            >
                <FieldGroup>
                    <div className="flex flex-col items-center gap-1 text-center">
                        <h1 className="text-2xl font-bold">Login to Nexus</h1>
                        <p className="text-muted-foreground text-sm text-balance">
                            Enter your email below to login to your account
                        </p>
                    </div>

                    <Field>
                        <InputGroup>
                            <InputGroupInput
                                id="email"
                                type="email"
                                autoComplete="username webauthn"
                                placeholder="you@example.com"
                                required
                                disabled={formDisabled}
                            />
                            <Show show={showLoadingIcon} effect="opacity">
                                <InputGroupAddon align="inline-end">
                                    <div className="flex size-6 items-center justify-center rounded-full">
                                        <LoadingSpinner small />
                                    </div>
                                </InputGroupAddon>
                            </Show>
                        </InputGroup>
                    </Field>

                    <Show show={showLoginButton} effect="reveal">
                        <Button type="submit" className="w-full" disabled={formDisabled}>
                            <FontAwesomeIcon icon={byPrefixAndName.fas["unlock"]} /> Login
                        </Button>
                    </Show>
                </FieldGroup>
            </form>

            <div className="flex flex-col gap-7 mt-7">
                <Show show={showErrorMessage} effect="reveal">
                    <span className="text-sm text-destructive">{showErrorMessage}</span>
                </Show>
                <Show show={showSuccessMessage} effect="reveal">
                    <span className="text-sm text-success">{showSuccessMessage}</span>
                </Show>

                <Show show={showPasswordForm} effect="reveal">
                    <form
                        className="flex flex-col gap-3"
                        onSubmit={(e) => {
                            e.preventDefault();
                            signInWithPassword();
                        }}
                    >
                        <Input
                            type="password"
                            placeholder="Password"
                            value={passwordValue}
                            onChange={(e) => setPasswordValue(e.target.value)}
                            autoFocus
                        />
                        <Button type="submit" className="w-full" disabled={!passwordValue}>
                            <FontAwesomeIcon icon={byPrefixAndName.fas["lock"]} /> Login With Password
                        </Button>
                        <p className="text-xs text-muted-foreground text-center">
                            Forgot your password? Use the <button type="button" className="underline hover:text-foreground" onClick={sendMagicLink}>Magic Link</button> option to log in and change it from your account settings.
                        </p>
                    </form>
                </Show>

                <Show show={showMagicLinkButton} effect="reveal">
                    <Button className="w-full" onClick={sendMagicLink}>
                        <FontAwesomeIcon icon={byPrefixAndName.fas["magic-wand-sparkles"]} />{" "}
                        Send Magic Link
                    </Button>
                </Show>

                <Show show={showPasskeyButton} effect="reveal">
                    <Button type="button" className="w-full" onClick={signInWithPasskey}>
                        <FontAwesomeIcon icon={byPrefixAndName.fas["fingerprint"]} /> Login
                        With Passkey
                    </Button>
                </Show>
            </div>
        </div>
    );
}