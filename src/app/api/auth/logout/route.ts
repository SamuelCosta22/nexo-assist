import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/infrastructure/auth/session";
import { json, respond } from "../../../_server/http";

export function POST() {
  return respond(async () => {
    (await cookies()).delete(SESSION_COOKIE);
    return json({ ok: true });
  });
}
