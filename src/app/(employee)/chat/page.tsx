import { ChatView } from "@/ui/chat/ChatView";
import { modelChoices } from "../../_server/models";
import { requirePageUser } from "../../_server/auth";
import { toUserDto } from "../../_server/dto";

export const metadata = { title: "Atendimento · Nexo Assist" };

/** Empty state: the conversation is created with the first message. */
export default async function NewConversationPage() {
  const user = await requirePageUser("employee");
  return <ChatView key="new" user={toUserDto(user)} models={modelChoices()} />;
}
