import { ProfileView } from "@/ui/profile/ProfileView";
import { requirePageUser } from "../../_server/auth";
import { toUserDto } from "../../_server/dto";

export const metadata = { title: "Meu perfil · Nexo Assist" };

export default async function ProfilePage() {
  const user = await requirePageUser("employee");
  return <ProfileView user={toUserDto(user)} />;
}
