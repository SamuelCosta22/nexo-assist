import { redirect } from "next/navigation";
import { getSessionUser, homeFor } from "./_server/auth";

export default async function Home() {
  const user = await getSessionUser();
  redirect(user ? homeFor(user) : "/login");
}
