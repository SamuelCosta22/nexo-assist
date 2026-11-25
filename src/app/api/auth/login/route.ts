import { cookies } from "next/headers";
import { z } from "zod";
import { SESSION_COOKIE, sessionLifetime, signSession } from "@/infrastructure/auth/session";
import { getContainer } from "@/infrastructure/container";
import { errorResponse, json, respond } from "../../../_server/http";
import { homeFor } from "../../../_server/auth";
import { toUserDto } from "../../../_server/dto";

const body = z.object({
  email: z.string().min(1).max(200),
  password: z.string().min(1).max(200),
  remember: z.boolean().default(false),
});

export function POST(request: Request) {
  return respond(async () => {
    const input = body.parse(await request.json());
    const container = getContainer();
    const result = await container.authenticate.execute(input);
    if (!result.ok) return errorResponse(result.error);

    const token = await signSession(result.value.id, container.env.SESSION_SECRET, input.remember);
    (await cookies()).set(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: sessionLifetime(input.remember),
    });
    return json({ user: toUserDto(result.value), redirectTo: homeFor(result.value) });
  });
}
