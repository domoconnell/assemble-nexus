import { auth } from "@/utils/auth/auth.js";
import { toNextJsHandler } from "better-auth/next-js";

export const { POST, GET, DELETE } = toNextJsHandler(auth);