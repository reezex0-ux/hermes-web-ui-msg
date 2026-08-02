import type { HermesChatMessage, HermesMessagePart, HermesSession, HermesToolEvent } from "./hermes-adapter";

export function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function nextSequence(session: HermesSession) {
  return Math.max(-1, ...session.messages.map(message => message.sequence)) + 1;
}

export function makeMessage(role: HermesChatMessage["role"], sequence: number, at: string, parts: HermesMessagePart[] = [], pending = false, turnId?: string): HermesChatMessage {
  return { id: makeId(role), sequence, turnId, role, parts, at, pending, content: parts.filter(part => part.type === "text").map(part => part.content).join("") };
}

export function activeAssistant(session: HermesSession): HermesChatMessage | undefined {
  return session.activeAssistantId ? session.messages.find(message => message.id === session.activeAssistantId) : undefined;
}

export function beginAssistantTurn(session: HermesSession, turnId?: string, at = "") {
  const identified = turnId ? session.messages.find(message => message.role === "assistant" && message.turnId === turnId && message.pending) : undefined;
  if (identified) return { ...session, activeAssistantId: identified.id, status: "working" as const };
  const current = activeAssistant(session);
  if (!turnId && current && session.status === "working") return session;
  const message = makeMessage("assistant", nextSequence(session), at, [], true, turnId);
  return { ...session, messages: [...session.messages, message], activeAssistantId: message.id, status: "working" as const };
}

export function updateAssistantTurn(session: HermesSession, turnId: string | undefined, transform: (message: HermesChatMessage) => HermesChatMessage) {
  const existing = turnId ? session.messages.find(message => message.role === "assistant" && message.turnId === turnId && message.pending) : activeAssistant(session);
  const started = existing ? { ...session, activeAssistantId: existing.id } : beginAssistantTurn(session, turnId);
  const id = started.activeAssistantId;
  return { ...started, messages: started.messages.map(message => message.id === id ? transform(message) : message) };
}

function upsertPart(message: HermesChatMessage, type: "text" | "reasoning", content: string, streaming: boolean, replace: boolean) {
  const index = message.parts.findIndex(part => part.type === type);
  const next = index >= 0 ? [...message.parts] : [...message.parts, { id: makeId(type), type, content: "", streaming } as HermesMessagePart];
  const existing = next[index >= 0 ? index : next.length - 1] as Extract<HermesMessagePart, { type: "text" | "reasoning" }>;
  next[index >= 0 ? index : next.length - 1] = { ...existing, content: replace ? content : existing.content + content, streaming };
  return { ...message, parts: next, content: next.filter(part => part.type === "text").map(part => part.content).join(""), pending: false };
}

export function appendText(session: HermesSession, text: string, turnId?: string) {
  return updateAssistantTurn(session, turnId, message => upsertPart(message, "text", text, true, false));
}

export function appendReasoning(session: HermesSession, text: string, replace = false, turnId?: string) {
  return updateAssistantTurn(session, turnId, message => {
    // Desktop keeps a late finalized reasoning payload from being appended
    // after already visible answer text in the same assistant turn.
    if (replace && message.parts.some(part => part.type === "text" && part.content.trim())) return message;
    return upsertPart(message, "reasoning", text, !replace, replace);
  });
}

export function upsertTool(session: HermesSession, tool: HermesToolEvent, turnId?: string) {
  return updateAssistantTurn(session, turnId, message => {
    const index = message.parts.findIndex(part => part.type === "tool" && part.tool.id === tool.id);
    const parts = [...message.parts];
    if (index >= 0) parts[index] = { ...parts[index], tool } as HermesMessagePart;
    else parts.push({ id: `tool-${tool.id}`, type: "tool", tool });
    return { ...message, parts, pending: false };
  });
}

export function completeAssistantTurn(session: HermesSession, text: string, at: string, turnId?: string) {
  const completed = updateAssistantTurn(session, turnId, message => {
    const withText = text ? upsertPart(message, "text", text, false, true) : message;
    return {
      ...withText,
      at: at || withText.at,
      pending: false,
      parts: withText.parts.map(part => part.type === "tool" ? part : { ...part, streaming: false }) as HermesMessagePart[]
    };
  });
  return { ...completed, status: "idle" as const };
}

export function sealInterimAssistantTurn(session: HermesSession, text: string, at: string, turnId?: string) {
  const sealed = updateAssistantTurn(session, turnId, message => {
    const withText = text ? upsertPart(message, "text", text, false, true) : message;
    return {
      ...withText,
      at: at || withText.at,
      pending: false,
      interim: true,
      parts: withText.parts.map(part => part.type === "tool" ? part : { ...part, streaming: false }) as HermesMessagePart[]
    };
  });
  return { ...sealed, status: "working" as const, activeAssistantId: undefined };
}

export function failActiveTools(session: HermesSession, error: string, turnId?: string) {
  return {
    ...session,
    messages: session.messages.map(message => ({
      ...message,
      parts: message.parts.map(part => part.type === "tool" && part.tool.status === "running" && (!turnId || message.turnId === turnId)
        ? { ...part, tool: { ...part.tool, status: "complete", error: part.tool.error ?? error } }
        : part) as HermesMessagePart[]
    })),
    activeAssistantId: undefined,
    status: "idle" as const
  };
}

export function messageText(message: HermesChatMessage) {
  return message.parts.filter((part): part is Extract<HermesMessagePart, { type: "text" }> => part.type === "text").map(part => part.content).join("");
}

export function hasVisibleAssistantPart(message: HermesChatMessage) {
  return message.parts.some(part => part.type === "tool" ? true : Boolean(part.content.trim()));
}
