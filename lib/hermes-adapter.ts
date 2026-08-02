export type HermesGatewayState = "mock" | "connected";

export type HermesProfile = {
  id: string;
  label: string;
  model: string;
  gateway: "running" | "stopped";
};

export type HermesSession = {
  id: string;
  runtimeId?: string;
  persistence?: "draft" | "stored";
  profileId: string;
  title: string;
  updatedAt: string;
  status: "idle" | "working";
  messages: HermesChatMessage[];
  /** Retained only for inactive legacy panel code; live tools now belong to message parts. */
  toolEvents?: HermesToolEvent[];
  /** UI-local pointer to the assistant turn currently receiving Gateway events. */
  activeAssistantId?: string;
  /** Last accepted Gateway event sequence; stale websocket events are ignored. */
  lastEventSequence?: number;
  approval?: HermesApprovalRequest;
  archived?: boolean;
  model?: string;
  modelProvider?: string;
  preview?: string;
  inputTokens?: number;
  outputTokens?: number;
  reasoningEffort?: HermesReasoningEffort;
};

export type HermesChatMessage = {
  id: string;
  sequence: number;
  turnId?: string;
  role: "user" | "assistant";
  parts: HermesMessagePart[];
  at: string;
  pending?: boolean;
  /** A completed mid-turn assistant update, shown before a later final answer. */
  interim?: boolean;
  /** Legacy fields are not written by the live transcript renderer. */
  content: string;
  kind?: "reasoning";
  streaming?: boolean;
};

export type HermesMessagePart =
  | { id: string; type: "text"; content: string; streaming?: boolean }
  | { id: string; type: "reasoning"; content: string; streaming?: boolean }
  | { id: string; type: "tool"; tool: HermesToolEvent };

export type HermesSessionSearchResult = HermesSession & { snippet?: string; role?: string };
export type HermesSlashCommand = { text: string; description?: string };

export type HermesToolEvent = {
  id: string;
  sequence?: number;
  occurrences?: number;
  name: string;
  context: string;
  status: "running" | "complete";
  detail?: string;
  error?: string;
  elapsedMs?: number;
};

export type HermesFileEntry = {
  name: string;
  path: string;
  isDirectory: boolean;
};

export type HermesTextFile = {
  path: string;
  text: string;
  binary: boolean;
  truncated: boolean;
  byteSize: number;
  language: string;
};

export type HermesSkill = {
  name: string;
  description?: string;
  category?: string;
  editable: boolean;
  enabled: boolean;
  provenance?: string;
};

export type HermesMcpServer = {
  name: string;
  target?: string;
  enabled: boolean;
  transport?: "http" | "stdio";
  args?: string[];
};

export type HermesMcpServerDraft = {
  name: string;
  url?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
};

export type HermesMcpTestResult = {
  ok: boolean;
  error?: string;
  tools: Array<{ name: string; description?: string }>;
};

export type HermesPlugin = {
  name: string;
  version?: string;
  description?: string;
  source?: string;
  enabled: boolean;
};

export type HermesApprovalRequest = {
  command: string;
  description: string;
  choices: Array<"once" | "session" | "always" | "deny">;
};

export type HermesWorkspaceSnapshot = {
  gatewayState: HermesGatewayState;
  profiles: HermesProfile[];
  sessions: HermesSession[];
  projectsCapability: "unavailable";
};

export interface HermesAdapter {
  loadWorkspace(): Promise<HermesWorkspaceSnapshot>;
  createSession?(onEvent: HermesGatewayEventHandler): Promise<HermesSession>;
  resumeSession?(sessionId: string, onEvent: HermesGatewayEventHandler): Promise<HermesSession>;
  submitPrompt?(session: HermesSession, text: string): Promise<void>;
  steerPrompt?(session: HermesSession, text: string): Promise<void>;
  undoLastTurn?(session: HermesSession): Promise<void>;
  respondToApproval?(session: HermesSession, choice: HermesApprovalRequest["choices"][number]): Promise<void>;
  close?(): void;
  setProfile?(profile: HermesProfile): void;
  searchSessions?(query: string): Promise<HermesSessionSearchResult[]>;
  renameSession?(session: HermesSession, title: string): Promise<void>;
  archiveSession?(session: HermesSession, archived: boolean): Promise<void>;
  deleteSession?(session: HermesSession): Promise<void>;
  exportSession?(session: HermesSession): Promise<Blob>;
  uploadImage?(file: File): Promise<{ path: string; name: string }>;
  attachPdf?(session: HermesSession, file: File): Promise<{ name: string }>;
  completeSlash?(text: string): Promise<HermesSlashCommand[]>;
}

export type HermesGatewayEvent = {
  sessionId: string;
  type: string;
  payload: Record<string, unknown>;
};

export type HermesGatewayEventHandler = (event: HermesGatewayEvent) => void;

export type HermesModelOption = {
  provider: string;
  providerLabel: string;
  model: string;
  warning?: string;
};

export type HermesModelSettings = {
  model: string;
  provider: string;
  supportsReasoning: boolean;
  reasoningEffort: HermesReasoningEffort;
};

export type HermesReasoningEffort = "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max" | "ultra";

export type HermesModelAssignment = {
  confirmationRequired: boolean;
  confirmationMessage?: string;
};

export type HermesCronJob = {
  id: string;
  profile?: string;
  name: string;
  prompt: string;
  schedule: string;
  state: "scheduled" | "paused" | "running" | "completed" | "failed";
  enabled: boolean;
  deliver: string;
  nextRunAt?: string;
  lastRunAt?: string;
  lastStatus?: string;
  lastError?: string;
  lastDeliveryError?: string;
};

export type HermesCronRun = {
  id: string;
  title: string;
  startedAt?: string;
  endedAt?: string;
  updatedAt?: string;
  preview?: string;
  active: boolean;
  failed: boolean;
};

export type HermesCronJobDraft = {
  name: string;
  prompt: string;
  schedule: string;
};

const reasoningEfforts: HermesReasoningEffort[] = ["none", "minimal", "low", "medium", "high", "xhigh", "max", "ultra"];

type GatewaySession = {
  id?: unknown;
  source?: unknown;
  message_count?: unknown;
  preview?: unknown;
  started_at?: unknown;
  title?: unknown;
  profile?: unknown;
  last_active?: unknown;
  archived?: unknown;
  model?: unknown;
  input_tokens?: unknown;
  output_tokens?: unknown;
};

type GatewaySessionList = {
  sessions?: GatewaySession[];
};

type GatewayTicket = {
  ticket?: unknown;
};

type GatewaySessionCreate = {
  info?: {
    model?: unknown;
    provider?: unknown;
    reasoning_effort?: unknown;
  };
  session_id?: unknown;
};

type GatewaySessionResume = {
  info?: {
    model?: unknown;
    provider?: unknown;
    reasoning_effort?: unknown;
  };
  messages?: Array<{
    role?: unknown;
    text?: unknown;
    context?: unknown;
    name?: unknown;
    tool_call_id?: unknown;
    tool_name?: unknown;
    tool_calls?: unknown;
    reasoning?: unknown;
    reasoning_content?: unknown;
    reasoning_details?: unknown;
    detail?: unknown;
    timestamp?: unknown;
  }>;
  running?: unknown;
  session_id?: unknown;
};

/**
 * Read-only adapter for an AppShell page served by the authenticated Hermes
 * Dashboard itself. It deliberately has no token, cookie, or cross-origin
 * configuration surface: Hermes owns authentication and mints a one-time WS
 * ticket for the current same-origin browser session.
 */
export class SameOriginHermesAdapter implements HermesAdapter {
  private requestId = 0;
  private liveSocket: WebSocket | null = null;
  private liveSessionId: string | null = null;
  private eventHandler: HermesGatewayEventHandler | null = null;

  constructor(
    private profile: Pick<HermesProfile, "id" | "label" | "model"> = {
      id: "default",
      label: "Default",
      model: "Hermes Gateway"
    }
  ) {}

  setProfile(profile: HermesProfile) {
    this.close();
    this.profile = { id: profile.id, label: profile.label, model: profile.model };
  }

  async loadWorkspace(): Promise<HermesWorkspaceSnapshot> {
    const [profileResponse, sessionResponse] = await Promise.all([
      this.fetchJson<{ profiles?: unknown[] }>("/api/profiles"),
      this.fetchJson<{ sessions?: unknown[] }>("/api/profiles/sessions?profile=all&limit=200&order=recent")
    ]);
    const profiles = (profileResponse.profiles ?? []).flatMap(value => this.toProfile(value));
    const resolvedProfiles = profiles.length ? profiles : [{ ...this.profile, gateway: "running" as const }];
    if (!resolvedProfiles.some(profile => profile.id === this.profile.id)) this.profile = resolvedProfiles[0];
    return {
      gatewayState: "connected",
      profiles: resolvedProfiles,
      sessions: (sessionResponse.sessions ?? []).flatMap(session => this.toSession(session as GatewaySession)),
      projectsCapability: "unavailable"
    };
  }

  async searchSessions(query: string): Promise<HermesSessionSearchResult[]> {
    const profileResponse = await this.fetchJson<{ profiles?: unknown[] }>("/api/profiles");
    const profiles = (profileResponse.profiles ?? []).flatMap(value => this.toProfile(value));
    const targets = profiles.length ? profiles : [{ ...this.profile, gateway: "running" as const }];
    const batches = await Promise.all(targets.map(async profile => {
      const result = await this.fetchJson<{ results?: unknown[] }>(`/api/sessions/search?q=${encodeURIComponent(query)}&profile=${encodeURIComponent(profile.id)}`);
      return (result.results ?? []).flatMap(value => {
        const session = this.toSession(value as GatewaySession)[0];
        if (!session) return [];
        const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
        return [{ ...session, profileId: profile.id, snippet: typeof record.snippet === "string" ? record.snippet : undefined, role: typeof record.role === "string" ? record.role : undefined }];
      });
    }));
    return batches.flat();
  }

  async createProfile(name: string, cloneFromDefault: boolean): Promise<void> {
    await this.fetchJson("/api/profiles", { method: "POST", body: JSON.stringify({ name, clone_from_default: cloneFromDefault }) });
  }

  async renameProfile(name: string, newName: string): Promise<void> {
    await this.fetchJson(`/api/profiles/${encodeURIComponent(name)}`, { method: "PATCH", body: JSON.stringify({ new_name: newName }) });
  }

  async deleteProfile(name: string): Promise<void> {
    await this.fetchJson(`/api/profiles/${encodeURIComponent(name)}`, { method: "DELETE" });
  }

  async renameSession(session: HermesSession, title: string): Promise<void> {
    await this.fetchJson(`/api/sessions/${encodeURIComponent(session.id)}`, { method: "PATCH", body: JSON.stringify({ title, profile: session.profileId }) });
  }

  async archiveSession(session: HermesSession, archived: boolean): Promise<void> {
    await this.fetchJson(`/api/sessions/${encodeURIComponent(session.id)}`, { method: "PATCH", body: JSON.stringify({ archived, profile: session.profileId }) });
  }

  async deleteSession(session: HermesSession): Promise<void> {
    await this.fetchJson(`/api/sessions/${encodeURIComponent(session.id)}?profile=${encodeURIComponent(session.profileId)}`, { method: "DELETE" });
  }

  async exportSession(session: HermesSession): Promise<Blob> {
    const response = await fetch(this.gatewayPath(`/api/sessions/${encodeURIComponent(session.id)}/export?profile=${encodeURIComponent(session.profileId)}`), { credentials: "same-origin" });
    if (!response.ok) throw new Error(`Hermes export failed (${response.status}).`);
    return response.blob();
  }

  async getFileRoot(): Promise<string> {
    const result = await this.fetchJson<{ cwd?: unknown }>("/api/fs/default-cwd");
    if (typeof result.cwd !== "string" || !result.cwd) throw new Error("Hermes did not provide a workspace folder.");
    return result.cwd;
  }

  async listFiles(path: string): Promise<HermesFileEntry[]> {
    const result = await this.fetchJson<{ entries?: unknown[]; error?: unknown }>(`/api/fs/list?path=${encodeURIComponent(path)}`);
    if (typeof result.error === "string") throw new Error(`Hermes could not open this folder (${result.error}).`);
    return (result.entries ?? []).flatMap(entry => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
      const value = entry as Record<string, unknown>;
      return typeof value.name === "string" && typeof value.path === "string" && typeof value.isDirectory === "boolean"
        ? [{ name: value.name, path: value.path, isDirectory: value.isDirectory }]
        : [];
    });
  }

  async readTextFile(path: string): Promise<HermesTextFile> {
    const result = await this.fetchJson<Record<string, unknown>>(`/api/fs/read-text?path=${encodeURIComponent(path)}`);
    if (typeof result.path !== "string" || typeof result.text !== "string") throw new Error("Hermes returned an invalid text file response.");
    return {
      path: result.path,
      text: result.text,
      binary: result.binary === true,
      truncated: result.truncated === true,
      byteSize: typeof result.byteSize === "number" ? result.byteSize : 0,
      language: typeof result.language === "string" ? result.language : "text"
    };
  }

  async writeTextFile(path: string, content: string): Promise<void> {
    await this.fetchJson("/api/fs/write-text", { method: "POST", body: JSON.stringify({ path, content }) });
  }

  async uploadImage(file: File): Promise<{ path: string; name: string }> {
    const form = new FormData();
    form.append("file", file, file.name);
    const response = await fetch(this.gatewayPath(`/api/chat/image-upload?${this.profileQuery()}`), { method: "POST", credentials: "same-origin", body: form });
    const body = await response.json().catch(() => null) as { path?: unknown } | null;
    if (!response.ok || typeof body?.path !== "string") throw new Error("Hermes could not attach that image.");
    return { path: body.path, name: file.name || "Image" };
  }

  async attachPdf(session: HermesSession, file: File): Promise<{ name: string }> {
    if (!this.liveSocket || this.liveSocket.readyState !== WebSocket.OPEN || !session.runtimeId) {
      throw new Error("Open the Hermes session before attaching a PDF.");
    }
    const contentBase64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Could not read that PDF."));
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
      reader.readAsDataURL(file);
    });
    await this.request(this.liveSocket, "pdf.attach", { session_id: session.runtimeId, content_base64: contentBase64, filename: file.name || "document.pdf" });
    return { name: file.name || "document.pdf" };
  }

  async completeSlash(text: string): Promise<HermesSlashCommand[]> {
    const socket = this.liveSocket?.readyState === WebSocket.OPEN ? this.liveSocket : await this.connect(await this.mintTicket());
    try {
      const result = await this.request<{ items?: Array<{ text?: unknown; description?: unknown }> }>(socket, "complete.slash", { text });
      return (result.items ?? []).flatMap(item => typeof item.text === "string" ? [{ text: item.text, description: typeof item.description === "string" ? item.description : undefined }] : []);
    } finally {
      if (socket !== this.liveSocket) socket.close();
    }
  }

  async createSession(onEvent: HermesGatewayEventHandler): Promise<HermesSession> {
    const socket = await this.openLiveSocket(onEvent);

    try {
      const result = await this.request<GatewaySessionCreate>(socket, "session.create", {
        profile: this.profile.id
      });

      if (typeof result.session_id !== "string" || !result.session_id) {
        throw new Error("Hermes Gateway did not return a session id.");
      }

      const session: HermesSession = {
        id: result.session_id,
        runtimeId: result.session_id,
        persistence: "draft",
        profileId: this.profile.id,
        title: "Untitled session",
        updatedAt: this.formatTimestamp(Date.now() / 1000),
        status: "idle",
        messages: [],
        model: typeof result.info?.model === "string" ? result.info.model : undefined,
        modelProvider: typeof result.info?.provider === "string" ? result.info.provider : undefined,
        reasoningEffort: reasoningEfforts.includes(result.info?.reasoning_effort as HermesReasoningEffort) ? result.info?.reasoning_effort as HermesReasoningEffort : undefined
      };
      this.liveSessionId = result.session_id;
      return session;
    } catch (error) {
      this.close();
      throw error;
    }
  }

  async resumeSession(sessionId: string, onEvent: HermesGatewayEventHandler): Promise<HermesSession> {
    const socket = await this.openLiveSocket(onEvent);

    try {
      const result = await this.request<GatewaySessionResume>(socket, "session.resume", {
        session_id: sessionId,
        profile: this.profile.id
      });

      if (typeof result.session_id !== "string" || !result.session_id) {
        throw new Error("Hermes Gateway did not return a live session id.");
      }

      const transcript = this.toTranscript(result.messages);
      const lastUserIndex = transcript.findLastIndex(message => message.role === "user");
      const activeAssistantId = result.running === true
        ? transcript.slice(lastUserIndex + 1).findLast(message => message.role === "assistant")?.id
        : undefined;
      const session: HermesSession = {
        id: sessionId,
        runtimeId: result.session_id,
        persistence: "stored",
        profileId: this.profile.id,
        title: "Untitled session",
        updatedAt: this.formatTimestamp(Date.now() / 1000),
        status: result.running === true ? "working" : "idle",
        messages: transcript,
        activeAssistantId,
        model: typeof result.info?.model === "string" ? result.info.model : undefined,
        modelProvider: typeof result.info?.provider === "string" ? result.info.provider : undefined,
        reasoningEffort: reasoningEfforts.includes(result.info?.reasoning_effort as HermesReasoningEffort) ? result.info?.reasoning_effort as HermesReasoningEffort : undefined
      };
      this.liveSessionId = result.session_id;
      return session;
    } catch (error) {
      this.close();
      throw error;
    }
  }

  async submitPrompt(session: HermesSession, text: string): Promise<void> {
    if (!this.liveSocket || this.liveSocket.readyState !== WebSocket.OPEN || !session.runtimeId) {
      throw new Error("Open the Hermes session before sending a message.");
    }

    await this.request(this.liveSocket, "prompt.submit", {
      session_id: session.runtimeId,
      text
    });
  }

  async steerPrompt(session: HermesSession, text: string): Promise<void> {
    if (!this.liveSocket || this.liveSocket.readyState !== WebSocket.OPEN || !session.runtimeId) {
      throw new Error("Open the Hermes session before steering a message.");
    }
    const result = await this.request<{ status?: unknown }>(this.liveSocket, "session.steer", {
      session_id: session.runtimeId,
      text
    });
    if (result.status !== "queued") throw new Error("Hermes could not apply that steer message yet.");
  }

  async undoLastTurn(session: HermesSession): Promise<void> {
    if (!this.liveSocket || this.liveSocket.readyState !== WebSocket.OPEN || !session.runtimeId) {
      throw new Error("Open the Hermes session before editing its last message.");
    }
    await this.request(this.liveSocket, "session.undo", { session_id: session.runtimeId });
  }

  async executeSlash(session: HermesSession, command: string): Promise<string> {
    if (!this.liveSocket || this.liveSocket.readyState !== WebSocket.OPEN || !session.runtimeId) {
      throw new Error("Open the Hermes session before running a command.");
    }

    const result = await this.request<{ output?: unknown }>(this.liveSocket, "slash.exec", {
      session_id: session.runtimeId,
      command
    });
    return typeof result.output === "string" ? result.output : "";
  }

  async getSessionReasoning(session: HermesSession): Promise<HermesReasoningEffort> {
    if (!this.liveSocket || this.liveSocket.readyState !== WebSocket.OPEN || !session.runtimeId) {
      throw new Error("Open the Hermes session before reading reasoning mode.");
    }

    const result = await this.request<{ value?: unknown }>(this.liveSocket, "config.get", {
      key: "reasoning",
      session_id: session.runtimeId
    });
    return reasoningEfforts.includes(result.value as HermesReasoningEffort) ? result.value as HermesReasoningEffort : "medium";
  }

  async setSessionReasoning(session: HermesSession, reasoningEffort: HermesReasoningEffort): Promise<HermesReasoningEffort> {
    if (!reasoningEfforts.includes(reasoningEffort)) throw new Error("Unsupported reasoning effort.");
    if (!this.liveSocket || this.liveSocket.readyState !== WebSocket.OPEN || !session.runtimeId) {
      throw new Error("Open the Hermes session before changing reasoning mode.");
    }

    const result = await this.request<{ value?: unknown }>(this.liveSocket, "config.set", {
      key: "reasoning",
      session_id: session.runtimeId,
      value: reasoningEffort
    });
    return reasoningEfforts.includes(result.value as HermesReasoningEffort) ? result.value as HermesReasoningEffort : reasoningEffort;
  }

  async respondToApproval(session: HermesSession, choice: HermesApprovalRequest["choices"][number]): Promise<void> {
    if (!this.liveSocket || this.liveSocket.readyState !== WebSocket.OPEN || !session.runtimeId) {
      throw new Error("Open the Hermes session before responding to approval.");
    }

    await this.request(this.liveSocket, "approval.respond", {
      session_id: session.runtimeId,
      choice
    });
  }

  close() {
    this.eventHandler = null;
    this.liveSessionId = null;
    this.liveSocket?.close();
    this.liveSocket = null;
  }

  isLiveSession(session: HermesSession) {
    return Boolean(session.runtimeId && session.runtimeId === this.liveSessionId && this.liveSocket?.readyState === WebSocket.OPEN);
  }

  async getModelSettings(): Promise<HermesModelSettings> {
    const [modelInfo, config] = await Promise.all([
      this.fetchJson<{ model?: unknown; provider?: unknown; capabilities?: { supports_reasoning?: unknown } }>(`/api/model/info?${this.profileQuery()}`),
      this.fetchJson<{ agent?: { reasoning_effort?: unknown } }>(`/api/config?${this.profileQuery()}`)
    ]);
    const configuredEffort = config.agent?.reasoning_effort;

    return {
      model: typeof modelInfo.model === "string" ? modelInfo.model : this.profile.model,
      provider: typeof modelInfo.provider === "string" ? modelInfo.provider : "",
      supportsReasoning: modelInfo.capabilities?.supports_reasoning === true,
      reasoningEffort: reasoningEfforts.includes(configuredEffort as HermesReasoningEffort) ? configuredEffort as HermesReasoningEffort : "medium"
    };
  }

  async getModelOptions(): Promise<HermesModelOption[]> {
    const result = await this.fetchJson<{ providers?: Array<{ name?: unknown; slug?: unknown; warning?: unknown; models?: unknown[] }> }>(`/api/model/options?${this.profileQuery("include_unconfigured=1")}`);

    return (result.providers ?? []).flatMap(provider => {
      if (typeof provider.slug !== "string" || !Array.isArray(provider.models)) return [];
      const providerSlug = provider.slug;
      const providerLabel = typeof provider.name === "string" ? provider.name : providerSlug;
      const warning = typeof provider.warning === "string" ? provider.warning : undefined;
      return provider.models.flatMap(model => typeof model === "string" ? [{
        provider: providerSlug,
        providerLabel,
        model,
        warning
      }] : []);
    });
  }

  async setMainModel(provider: string, model: string, confirmExpensiveModel = false): Promise<HermesModelAssignment> {
    const result = await this.fetchJson<{ confirm_required?: unknown; confirm_message?: unknown }>(`/api/model/set?${this.profileQuery()}`, {
      method: "POST",
      body: JSON.stringify({ scope: "main", provider, model, confirm_expensive_model: confirmExpensiveModel })
    });

    return {
      confirmationRequired: result.confirm_required === true,
      confirmationMessage: typeof result.confirm_message === "string" ? result.confirm_message : undefined
    };
  }

  async setReasoningEffort(reasoningEffort: HermesReasoningEffort): Promise<void> {
    if (!reasoningEfforts.includes(reasoningEffort)) throw new Error("Unsupported reasoning effort.");
    const config = await this.fetchJson<Record<string, unknown>>(`/api/config?${this.profileQuery()}`);
    const currentAgent = config.agent && typeof config.agent === "object" && !Array.isArray(config.agent) ? config.agent as Record<string, unknown> : {};

    await this.fetchJson(`/api/config?${this.profileQuery()}`, {
      method: "PUT",
      body: JSON.stringify({ config: { ...config, agent: { ...currentAgent, reasoning_effort: reasoningEffort } } })
    });
  }

  async listSkills(): Promise<HermesSkill[]> {
    const result = await this.fetchJson<unknown>(`/api/skills?${this.profileQuery()}`);
    if (!Array.isArray(result)) return [];
    return result.flatMap(skill => this.toSkill(skill));
  }

  async readSkill(name: string): Promise<string> {
    const result = await this.fetchJson<{ content?: unknown }>(`/api/learning/node?${this.profileQuery(`id=${encodeURIComponent(name)}`)}`);
    if (typeof result.content !== "string") throw new Error("Hermes did not return the skill content.");
    return result.content;
  }

  async writeSkill(name: string, content: string): Promise<void> {
    await this.fetchJson("/api/learning/node", {
      method: "PUT",
      body: JSON.stringify({ id: name, content, profile: this.profile.id })
    });
  }

  async listMcpServers(): Promise<HermesMcpServer[]> {
    const result = await this.fetchJson<{ servers?: unknown[] }>("/api/mcp/servers");
    return (result.servers ?? []).flatMap(server => this.toMcpServer(server));
  }

  async addMcpServer(draft: HermesMcpServerDraft): Promise<HermesMcpServer> {
    const result = await this.fetchJson<unknown>("/api/mcp/servers", {
      method: "POST",
      body: JSON.stringify({ name: draft.name, url: draft.url, command: draft.command, args: draft.args, env: draft.env })
    });
    const server = this.toMcpServer(result)[0];
    if (!server) throw new Error("Hermes did not return the MCP server.");
    return server;
  }

  async setMcpServerEnabled(name: string, enabled: boolean): Promise<void> {
    await this.fetchJson(`/api/mcp/servers/${encodeURIComponent(name)}/enabled`, { method: "PUT", body: JSON.stringify({ enabled }) });
  }

  async removeMcpServer(name: string): Promise<void> {
    await this.fetchJson(`/api/mcp/servers/${encodeURIComponent(name)}`, { method: "DELETE" });
  }

  async testMcpServer(name: string): Promise<HermesMcpTestResult> {
    const result = await this.fetchJson<{ ok?: unknown; error?: unknown; tools?: unknown[] }>(`/api/mcp/servers/${encodeURIComponent(name)}/test`, { method: "POST" });
    return {
      ok: result.ok === true,
      error: typeof result.error === "string" ? result.error : undefined,
      tools: (result.tools ?? []).flatMap(tool => tool && typeof tool === "object" && !Array.isArray(tool) && typeof (tool as Record<string, unknown>).name === "string"
        ? [{ name: (tool as Record<string, unknown>).name as string, description: typeof (tool as Record<string, unknown>).description === "string" ? (tool as Record<string, unknown>).description as string : undefined }]
        : [])
    };
  }

  async setSkillEnabled(name: string, enabled: boolean): Promise<void> {
    await this.fetchJson("/api/skills/toggle", { method: "PUT", body: JSON.stringify({ name, enabled }) });
  }

  async startSkillHubAction(action: "install" | "uninstall" | "update", value?: string): Promise<void> {
    const path = action === "install" ? "/api/skills/hub/install" : action === "uninstall" ? "/api/skills/hub/uninstall" : "/api/skills/hub/update";
    const body = action === "install" ? { identifier: value } : action === "uninstall" ? { name: value } : undefined;
    await this.fetchJson(path, { method: "POST", ...(body ? { body: JSON.stringify(body) } : {}) });
  }

  async listPlugins(): Promise<HermesPlugin[]> {
    const result = await this.requestGateway<{ plugins?: unknown[] }>("plugins.manage", { action: "list" });
    return (result.plugins ?? []).flatMap(plugin => this.toPlugin(plugin));
  }

  async setPluginEnabled(name: string, enabled: boolean): Promise<HermesPlugin | null> {
    const result = await this.requestGateway<{ plugin?: unknown }>("plugins.manage", { action: "toggle", name, enable: enabled });
    return this.toPlugin(result.plugin)[0] ?? null;
  }

  async listCronJobs(): Promise<HermesCronJob[]> {
    const result = await this.fetchJson<unknown>("/api/cron/jobs?profile=all");
    if (!Array.isArray(result)) return [];
    return result.flatMap(job => this.toCronJob(job));
  }

  async createCronJob(draft: HermesCronJobDraft, profileId = this.profile.id): Promise<HermesCronJob> {
    const query = new URLSearchParams({ profile: profileId });
    const result = await this.fetchJson<unknown>(`/api/cron/jobs?${query}`, {
      method: "POST",
      body: JSON.stringify({ name: draft.name, prompt: draft.prompt, schedule: draft.schedule, deliver: "local" })
    });
    const job = this.toCronJob(result)[0];
    if (!job) throw new Error("Hermes did not return the created cron job.");
    return job;
  }

  async updateCronJob(job: HermesCronJob, draft: HermesCronJobDraft): Promise<HermesCronJob> {
    const query = new URLSearchParams();
    if (job.profile) query.set("profile", job.profile);
    const suffix = query.toString() ? `?${query}` : "";
    const result = await this.fetchJson<unknown>(`/api/cron/jobs/${encodeURIComponent(job.id)}${suffix}`, {
      method: "PUT",
      body: JSON.stringify({ updates: { name: draft.name, prompt: draft.prompt, schedule: draft.schedule } })
    });
    return this.toCronJob(result)[0] ?? job;
  }

  async deleteCronJob(job: HermesCronJob): Promise<void> {
    const query = new URLSearchParams();
    if (job.profile) query.set("profile", job.profile);
    const suffix = query.toString() ? `?${query}` : "";
    await this.fetchJson(`/api/cron/jobs/${encodeURIComponent(job.id)}${suffix}`, { method: "DELETE" });
  }

  async runCronAction(job: HermesCronJob, action: "pause" | "resume" | "trigger"): Promise<HermesCronJob> {
    const query = new URLSearchParams();
    if (job.profile) query.set("profile", job.profile);
    const suffix = query.toString() ? `?${query}` : "";
    const result = await this.fetchJson<unknown>(`/api/cron/jobs/${encodeURIComponent(job.id)}/${action}${suffix}`, { method: "POST" });
    return this.toCronJob(result)[0] ?? job;
  }

  async listCronRuns(job: HermesCronJob): Promise<HermesCronRun[]> {
    const query = new URLSearchParams({ limit: "12" });
    if (job.profile) query.set("profile", job.profile);
    const result = await this.fetchJson<{ runs?: unknown[] }>(`/api/cron/jobs/${encodeURIComponent(job.id)}/runs?${query}`);
    return (result.runs ?? []).flatMap(run => this.toCronRun(run));
  }

  private async mintTicket(): Promise<string> {
    const response = await fetch(this.gatewayPath("/api/auth/ws-ticket"), {
      method: "POST",
      credentials: "same-origin"
    });

    if (!response.ok) {
      throw new Error("Hermes authentication is required.");
    }

    const body = (await response.json()) as GatewayTicket;
    if (typeof body.ticket !== "string" || !body.ticket) {
      throw new Error("Hermes did not return a WebSocket ticket.");
    }

    return body.ticket;
  }

  private async requestGateway<T>(method: string, params: Record<string, unknown>): Promise<T> {
    const socket = this.liveSocket?.readyState === WebSocket.OPEN ? this.liveSocket : await this.connect(await this.mintTicket());
    try {
      return await this.request<T>(socket, method, params);
    } finally {
      if (socket !== this.liveSocket) socket.close();
    }
  }

  private profileQuery(extra?: string): string {
    const query = new URLSearchParams(extra);
    query.set("profile", this.profile.id);
    return query.toString();
  }

  private async fetchJson<T = unknown>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(this.gatewayPath(path), {
      ...init,
      credentials: "same-origin",
      headers: { "content-type": "application/json", ...init?.headers }
    });
    const body = await response.json().catch(() => null) as { detail?: unknown; message?: unknown } | T | null;

    if (!response.ok) {
      const message = body && typeof body === "object" && "detail" in body && typeof body.detail === "string"
        ? body.detail
        : body && typeof body === "object" && "message" in body && typeof body.message === "string"
          ? body.message
          : `Hermes request failed (${response.status}).`;
      throw new Error(message);
    }

    return body as T;
  }

  private toCronJob(value: unknown): HermesCronJob[] {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const job = value as Record<string, unknown>;
    if (typeof job.id !== "string" || !job.id) return [];
    const schedule = job.schedule && typeof job.schedule === "object" && !Array.isArray(job.schedule) ? job.schedule as Record<string, unknown> : {};
    const state = job.state;
    const normalizedState = state === "paused" || state === "running" || state === "completed" || state === "failed" ? state : "scheduled";

    return [{
      id: job.id,
      profile: typeof job.profile === "string" ? job.profile : undefined,
      name: typeof job.name === "string" && job.name.trim() ? job.name : "Untitled cron job",
      prompt: typeof job.prompt === "string" ? job.prompt : "",
      schedule: typeof job.schedule_display === "string" ? job.schedule_display : typeof schedule.display === "string" ? schedule.display : typeof schedule.expr === "string" ? schedule.expr : "Schedule unavailable",
      state: normalizedState,
      enabled: job.enabled !== false,
      deliver: typeof job.deliver === "string" ? job.deliver : "local",
      nextRunAt: typeof job.next_run_at === "string" ? job.next_run_at : undefined,
      lastRunAt: typeof job.last_run_at === "string" ? job.last_run_at : undefined,
      lastStatus: typeof job.last_status === "string" ? job.last_status : undefined,
      lastError: typeof job.last_error === "string" ? job.last_error : undefined,
      lastDeliveryError: typeof job.last_delivery_error === "string" ? job.last_delivery_error : undefined
    }];
  }

  private toSkill(value: unknown): HermesSkill[] {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const skill = value as Record<string, unknown>;
    const name = typeof skill.name === "string" ? skill.name : typeof skill.id === "string" ? skill.id : "";
    if (!name) return [];
    return [{
      name,
      description: typeof skill.description === "string" ? skill.description : undefined,
      category: typeof skill.category === "string" ? skill.category : undefined,
      editable: skill.provenance === "agent",
      enabled: skill.enabled !== false,
      provenance: typeof skill.provenance === "string" ? skill.provenance : undefined
    }];
  }

  private toMcpServer(value: unknown): HermesMcpServer[] {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const server = value as Record<string, unknown>;
    if (typeof server.name !== "string" || !server.name) return [];
    const transport = server.transport === "http" || server.transport === "stdio" ? server.transport : undefined;
    return [{
      name: server.name,
      target: typeof server.url === "string" ? server.url : typeof server.command === "string" ? server.command : undefined,
      enabled: server.enabled !== false,
      transport,
      args: Array.isArray(server.args) ? server.args.filter((arg): arg is string => typeof arg === "string") : undefined
    }];
  }

  private toPlugin(value: unknown): HermesPlugin[] {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const plugin = value as Record<string, unknown>;
    if (typeof plugin.name !== "string" || !plugin.name) return [];
    const status = typeof plugin.status === "string" ? plugin.status.toLowerCase() : "";
    return [{
      name: plugin.name,
      version: typeof plugin.version === "string" ? plugin.version : undefined,
      description: typeof plugin.description === "string" ? plugin.description : undefined,
      source: typeof plugin.source === "string" ? plugin.source : undefined,
      enabled: plugin.enabled === true || status === "enabled"
    }];
  }

  private toCronRun(value: unknown): HermesCronRun[] {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const run = value as Record<string, unknown>;
    if (typeof run.id !== "string" || !run.id) return [];
    const status = typeof run.status === "string" ? run.status.toLowerCase() : "";
    return [{
      id: run.id,
      title: typeof run.title === "string" && run.title.trim() ? run.title : "Cron run",
      startedAt: typeof run.started_at === "string" ? run.started_at : undefined,
      endedAt: typeof run.ended_at === "string" ? run.ended_at : undefined,
      updatedAt: typeof run.last_active === "string" ? run.last_active : undefined,
      preview: typeof run.preview === "string" ? run.preview : undefined,
      active: run.is_active === true,
      failed: status === "failed" || status === "error"
    }];
  }

  private async connect(ticket: string): Promise<WebSocket> {
    const url = new URL(this.gatewayPath("/api/ws"), window.location.href);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.searchParams.set("ticket", ticket);

    return new Promise<WebSocket>((resolve, reject) => {
      const socket = new WebSocket(url);
      const timeout = window.setTimeout(() => {
        socket.close();
        reject(new Error("Hermes Gateway connection timed out."));
      }, 15_000);

      socket.addEventListener("open", () => {
        window.clearTimeout(timeout);
        resolve(socket);
      }, { once: true });
      socket.addEventListener("error", () => {
        window.clearTimeout(timeout);
        reject(new Error("Hermes Gateway connection failed."));
      }, { once: true });
    });
  }

  private async openLiveSocket(onEvent: HermesGatewayEventHandler): Promise<WebSocket> {
    this.close();
    const socket = await this.connect(await this.mintTicket());
    this.liveSocket = socket;
    this.eventHandler = onEvent;
    socket.addEventListener("message", this.receiveEvent);
    socket.addEventListener("close", () => {
      if (this.liveSocket !== socket) return;
      const sessionId = this.liveSessionId;
      this.liveSocket = null;
      if (sessionId && this.eventHandler) this.eventHandler({ sessionId, type: "connection.closed", payload: {} });
    }, { once: true });
    return socket;
  }

  private receiveEvent = (event: MessageEvent<string>) => {
    let frame: { method?: unknown; params?: { type?: unknown; session_id?: unknown; payload?: unknown } };

    try {
      frame = JSON.parse(event.data) as { method?: unknown; params?: { type?: unknown; session_id?: unknown; payload?: unknown } };
    } catch {
      return;
    }

    if (frame.method !== "event" || typeof frame.params?.type !== "string" || typeof frame.params.session_id !== "string") return;
    this.eventHandler?.({
      type: frame.params.type,
      sessionId: frame.params.session_id,
      payload: this.toPayload(frame.params.payload)
    });
  };

  private request<T>(socket: WebSocket, method: string, params: Record<string, unknown>): Promise<T> {
    const id = `workspace-${++this.requestId}`;

    return new Promise<T>((resolve, reject) => {
      const onMessage = (event: MessageEvent<string>) => {
        let frame: { id?: unknown; result?: unknown; error?: { message?: unknown } };

        try {
          frame = JSON.parse(event.data) as { id?: unknown; result?: unknown; error?: { message?: unknown } };
        } catch {
          return;
        }

        if (frame.id !== id) return;
        socket.removeEventListener("message", onMessage);

        if (frame.error) {
          reject(new Error(typeof frame.error.message === "string" ? frame.error.message : "Hermes RPC failed."));
          return;
        }

        resolve(frame.result as T);
      };

      socket.addEventListener("message", onMessage);
      socket.send(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
    });
  }

  private toSession(session: GatewaySession): HermesSession[] {
    if (typeof session.id !== "string" || !session.id) return [];
    if (session.source === "cron" || session.id.startsWith("cron_")) return [];

    const title = typeof session.title === "string" && session.title.trim() ? session.title : "Untitled session";
    return [{
      id: session.id,
      persistence: "stored",
      profileId: typeof session.profile === "string" && session.profile ? session.profile : this.profile.id,
      title,
      updatedAt: this.formatTimestamp(session.last_active ?? session.started_at),
      status: "idle",
      // session.history first requires session.resume, which attaches runtime
      // state. Read-only discovery therefore exposes metadata only.
      messages: [],
      archived: session.archived === true,
      model: typeof session.model === "string" ? session.model : undefined,
      preview: typeof session.preview === "string" ? session.preview : undefined,
      inputTokens: typeof session.input_tokens === "number" ? session.input_tokens : undefined,
      outputTokens: typeof session.output_tokens === "number" ? session.output_tokens : undefined
    }];
  }

  private toProfile(value: unknown): HermesProfile[] {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const profile = value as Record<string, unknown>;
    const id = typeof profile.name === "string" ? profile.name : typeof profile.id === "string" ? profile.id : "";
    if (!id) return [];
    const model = typeof profile.model === "string" ? profile.model : typeof profile.model_name === "string" ? profile.model_name : "Hermes Gateway";
    return [{ id, label: typeof profile.display_name === "string" ? profile.display_name : typeof profile.label === "string" ? profile.label : id, model, gateway: "running" }];
  }

  private toTranscript(messages: GatewaySessionResume["messages"]): HermesSession["messages"] {
    if (!Array.isArray(messages)) return [];

    const transcript: HermesSession["messages"] = [];
    let pendingTools: HermesChatMessage["parts"] = [];
    let activeAssistantIndex: number | null = null;

    const withText = (parts: HermesChatMessage["parts"]) => parts.filter(part => part.type === "text").map(part => part.content).join("");
    const updateStoredTool = (parts: HermesChatMessage["parts"], message: NonNullable<GatewaySessionResume["messages"]>[number]) => {
      const id = typeof message.tool_call_id === "string" ? message.tool_call_id : "";
      const name = typeof message.tool_name === "string" ? message.tool_name : typeof message.name === "string" ? message.name : "tool";
      const detail = typeof message.detail === "string" ? message.detail : typeof message.text === "string" ? message.text : typeof message.context === "string" ? message.context : "";
      const index = parts.findIndex(part => part.type === "tool" && (Boolean(id) ? part.tool.id === id : part.tool.name === name));
      if (index < 0) return null;
      const next = [...parts];
      const part = next[index];
      if (part.type === "tool") next[index] = { ...part, tool: { ...part.tool, status: "complete", detail: detail || part.tool.detail } };
      return next;
    };
    const flushPendingTools = (index: number) => {
      if (!pendingTools.length) return;
      transcript.push({ id: `history-tools-${index}`, sequence: transcript.length, role: "assistant", parts: pendingTools, at: "", content: "" });
      activeAssistantIndex = transcript.length - 1;
      pendingTools = [];
    };

    messages.forEach((message, index) => {
      if (message.role === "tool") {
        const pendingResult = updateStoredTool(pendingTools, message);
        if (pendingResult) { pendingTools = pendingResult; return; }
        for (let i = transcript.length - 1; i >= 0; i -= 1) {
          const result = updateStoredTool(transcript[i].parts, message);
          if (!result) continue;
          transcript[i] = { ...transcript[i], parts: result, content: withText(result) };
          return;
        }
        const name = typeof message.tool_name === "string" ? message.tool_name : typeof message.name === "string" ? message.name : "tool";
        const context = typeof message.context === "string" ? message.context : typeof message.text === "string" ? message.text : "";
        pendingTools = [...pendingTools, { id: `history-tool-result-${index}`, type: "tool", tool: { id: typeof message.tool_call_id === "string" ? message.tool_call_id : `history-tool-result-${index}`, name, context, detail: context || undefined, status: "complete" } }];
        return;
      }
      if (message.role !== "user" && message.role !== "assistant") return;

      const parts: HermesChatMessage["parts"] = [];
      if (message.role === "assistant") {
        const reasoning = [message.reasoning, message.reasoning_content, message.reasoning_details].find(value => typeof value === "string" && value.trim());
        if (typeof reasoning === "string") parts.push({ id: `history-reasoning-${index}`, type: "reasoning", content: reasoning });
      }
      if (message.role === "assistant" && Array.isArray(message.tool_calls)) message.tool_calls.forEach((call, callIndex) => {
        const stored = this.toPayload(call);
        const fn = this.toPayload(stored.function);
        const id = typeof stored.id === "string" && stored.id ? stored.id : typeof stored.tool_call_id === "string" && stored.tool_call_id ? stored.tool_call_id : `history-tool-${index}-${callIndex}`;
        const name = typeof fn.name === "string" && fn.name ? fn.name : typeof stored.name === "string" && stored.name ? stored.name : "tool";
        const args = typeof fn.arguments === "string" ? fn.arguments : typeof stored.arguments === "string" ? stored.arguments : "";
        parts.push({ id: `tool-${id}`, type: "tool", tool: { id, name, context: this.storedToolContext(name, args), status: "running" } });
      });
      if (typeof message.text === "string" && message.text.trim()) parts.push({ id: `history-text-${index}`, type: "text", content: message.text });
      if (!parts.length) return;

      const toolOnlyAssistant = message.role === "assistant" && parts.every(part => part.type === "tool");
      if (toolOnlyAssistant) {
        transcript.push({ id: `history-${index}`, sequence: transcript.length, role: "assistant", parts, at: this.formatTimestamp(message.timestamp), content: "" });
        activeAssistantIndex = transcript.length - 1;
        return;
      }
      if (message.role === "assistant") {
        flushPendingTools(index);
      } else {
        flushPendingTools(index);
      }
      const at = this.formatTimestamp(message.timestamp);
      transcript.push({ id: `history-${index}`, sequence: transcript.length, role: message.role, parts, at, content: withText(parts) });
      activeAssistantIndex = message.role === "assistant" ? transcript.length - 1 : null;
    });
    flushPendingTools(messages.length);
    return transcript;
  }

  private storedToolContext(name: string, args: string) {
    if (!args) return "";
    try {
      const parsed = JSON.parse(args);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return args;
      const values = parsed as Record<string, unknown>;
      for (const key of ["command", "path", "query", "pattern", "url", "file", "name"]) {
        if (typeof values[key] === "string" && values[key].trim()) return values[key].trim();
      }
    } catch {
      return args;
    }
    return name;
  }

  private toPayload(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  }

  private formatTimestamp(value: unknown): string {
    if (typeof value !== "number" || !Number.isFinite(value)) return "";

    return new Intl.DateTimeFormat("ko-KR", {
      dateStyle: "short",
      timeStyle: "short"
    }).format(new Date(value * 1000));
  }

  private gatewayPath(path: string): string {
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
    return basePath && (window.location.pathname === basePath || window.location.pathname.startsWith(`${basePath}/`))
      ? `${basePath}${path}`
      : path;
  }
}
