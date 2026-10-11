import { ApiError, ChatMessage } from "./api";

/** Sends a question and calls onDelta with each piece of the answer as it arrives.
 *  Resolves with the saved message (including its citations). */
export async function streamAnswer(conversationId: string, content: string, onDelta: (text: string) => void): Promise<ChatMessage> {
  let res: Response;
  try {
    res = await fetch(`/api/chat/conversations/${conversationId}/stream`, {
      method: "POST", credentials: "include",
      headers: { "X-Cubby": "1", "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
  } catch {
    throw new ApiError(0, "Can't reach Cubby. Check your internet connection and try again.");
  }
  if (!res.ok || !res.body) {
    let message = "Cubby can't answer right now. Please try again in a moment.";
    try { const d = await res.json(); if (typeof d.detail === "string") message = d.detail; } catch { /* not JSON */ }
    if (res.status === 401) window.dispatchEvent(new Event("cubby:logged-out"));
    throw new ApiError(res.status, message);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let final: ChatMessage | null = null;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      const evt = JSON.parse(line);
      if (evt.type === "delta") onDelta(evt.text);
      else if (evt.type === "done") final = evt.message;
      else if (evt.type === "error") throw new ApiError(503, evt.detail);
    }
  }
  if (!final) throw new ApiError(503, "The answer was cut off. Please try again.");
  return final;
}
