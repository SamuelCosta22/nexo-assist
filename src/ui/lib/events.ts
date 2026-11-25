/**
 * Tiny browser event bus: the chat tells the sidebar "the conversation list
 * changed" without remounting anything (a router refresh would reset the
 * chat's in-flight state, including error messages).
 */
const CONVERSATIONS_CHANGED = "nexo:conversations-changed";

export function notifyConversationsChanged(): void {
  window.dispatchEvent(new Event(CONVERSATIONS_CHANGED));
}

export function onConversationsChanged(listener: () => void): () => void {
  window.addEventListener(CONVERSATIONS_CHANGED, listener);
  return () => window.removeEventListener(CONVERSATIONS_CHANGED, listener);
}
