import { useCallback, useState } from "react";
import { api, ChatMessage, Conversation } from "./api";
import { streamAnswer } from "./chatStream";

export type ChatState = (Conversation & { messages: ChatMessage[] }) | null;

/** Shared chat logic for the full chat page and the floating bubble. */
export function useChat(onError: (msg: string) => void) {
  const [convo, setConvo] = useState<ChatState>(null);
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [thinking, setThinking] = useState(false);

  const load = useCallback(async (id: string) => {
    setConvo(await api.get<NonNullable<ChatState>>(`/chat/conversations/${id}`));
  }, []);

  const send = useCallback(async (question: string, opts: { documentId?: string | null; current?: ChatState } = {}) => {
    const q = question.trim();
    if (!q) return null;
    let c = opts.current !== undefined ? opts.current : convo;
    if (!c) {
      const created = await api.post<Conversation>("/chat/conversations", opts.documentId ? { document_id: opts.documentId } : {});
      c = { ...created, messages: [] };
    }
    const now = new Date().toISOString();
    const userMsg: ChatMessage = { id: `u-${now}`, role: "user", content: q, citations: [], created_at: now };
    const draft: ChatMessage = { id: "tmp", role: "assistant", content: "", citations: [], created_at: now };
    setConvo({ ...c, messages: [...c.messages, userMsg] });
    setThinking(true);
    try {
      let started = false;
      const final = await streamAnswer(c.id, q, (piece) => {
        if (!started) {
          started = true;
          setThinking(false);
          setStreamingId("tmp");
          setConvo((cur) => cur && { ...cur, messages: [...cur.messages, { ...draft, content: piece }] });
        } else {
          setConvo((cur) => cur && { ...cur, messages: cur.messages.map((m) => m.id === "tmp" ? { ...m, content: m.content + piece } : m) });
        }
      });
      setConvo((cur) => cur && {
        ...cur, messages: [...cur.messages.filter((m) => m.id !== "tmp"), final],
        title: cur.messages.length <= 1 && !cur.document_id ? q.slice(0, 80) : cur.title,
      });
      return c.id;
    } catch (err) {
      onError((err as Error).message);
      setConvo((cur) => cur && { ...cur, messages: cur.messages.filter((m) => m.id !== "tmp" && m !== userMsg) });
      return null;
    } finally {
      setThinking(false);
      setStreamingId(null);
    }
  }, [convo, onError]);

  return { convo, setConvo, load, send, thinking, streamingId };
}
