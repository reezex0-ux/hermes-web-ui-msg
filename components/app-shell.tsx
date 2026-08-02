"use client";

import { Children, isValidElement, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type UIEvent, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { hermesAdapterMock } from "../lib/public-demo-adapter";
import {
  SameOriginHermesAdapter,
  type HermesApprovalRequest,
  type HermesCronJob,
  type HermesCronJobDraft,
  type HermesCronRun,
  type HermesFileEntry,
  type HermesGatewayEvent,
  type HermesMcpServerDraft,
  type HermesMcpServer,
  type HermesModelAssignment,
  type HermesModelOption,
  type HermesModelSettings,
  type HermesPlugin,
  type HermesProfile,
  type HermesReasoningEffort,
  type HermesSession,
  type HermesSessionSearchResult,
  type HermesSlashCommand,
  type HermesSkill,
  type HermesWorkspaceSnapshot
} from "../lib/hermes-adapter";
import {
  appendReasoning,
  appendText,
  beginAssistantTurn,
  completeAssistantTurn,
  failActiveTools,
  hasVisibleAssistantPart,
  makeId,
  makeMessage,
  messageText,
  nextSequence,
  sealInterimAssistantTurn,
  upsertTool
} from "../lib/chat-transcript";

const storageKey = "hermes-workspace-ui.v1";
const modelShortlistKey = "hermes-workspace-ui.model-shortlist.v1";
const skins = [
  { id: "myosotis", name: "Myosotis", description: "The original lavender workspace" },
  { id: "midnight", name: "Night", description: "A low-light dark workspace" },
  { id: "ocean", name: "Ocean", description: "Cool blue and slate tones" },
  { id: "sage", name: "Sage", description: "Muted green and warm neutrals" },
  { id: "rose", name: "Rose", description: "Soft pink and plum tones" }
] as const;
type SkinId = typeof skins[number]["id"];
const workspaceRailMinWidth = 320;
const workspaceRailMaxWidth = 560;
const emptyWorkspace: HermesWorkspaceSnapshot = { gatewayState: "mock", profiles: [], sessions: [], projectsCapability: "unavailable" };
const slashCommands = [
  { command: "/new", description: "Start a fresh Hermes session" },
  { command: "/retry", description: "Retry the last turn" },
  { command: "/undo", description: "Back up a user turn" },
  { command: "/title", description: "Set this session title" },
  { command: "/compress", description: "Compress conversation context" },
  { command: "/context", description: "Show context usage" },
  { command: "/model", description: "Change the current session model" },
  { command: "/reasoning", description: "Set reasoning effort for this session" },
  { command: "/stop", description: "Interrupt running Hermes work" }
];

const approvalCopy: Record<HermesApprovalRequest["choices"][number], string> = {
  once: "Allow this one time",
  session: "Allow for this session",
  always: "Always allow this command",
  deny: "Keep this command blocked"
};

function updateSession(workspace: HermesWorkspaceSnapshot, runtimeId: string, transform: (session: HermesSession) => HermesSession): HermesWorkspaceSnapshot {
  return { ...workspace, sessions: workspace.sessions.map(session => session.runtimeId === runtimeId ? transform(session) : session) };
}

function gatewayTurnId(event: HermesGatewayEvent) {
  return typeof event.payload.turn_id === "string" && event.payload.turn_id ? event.payload.turn_id : undefined;
}

function gatewayEventTime(event: HermesGatewayEvent) {
  const at = event.payload.at;
  if (typeof at !== "number" || !Number.isFinite(at)) return new Intl.DateTimeFormat("ko-KR", { timeStyle: "short" }).format(new Date());
  return new Intl.DateTimeFormat("ko-KR", { timeStyle: "short" }).format(new Date(at * 1000));
}

function reduceGatewayEvent(session: HermesSession, event: HermesGatewayEvent, transform: (session: HermesSession) => HermesSession) {
  const sequence = event.payload.event_seq;
  if (typeof sequence === "number" && Number.isFinite(sequence)) {
    if (typeof session.lastEventSequence === "number" && sequence <= session.lastEventSequence) return session;
    return { ...transform(session), lastEventSequence: sequence };
  }
  return transform(session);
}

type SendMessageOptions = { visible?: boolean };

function normalizeToolText(value: string) {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function isToolContextUseful(context: string, name: string) {
  return Boolean(normalizeToolText(context) && normalizeToolText(context) !== normalizeToolText(name));
}

function toolEventDetail(payload: Record<string, unknown>) {
  for (const key of ["output", "detail", "result_text", "inline_diff"]) {
    if (typeof payload[key] === "string" && payload[key]) return payload[key];
  }
  if (typeof payload.result === "string") return payload.result;
  if (payload.result && typeof payload.result === "object") {
    try { return JSON.stringify(payload.result, null, 2); }
    catch { return undefined; }
  }
  return undefined;
}

export function AppShell() {
  const demoMode = process.env.NEXT_PUBLIC_HERMES_MODE === "demo";
  const publicBasePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  const [activeProfile, setActiveProfile] = useState("default");
  const [activeSession, setActiveSession] = useState("");
  const [activePanel, setActivePanel] = useState<"chat" | "cron">("chat");
  const [expandedProfiles, setExpandedProfiles] = useState<string[]>(["default"]);
  const [gatewayRetry, setGatewayRetry] = useState(0);
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [navigationCollapsed, setNavigationCollapsed] = useState(false);
  const [skin, setSkin] = useState<SkinId>("myosotis");
  const [ready, setReady] = useState(false);
  const [workspace, setWorkspace] = useState<HermesWorkspaceSnapshot>(emptyWorkspace);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [creatingSession, setCreatingSession] = useState(false);
  const [openingSession, setOpeningSession] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [approvalChoice, setApprovalChoice] = useState<HermesApprovalRequest["choices"][number] | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [workspaceRailOpen, setWorkspaceRailOpen] = useState(false);
  const [workspaceRailWidth, setWorkspaceRailWidth] = useState(400);
  const liveAdapter = useRef<SameOriginHermesAdapter | null>(null);
  const openRequest = useRef(0);
  const railResize = useRef<{ startX: number; width: number } | null>(null);
  const [settingsAdapter, setSettingsAdapter] = useState<SameOriginHermesAdapter | null>(null);

  useEffect(() => {
    const saved = window.localStorage.getItem(storageKey);
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as { navigationCollapsed?: boolean; skin?: SkinId; workspaceRailWidth?: number };
        if (typeof parsed.navigationCollapsed === "boolean") setNavigationCollapsed(parsed.navigationCollapsed);
        const savedSkin = skins.find(option => option.id === parsed.skin);
        if (savedSkin) setSkin(savedSkin.id);
        if (typeof parsed.workspaceRailWidth === "number") setWorkspaceRailWidth(Math.max(workspaceRailMinWidth, Math.min(workspaceRailMaxWidth, Math.round(parsed.workspaceRailWidth))));
      } catch {
        window.localStorage.removeItem(storageKey);
      }
    }
    setReady(true);
  }, []);

  useEffect(() => () => liveAdapter.current?.close(), []);

  useEffect(() => {
    if (!ready) return;
    document.documentElement.dataset.skin = skin;
    document.documentElement.style.colorScheme = skin === "midnight" ? "dark" : "light";
    window.localStorage.setItem(storageKey, JSON.stringify({ navigationCollapsed, skin, workspaceRailWidth }));
  }, [navigationCollapsed, ready, skin, workspaceRailWidth]);

  function beginRailResize(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    railResize.current = { startX: event.clientX, width: workspaceRailWidth };
  }

  function resizeRail(event: ReactPointerEvent<HTMLDivElement>) {
    if (!railResize.current) return;
    const next = railResize.current.width + railResize.current.startX - event.clientX;
    setWorkspaceRailWidth(Math.max(workspaceRailMinWidth, Math.min(workspaceRailMaxWidth, Math.round(next))));
  }

  function finishRailResize() {
    railResize.current = null;
  }

  useEffect(() => {
    const path = window.location.pathname;
    const dashboardPlugin = path.includes("/dashboard-plugins/hermes-workspace-appshell/app/");
    const standaloneWorkspace = publicBasePath
      ? path === publicBasePath || path.startsWith(`${publicBasePath}/`)
      : path === "/" || path === "";
    if (demoMode) {
      liveAdapter.current?.close();
      liveAdapter.current = null;
      setSettingsAdapter(null);
      setLoadError(null);
      setWorkspace(hermesAdapterMock);
      setActiveProfile(hermesAdapterMock.profiles[0]?.id ?? "default");
      setActiveSession(hermesAdapterMock.sessions[0]?.id ?? "");
      setExpandedProfiles(current => current.length ? current : [hermesAdapterMock.profiles[0]?.id ?? "default"]);
      return;
    }
    if (!dashboardPlugin && !standaloneWorkspace) return;
    liveAdapter.current?.close();
    const adapter = new SameOriginHermesAdapter();
    liveAdapter.current = adapter;
    setSettingsAdapter(adapter);
    void adapter.loadWorkspace()
      .then(snapshot => {
        setWorkspace(snapshot);
        setActiveProfile(snapshot.profiles.find(profile => profile.id === activeProfile)?.id ?? snapshot.profiles[0]?.id ?? "default");
        setActiveSession(snapshot.sessions[0]?.id ?? "");
        setExpandedProfiles(current => current.length ? current : [snapshot.profiles[0]?.id ?? "default"]);
      })
      .catch(error => setLoadError(error instanceof Error ? error.message : "Hermes Gateway connection failed."));
    return () => adapter.close();
  }, [demoMode, gatewayRetry, publicBasePath]);

  const session = useMemo(
    () => workspace.sessions.find(item => item.id === activeSession) ?? workspace.sessions[0],
    [activeSession, workspace.sessions]
  );

  useEffect(() => {
    const selected = workspace.sessions.find(item => item.id === activeSession);
    if (!selected || workspace.gatewayState !== "connected" || !liveAdapter.current || liveAdapter.current.isLiveSession(selected) || selected.persistence === "draft") return;
    void openSession(selected);
  }, [activeSession, workspace.gatewayState]);

  async function createSession() {
    if (!liveAdapter.current || creatingSession) return;
    setCreatingSession(true);
    setActionError(null);
    try {
      const profile = workspace.profiles.find(item => item.id === activeProfile);
      if (profile) liveAdapter.current.setProfile(profile);
      const created = await liveAdapter.current.createSession(handleGatewayEvent);
      setWorkspace(current => ({ ...current, sessions: [created, ...current.sessions] }));
      setActiveProfile(created.profileId);
      setActiveSession(created.id);
      setActivePanel("chat");
      setNavigationOpen(false);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Could not create a Hermes session.");
    } finally {
      setCreatingSession(false);
    }
  }

  async function openSession(selected: HermesSession) {
    if (!liveAdapter.current) return;
    const request = ++openRequest.current;
    setOpeningSession(true);
    setActionError(null);
    try {
      const profile = workspace.profiles.find(item => item.id === selected.profileId);
      if (profile) liveAdapter.current.setProfile(profile);
      const resumed = await liveAdapter.current.resumeSession(selected.id, handleGatewayEvent);
      if (request !== openRequest.current) return;
      setWorkspace(current => ({ ...current, sessions: current.sessions.map(item => item.id === selected.id ? { ...item, ...resumed, title: item.title } : item) }));
    } catch (error) {
      if (request === openRequest.current) setActionError(error instanceof Error ? error.message : "Could not open the Hermes session.");
    } finally {
      if (request === openRequest.current) setOpeningSession(false);
    }
  }

  async function sendMessage(text: string, options: SendMessageOptions = {}) {
    if (!liveAdapter.current || !session || sendingMessage || !text.trim()) return;
    setSendingMessage(true);
    setActionError(null);
    const at = new Intl.DateTimeFormat("ko-KR", { timeStyle: "short" }).format(new Date());
    const message = text.trim();
    const messageId = makeId("user");
    if (options.visible !== false) setWorkspace(current => updateSession(current, session.runtimeId ?? session.id, item => ({ ...item, status: "working", activeAssistantId: undefined, messages: [...item.messages, { ...makeMessage("user", nextSequence(item), at, [{ id: makeId("text"), type: "text", content: message }]), id: messageId }] })));
    else setWorkspace(current => updateSession(current, session.runtimeId ?? session.id, item => ({ ...item, status: "working" })));
    try {
      if (message.startsWith("/")) {
        const output = await liveAdapter.current.executeSlash(session, message);
        setWorkspace(current => updateSession(current, session.runtimeId ?? session.id, item => ({ ...item, status: "idle", activeAssistantId: undefined, messages: output && options.visible !== false ? [...item.messages, makeMessage("assistant", nextSequence(item), at, [{ id: makeId("text"), type: "text", content: output }])] : item.messages })));
      } else {
        await liveAdapter.current.submitPrompt(session, message);
        setWorkspace(current => updateSession(current, session.runtimeId ?? session.id, item => ({ ...item, persistence: "stored" })));
      }
    } catch (error) {
      setWorkspace(current => updateSession(current, session.runtimeId ?? session.id, item => ({ ...item, status: "idle", activeAssistantId: undefined, messages: item.messages.filter(entry => entry.id !== messageId) })));
      setActionError(error instanceof Error ? error.message : "Could not send the Hermes message.");
    } finally {
      setSendingMessage(false);
    }
  }

  async function steerMessage(text: string) {
    if (!liveAdapter.current || !session || !text.trim()) throw new Error("Open the active Hermes session before steering it.");
    setActionError(null);
    try {
      await liveAdapter.current.steerPrompt(session, text.trim());
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Could not steer the active Hermes turn.");
      throw error;
    }
  }

  async function undoLastTurn() {
    if (!liveAdapter.current || !session || session.status === "working") throw new Error("Wait for Hermes to finish before editing the last message.");
    const lastUserIndex = session.messages.map(message => message.role).lastIndexOf("user");
    if (lastUserIndex < 0) return;
    setActionError(null);
    try {
      await liveAdapter.current.undoLastTurn(session);
      setWorkspace(current => updateSession(current, session.runtimeId ?? session.id, item => ({ ...item, activeAssistantId: undefined, status: "idle", messages: item.messages.slice(0, lastUserIndex) })));
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Could not edit the last Hermes message.");
      throw error;
    }
  }

  async function renameSession(sessionToRename: HermesSession, title: string) {
    if (!liveAdapter.current || !title.trim()) return;
    setActionError(null);
    try {
      await liveAdapter.current.renameSession(sessionToRename, title.trim());
      setWorkspace(current => ({ ...current, sessions: current.sessions.map(item => item.id === sessionToRename.id ? { ...item, title: title.trim() } : item) }));
    } catch (error) { setActionError(error instanceof Error ? error.message : "Could not rename the Hermes session."); throw error; }
  }

  async function archiveSession(sessionToArchive: HermesSession) {
    if (!liveAdapter.current) return;
    setActionError(null);
    try {
      await liveAdapter.current.archiveSession(sessionToArchive, true);
      liveAdapter.current.close();
      setWorkspace(current => ({ ...current, sessions: current.sessions.filter(item => item.id !== sessionToArchive.id) }));
      setActiveSession("");
    } catch (error) { setActionError(error instanceof Error ? error.message : "Could not archive the Hermes session."); throw error; }
  }

  async function deleteSession(sessionToDelete: HermesSession) {
    if (!liveAdapter.current) return;
    setActionError(null);
    try {
      await liveAdapter.current.deleteSession(sessionToDelete);
      liveAdapter.current.close();
      setWorkspace(current => ({ ...current, sessions: current.sessions.filter(item => item.id !== sessionToDelete.id) }));
      setActiveSession("");
    } catch (error) { setActionError(error instanceof Error ? error.message : "Could not delete the Hermes session."); throw error; }
  }

  async function exportSession(sessionToExport: HermesSession) {
    if (!liveAdapter.current) return;
    setActionError(null);
    try {
      const blob = await liveAdapter.current.exportSession(sessionToExport);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url; link.download = `${sessionToExport.title || sessionToExport.id}.json`; link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (error) { setActionError(error instanceof Error ? error.message : "Could not export the Hermes session."); throw error; }
  }

  async function respondToApproval(choice: HermesApprovalRequest["choices"][number]) {
    if (!liveAdapter.current || !session?.approval || approvalChoice) return;
    setApprovalChoice(choice);
    setActionError(null);
    try {
      await liveAdapter.current.respondToApproval(session, choice);
      setWorkspace(current => updateSession(current, session.runtimeId ?? session.id, item => ({ ...item, approval: undefined })));
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Could not respond to the Hermes approval.");
    } finally {
      setApprovalChoice(null);
    }
  }

  function retryGateway() {
    setLoadError(null);
    setActionError(null);
    setGatewayRetry(current => current + 1);
  }

  function toggleProfile(profileId: string) {
    const profile = workspace.profiles.find(item => item.id === profileId);
    if (profile) liveAdapter.current?.setProfile(profile);
    setActiveProfile(profileId);
    setExpandedProfiles(current => current.includes(profileId) ? current.filter(item => item !== profileId) : [...current, profileId]);
  }

  function selectSession(profileId: string, sessionId: string) {
    const profile = workspace.profiles.find(item => item.id === profileId);
    if (profile) liveAdapter.current?.setProfile(profile);
    setActivePanel("chat");
    setActiveProfile(profileId);
    setActiveSession(sessionId);
    setExpandedProfiles(current => current.includes(profileId) ? current : [...current, profileId]);
    setNavigationOpen(false);
  }

  function stopWork() {
    void sendMessage("/stop", { visible: false });
  }

  function handleGatewayEvent(event: HermesGatewayEvent) {
    if (event.type === "connection.closed") {
      setActionError("Hermes connection closed. Your draft is kept; reload this session to continue.");
      setWorkspace(current => updateSession(current, event.sessionId, item => failActiveTools(item, "Connection closed before this tool completed.")));
      return;
    }
    if (event.type === "message.start") {
      setWorkspace(current => updateSession(current, event.sessionId, item => reduceGatewayEvent(item, event, session => beginAssistantTurn(session, gatewayTurnId(event), gatewayEventTime(event)))));
      return;
    }
    if (event.type === "session.info") {
      const model = typeof event.payload.model === "string" ? event.payload.model : undefined;
      const modelProvider = typeof event.payload.provider === "string" ? event.payload.provider : undefined;
      const reasoningEffort = typeof event.payload.reasoning_effort === "string" && (["none", "minimal", "low", "medium", "high", "xhigh", "max", "ultra"] as string[]).includes(event.payload.reasoning_effort)
        ? event.payload.reasoning_effort as HermesReasoningEffort
        : undefined;
      setWorkspace(current => updateSession(current, event.sessionId, item => reduceGatewayEvent(item, event, session => ({ ...session, ...(model ? { model } : {}), ...(modelProvider ? { modelProvider } : {}), ...(reasoningEffort ? { reasoningEffort } : {}) }))));
      return;
    }
    if (event.type === "reasoning.delta" || event.type === "reasoning.available") {
      const text = typeof event.payload.text === "string" ? event.payload.text : "";
      if (!text) return;
      setWorkspace(current => updateSession(current, event.sessionId, item => reduceGatewayEvent(item, event, session => appendReasoning(session, text, event.type === "reasoning.available", gatewayTurnId(event)))));
      return;
    }
    if (event.type === "message.delta") {
      const text = typeof event.payload.text === "string" ? event.payload.text : "";
      if (!text) return;
      setWorkspace(current => updateSession(current, event.sessionId, item => reduceGatewayEvent(item, event, session => appendText(session, text, gatewayTurnId(event)))));
      return;
    }
    if (event.type === "message.interim") {
      const text = typeof event.payload.text === "string" ? event.payload.text : "";
      if (!text) return;
      setWorkspace(current => updateSession(current, event.sessionId, item => reduceGatewayEvent(item, event, session => sealInterimAssistantTurn(session, text, gatewayEventTime(event), gatewayTurnId(event)))));
      return;
    }
    if (event.type === "message.complete") {
      const text = typeof event.payload.text === "string" ? event.payload.text : "";
      setWorkspace(current => updateSession(current, event.sessionId, item => reduceGatewayEvent(item, event, session => completeAssistantTurn(session, text, gatewayEventTime(event), gatewayTurnId(event)))));
      return;
    }
    if (event.type === "error") {
      const message = typeof event.payload.message === "string" ? event.payload.message : "Hermes Gateway reported an error.";
      setActionError(message);
      setWorkspace(current => updateSession(current, event.sessionId, item => reduceGatewayEvent(item, event, session => failActiveTools(session, message, gatewayTurnId(event)))));
      return;
    }
    if (event.type === "tool.start" || event.type === "tool.complete") {
      const id = typeof event.payload.tool_id === "string" ? event.payload.tool_id : "";
      const name = typeof event.payload.name === "string" ? event.payload.name : "tool";
      if (!id) return;
      const suppliedContext = typeof event.payload.context === "string" ? event.payload.context : typeof event.payload.summary === "string" ? event.payload.summary : "";
      const detail = toolEventDetail(event.payload);
      const error = typeof event.payload.error === "string" ? event.payload.error : undefined;
      const elapsedMs = typeof event.payload.elapsed_ms === "number" ? event.payload.elapsed_ms : typeof event.payload.duration_s === "number" ? event.payload.duration_s * 1000 : undefined;
      setWorkspace(current => updateSession(current, event.sessionId, item => reduceGatewayEvent(item, event, session => {
        const existing = session.messages.find(message => message.turnId === gatewayTurnId(event))?.parts.find(part => part.type === "tool" && part.tool.id === id)
          ?? session.messages.flatMap(message => message.parts).find(part => part.type === "tool" && part.tool.id === id);
        const previous = existing?.type === "tool" ? existing.tool : undefined;
        const context = previous?.context ?? (isToolContextUseful(suppliedContext, name) ? suppliedContext : "");
        return upsertTool(session, { ...previous, id, name, context, detail, error, elapsedMs, status: event.type === "tool.start" ? "running" : "complete" }, gatewayTurnId(event));
      })));
      return;
    }
    if (event.type === "approval.request") {
      const choices = Array.isArray(event.payload.choices)
        ? event.payload.choices.filter((choice): choice is HermesApprovalRequest["choices"][number] => choice === "once" || choice === "session" || choice === "always" || choice === "deny")
        : [];
      setWorkspace(current => updateSession(current, event.sessionId, item => reduceGatewayEvent(item, event, session => ({ ...session, approval: { command: typeof event.payload.command === "string" ? event.payload.command : "Hermes action", description: typeof event.payload.description === "string" ? event.payload.description : "Hermes requests your approval.", choices: choices.length ? choices : ["deny"] } }))));
    }
  }

  const live = workspace.gatewayState === "connected";
  const signInHref = !demoMode && typeof window !== "undefined" && (publicBasePath
    ? window.location.pathname === publicBasePath || window.location.pathname.startsWith(`${publicBasePath}/`)
    : window.location.pathname === "/" || window.location.pathname === "")
    ? `${publicBasePath}/auth/login?provider=nous&next=${encodeURIComponent(`${publicBasePath}/`)}`
    : undefined;
  return <div className={`app-shell ${navigationCollapsed ? "navigation-collapsed" : ""}`}>
    <header className="topbar">
      <button className="mobile-menu" type="button" onClick={() => setNavigationOpen(true)} aria-label="Open sessions">Sessions</button>
      <div className="connection"><span className={`status-dot ${loadError ? "warning" : ""}`} />{loadError ?? `${workspace.gatewayState} / Hermes-owned`}</div>
    </header>
    {navigationOpen && <button className="navigation-backdrop" type="button" aria-label="Close sessions" onClick={() => setNavigationOpen(false)} />}
    <aside className={`navigation ${navigationOpen ? "open" : ""}`}>
      <div className="navigation-head"><img className="brand-logo" src="./myosotis-logo.png" alt="Hermes logo" /><div><strong className="brand-name">Hermes Web UI MSG</strong></div><button className="collapse" type="button" onClick={() => setNavigationCollapsed(value => !value)} aria-label={navigationCollapsed ? "Expand sidebar" : "Collapse sidebar"}>{navigationCollapsed ? "+" : "-"}</button><button className="drawer-close" type="button" onClick={() => setNavigationOpen(false)} aria-label="Close sessions">Close</button></div>
      <Navigation workspace={workspace} adapter={settingsAdapter} activePanel={activePanel} activeProfile={activeProfile} activeSession={activeSession} expandedProfiles={expandedProfiles} live={live} canShowSettings={live || demoMode} creatingSession={creatingSession} onCreateSession={createSession} onOpenCron={() => { setActivePanel("cron"); setNavigationOpen(false); }} onOpenSettings={() => { setSettingsOpen(true); setNavigationOpen(false); }} onProfile={toggleProfile} onSession={selectSession} />
    </aside>
    <main className="main-panel">{settingsOpen && <SettingsSheet adapter={settingsAdapter} skin={skin} onSkinChange={setSkin} onClose={() => setSettingsOpen(false)} onWorkspaceChanged={retryGateway} />}{activePanel === "cron" ? <EnhancedCronPanel adapter={settingsAdapter} profiles={workspace.profiles} activeProfile={activeProfile} onClose={() => setActivePanel("chat")} /> : <div className={`workspace-layout${workspaceRailOpen ? "" : " rail-closed"}`} style={{ "--workspace-rail-width": `${workspaceRailWidth}px` } as CSSProperties}><WorkspaceChatPanel workspace={workspace} profileId={activeProfile} session={session} adapter={settingsAdapter} loadError={loadError ?? actionError} signInHref={signInHref} openingSession={openingSession} sendingMessage={sendingMessage} approvalChoice={approvalChoice} filesOpen={workspaceRailOpen} onToggleFiles={() => setWorkspaceRailOpen(value => !value)} onRetryGateway={retryGateway} onBrowseSessions={() => setNavigationOpen(true)} onSendMessage={sendMessage} onSteerMessage={steerMessage} onUndoLastTurn={undoLastTurn} onStopWork={stopWork} onRespondToApproval={respondToApproval} onRenameSession={renameSession} onArchiveSession={archiveSession} onDeleteSession={deleteSession} onExportSession={exportSession} />{workspaceRailOpen && <><div className="workspace-rail-resizer" role="separator" aria-label="Resize files panel" aria-orientation="vertical" aria-valuemin={workspaceRailMinWidth} aria-valuemax={workspaceRailMaxWidth} aria-valuenow={workspaceRailWidth} tabIndex={0} onPointerDown={beginRailResize} onPointerMove={resizeRail} onPointerUp={finishRailResize} onPointerCancel={finishRailResize} onKeyDown={event => { if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return; event.preventDefault(); setWorkspaceRailWidth(current => Math.max(workspaceRailMinWidth, Math.min(workspaceRailMaxWidth, current + (event.key === "ArrowLeft" ? 16 : -16)))); }} /><WorkspaceRail adapter={settingsAdapter} onClose={() => setWorkspaceRailOpen(false)} /></>}</div>}</main>
  </div>;
}

function Navigation({ workspace, adapter, activePanel, activeProfile, activeSession, expandedProfiles, live, canShowSettings, creatingSession, onCreateSession, onOpenCron, onOpenSettings, onProfile, onSession }: { workspace: HermesWorkspaceSnapshot; adapter: SameOriginHermesAdapter | null; activePanel: "chat" | "cron"; activeProfile: string; activeSession: string; expandedProfiles: string[]; live: boolean; canShowSettings: boolean; creatingSession: boolean; onCreateSession: () => void; onOpenCron: () => void; onOpenSettings: () => void; onProfile: (id: string) => void; onSession: (profileId: string, sessionId: string) => void }) {
  const [query, setQuery] = useState("");
  const [searchHits, setSearchHits] = useState<HermesSessionSearchResult[] | null>(null);
  const [profilesOpen, setProfilesOpen] = useState(false);
  const defaultProfile = workspace.profiles.find(profile => profile.id === "default") ?? workspace.profiles[0];
  const auxiliaryProfiles = workspace.profiles.filter(profile => profile.id !== defaultProfile?.id);
  useEffect(() => {
    if (!query.trim() || !adapter) { setSearchHits(null); return; }
    const timer = window.setTimeout(() => void adapter.searchSessions(query.trim()).then(setSearchHits).catch(() => setSearchHits(null)), 220);
    return () => window.clearTimeout(timer);
  }, [query, adapter]);
  const sessionsFor = (profileId: string) => {
    const all = workspace.sessions.filter(item => item.profileId === profileId);
    const matches = searchHits ? searchHits.filter(item => item.profileId === profileId) : all.filter(item => item.title.toLowerCase().includes(query.trim().toLowerCase()));
    return { all, visible: [...matches].sort((a, b) => Number(b.status === "working") - Number(a.status === "working")) };
  };
  const defaultSessions = defaultProfile ? sessionsFor(defaultProfile.id) : { all: [], visible: [] };
  const showProfiles = profilesOpen || Boolean(query.trim());

  return <div className="tree"><div className="tree-primary"><div className="tree-actions">{live && <button className="sidebar-new-session" type="button" onClick={onCreateSession} disabled={creatingSession}>{creatingSession ? "Creating..." : "+ New session"}</button>}<label className="session-search"><span>Search sessions</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Find in chats" /></label></div>{defaultProfile && <section className="default-sessions"><div className="tree-label">Sessions <small>{query ? `${defaultSessions.visible.length}/${defaultSessions.all.length}` : defaultSessions.all.length}</small></div><SessionRows sessions={defaultSessions.visible} profileId={defaultProfile.id} activeSession={activeSession} emptyLabel={query ? "No matching sessions." : "No sessions yet."} onSession={onSession} /></section>}<section className="profiles-toggle"><button type="button" onClick={() => setProfilesOpen(value => !value)} aria-expanded={showProfiles}>Profiles <small>{auxiliaryProfiles.length}</small><span>{showProfiles ? "−" : "+"}</span></button>{showProfiles && auxiliaryProfiles.map(profile => { const sessions = sessionsFor(profile.id); const expanded = expandedProfiles.includes(profile.id); return <section className="profile-node" key={profile.id}><button type="button" className={`profile-row ${profile.id === activeProfile ? "selected" : ""}`} onClick={() => onProfile(profile.id)} aria-expanded={expanded}><span className={`status-dot ${profile.gateway === "stopped" ? "warning" : ""}`} /><span>{profile.label}</span><small>{profile.model}</small><span className="profile-chevron">{expanded ? "−" : "+"}</span></button>{expanded && <div className="session-list"><div className="tree-label inline">Sessions <small>{query ? `${sessions.visible.length}/${sessions.all.length}` : sessions.all.length}</small></div><SessionRows sessions={sessions.visible} profileId={profile.id} activeSession={activeSession} emptyLabel={query ? "No matching sessions." : "No sessions yet."} onSession={onSession} /></div>}</section>; })}</section></div><div className="sidebar-footer">{live && <button className={`sidebar-cron ${activePanel === "cron" ? "selected" : ""}`} type="button" onClick={onOpenCron}>Cron jobs</button>}{canShowSettings && <button className="sidebar-settings" type="button" onClick={onOpenSettings}>Settings</button>}</div></div>;
}

function SessionRows({ sessions, profileId, activeSession, emptyLabel, onSession }: { sessions: HermesSessionSearchResult[]; profileId: string; activeSession: string; emptyLabel: string; onSession: (profileId: string, sessionId: string) => void }) {
  return <div className="session-scroll">{sessions.map(item => <div className={`session-item ${item.id === activeSession ? "selected" : ""}`} key={`${profileId}:${item.id}`}><button type="button" onClick={() => onSession(profileId, item.id)} className="session-row"><span className={item.status === "working" ? "pulse" : "session-mark"} /><span>{item.title}</span><small className={item.snippet ? "session-snippet" : undefined}>{item.snippet || item.preview || item.updatedAt}</small></button></div>)}{sessions.length === 0 && <p className="tree-empty">{emptyLabel}</p>}</div>;
}

function WorkspaceChatPanel({ workspace, profileId, session, adapter, loadError, signInHref, openingSession, sendingMessage, approvalChoice, filesOpen, onToggleFiles, onRetryGateway, onBrowseSessions, onSendMessage, onSteerMessage, onUndoLastTurn, onStopWork, onRespondToApproval, onRenameSession, onArchiveSession, onDeleteSession, onExportSession }: { workspace: HermesWorkspaceSnapshot; profileId: string; session: HermesSession | undefined; adapter: SameOriginHermesAdapter | null; loadError: string | null; signInHref?: string; openingSession: boolean; sendingMessage: boolean; approvalChoice: HermesApprovalRequest["choices"][number] | null; filesOpen: boolean; onToggleFiles: () => void; onRetryGateway: () => void; onBrowseSessions: () => void; onSendMessage: (text: string, options?: SendMessageOptions) => Promise<void>; onSteerMessage: (text: string) => Promise<void>; onUndoLastTurn: () => Promise<void>; onStopWork: () => void; onRespondToApproval: (choice: HermesApprovalRequest["choices"][number]) => void; onRenameSession: (session: HermesSession, title: string) => Promise<void>; onArchiveSession: (session: HermesSession) => Promise<void>; onDeleteSession: (session: HermesSession) => Promise<void>; onExportSession: (session: HermesSession) => Promise<void> }) {
  const live = workspace.gatewayState === "connected";
  const showNewSessionWelcome = Boolean(session && session.messages.length === 0 && !openingSession && !session.approval);
  const transcriptRef = useRef<HTMLElement | null>(null);
  const transcriptContentRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const restoreComposerFocusRef = useRef(false);
  const [draft, setDraft] = useState("");
  const [savedDraft, setSavedDraft] = useState("");
  const [attachments, setAttachments] = useState<Array<{ kind: "image"; path: string; name: string } | { kind: "pdf"; name: string }>>([]);
  const [commands, setCommands] = useState<HermesSlashCommand[]>([]);
  const [referencePickerOpen, setReferencePickerOpen] = useState(false);
  const [referenceKind, setReferenceKind] = useState<"file" | "folder" | "url">("file");
  const [referenceValue, setReferenceValue] = useState("");
  const [models, setModels] = useState<HermesModelOption[]>([]);
  const [sessionModel, setSessionModel] = useState("");
  const [uploading, setUploading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showJump, setShowJump] = useState(false);
  const [queuedDrafts, setQueuedDrafts] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number | null>(null);
  const queueSessionIdRef = useRef(session?.id ?? "none");
  const followLatestRef = useRef(true);
  const draftKey = `hermes-workspace-draft.${session?.id ?? "none"}`;
  const queueKey = `hermes-workspace-queue.${session?.id ?? "none"}`;
  const working = session?.status === "working";
  const canSend = Boolean(live && session?.runtimeId && draft.trim() && !sendingMessage && !openingSession && !uploading);
  const userHistory = useMemo(() => (session?.messages ?? []).filter(message => message.role === "user").map(messageText).filter(Boolean).reverse(), [session?.messages]);
  // A message owns its reasoning, tools, and answer in source order. The
  // transcript follows structural turn changes; a ResizeObserver below covers
  // streamed content growth without treating the reasoning panel's own scroll
  // position as a transcript scroll event.
  const turnVersion = useMemo(() => (session?.messages ?? []).map(message => `${message.id}:${message.parts.length}:${message.pending ? 1 : 0}:${message.at}`).join("|"), [session?.messages]);
  const lastVisibleMessage = [...(session?.messages ?? [])].reverse().find(message => message.role === "user" || hasVisibleAssistantPart(message));
  const turnFinalAssistantIds = useMemo(() => {
    const ids = new Set<string>();
    let candidate: HermesSession["messages"][number] | undefined;
    for (const message of session?.messages ?? []) {
      if (message.role === "user") {
        if (candidate) ids.add(candidate.id);
        candidate = undefined;
      } else if (!message.interim && messageText(message).trim()) {
        candidate = message;
      }
    }
    if (candidate) ids.add(candidate.id);
    return ids;
  }, [session?.messages]);
  const activeAssistant = session?.activeAssistantId ? session.messages.find(message => message.id === session.activeAssistantId) : undefined;
  const showResponseLoader = Boolean(working && (!activeAssistant || !hasVisibleAssistantPart(activeAssistant)) && lastVisibleMessage?.role === "user");

  function scrollToLatest(behavior: ScrollBehavior = "auto") {
    const element = transcriptRef.current;
    if (!element) return;
    followLatestRef.current = true;
    setShowJump(false);
    element.scrollTo({ top: element.scrollHeight, behavior });
  }
  function followAfterUserInput() {
    followLatestRef.current = true;
    setShowJump(false);
    requestAnimationFrame(() => scrollToLatest());
  }

  useLayoutEffect(() => {
    setAttachments([]);
    const storedDraft = window.localStorage.getItem(`hermes-workspace-draft.${session?.id ?? "none"}`) ?? "";
    setDraft(storedDraft);
    setSavedDraft(storedDraft);
    followLatestRef.current = true;
    setShowJump(false);
    queueSessionIdRef.current = session?.id ?? "none";
    try {
      const storedQueue = JSON.parse(window.localStorage.getItem(`hermes-workspace-queue.${session?.id ?? "none"}`) ?? "[]");
      setQueuedDrafts(Array.isArray(storedQueue) ? storedQueue.filter((item): item is string => typeof item === "string" && Boolean(item.trim())) : []);
    } catch { setQueuedDrafts([]); }
    setHistoryIndex(null);
    const frame = requestAnimationFrame(() => scrollToLatest());
    return () => cancelAnimationFrame(frame);
  }, [session?.id]);
  useEffect(() => {
    if (!live || !session?.runtimeId || openingSession) return;
    const frame = requestAnimationFrame(() => composerRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [live, session?.id, session?.runtimeId, openingSession]);
  useEffect(() => {
    if (!restoreComposerFocusRef.current || working || sendingMessage || openingSession || uploading) return;
    restoreComposerFocusRef.current = false;
    const frame = requestAnimationFrame(() => composerRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [working, sendingMessage, openingSession, uploading]);
  useEffect(() => {
    if (working || sendingMessage || openingSession || !session || queuedDrafts.length === 0) return;
    const [next, ...rest] = queuedDrafts;
    setQueuedDrafts(rest);
    restoreComposerFocusRef.current = true;
    void onSendMessage(next).catch(error => setActionError(error instanceof Error ? error.message : "Could not send queued message."));
  }, [working, sendingMessage, openingSession, queuedDrafts, session, onSendMessage]);
  useEffect(() => {
    const timer = window.setTimeout(() => window.localStorage.setItem(draftKey, draft), 180);
    return () => window.clearTimeout(timer);
  }, [draft, draftKey]);
  useEffect(() => {
    if (queueSessionIdRef.current !== (session?.id ?? "none")) return;
    if (queuedDrafts.length) window.localStorage.setItem(queueKey, JSON.stringify(queuedDrafts));
    else window.localStorage.removeItem(queueKey);
  }, [queuedDrafts, queueKey, session?.id]);
  useEffect(() => {
    if (!draft.trim().startsWith("/") || !adapter) { setCommands([]); return; }
    const timer = window.setTimeout(() => void adapter.completeSlash(draft.trim()).then(setCommands).catch(() => setCommands([])), 160);
    return () => window.clearTimeout(timer);
  }, [draft, adapter]);
  useEffect(() => {
    function pasteImage(event: ClipboardEvent) {
      const target = document.activeElement;
      if (!live || !session?.runtimeId || target?.getAttribute("aria-label") !== "Message") return;
      const images = Array.from(event.clipboardData?.files ?? []).filter(file => file.type.startsWith("image/"));
      if (!images.length) return;
      event.preventDefault();
      void attachFiles(images);
    }
    document.addEventListener("paste", pasteImage);
    return () => document.removeEventListener("paste", pasteImage);
  }, [live, session?.runtimeId, adapter]);
  useEffect(() => {
    if (!adapter || !live) return;
    let cancelled = false;
    void Promise.all([adapter.getModelSettings(), adapter.getModelOptions()]).then(([settings, options]) => {
      if (cancelled) return;
      const shortlist = JSON.parse(window.localStorage.getItem(modelShortlistKey) ?? "[]") as string[];
      const sessionOption = session?.model ? options.find(option => option.model === session.model && (!session.modelProvider || option.provider === session.modelProvider)) : undefined;
      setSessionModel(sessionOption ? modelId(sessionOption) : modelId({ provider: settings.provider, model: settings.model }));
      setModels(shortlist.length ? options.filter(option => shortlist.includes(modelId(option))) : options);
    }).catch(() => { if (!cancelled) { setModels([]); setSessionModel(""); } });
    return () => { cancelled = true; };
  }, [adapter, live, profileId, session?.id, session?.model, session?.modelProvider]);
  useLayoutEffect(() => {
    if (followLatestRef.current) scrollToLatest();
  }, [turnVersion, session?.approval, openingSession, loadError]);
  useLayoutEffect(() => {
    const transcript = transcriptRef.current;
    const content = transcriptContentRef.current;
    if (!transcript || !content || typeof ResizeObserver === "undefined") return;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      if (!followLatestRef.current) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => transcript.scrollTo({ top: transcript.scrollHeight, behavior: "auto" }));
    });
    observer.observe(content);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); };
  }, [session?.id]);

  async function attachFiles(files: FileList | File[]) {
    if (!adapter || !session) return;
    const images = Array.from(files).filter(file => file.type.startsWith("image/"));
    const pdfs = Array.from(files).filter(file => file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"));
    if (!images.length && !pdfs.length) { setActionError("Only images and PDFs can be attached to Hermes."); return; }
    setUploading(true); setActionError(null);
    try {
      const uploadedImages = await Promise.all(images.map(file => adapter.uploadImage(file).then(item => ({ ...item, kind: "image" as const }))));
      const uploadedPdfs = await Promise.all(pdfs.map(file => adapter.attachPdf(session, file).then(item => ({ ...item, kind: "pdf" as const }))));
      setAttachments(current => [...current, ...uploadedImages, ...uploadedPdfs]);
    }
    catch (error) { setActionError(error instanceof Error ? error.message : "Image upload failed."); }
    finally { setUploading(false); }
  }
  async function submit() {
    if (!canSend || !session) return;
    followAfterUserInput();
    restoreComposerFocusRef.current = true;
    setActionError(null);
    const text = draft.trim();
    if (working) {
      setQueuedDrafts(current => [...current, text]);
      setDraft(""); setCommands([]); setHistoryIndex(null);
      return;
    }
    try {
      for (const attachment of attachments) if (attachment.kind === "image") await onSendMessage(`/image ${attachment.path}`, { visible: false });
      await onSendMessage(text);
      window.localStorage.removeItem(draftKey);
      setDraft(""); setAttachments([]); setCommands([]); setHistoryIndex(null);
    } catch (error) { setActionError(error instanceof Error ? error.message : "Could not send the message."); }
  }
  async function steerDraft() {
    if (!working || !draft.trim()) return;
    followAfterUserInput();
    restoreComposerFocusRef.current = true;
    setActionError(null);
    try {
      await onSteerMessage(draft.trim());
      setDraft(""); setCommands([]); setHistoryIndex(null);
    } catch (error) { setActionError(error instanceof Error ? error.message : "Could not steer the active response."); }
  }
  async function chooseSessionModel(optionId: string) {
    const option = models.find(item => modelId(item) === optionId);
    if (!option || optionId === sessionModel) return;
    setSessionModel(optionId);
    try { await onSendMessage(`/model ${option.model} --provider ${option.provider} --session`, { visible: false }); }
    catch (error) { setActionError(error instanceof Error ? error.message : "Could not set the session model."); }
  }
  async function editLastUserMessage() {
    const last = [...(session?.messages ?? [])].reverse().find(message => message.role === "user");
    if (!last) return;
    setActionError(null);
    try {
      await onUndoLastTurn();
      setDraft(messageText(last));
      requestAnimationFrame(() => composerRef.current?.focus());
    } catch (error) { setActionError(error instanceof Error ? error.message : "Could not edit the last message."); }
  }
  function insertReference() {
    setReferencePickerOpen(true);
  }
  function addReference() {
    const value = referenceValue.trim();
    if (!value) return;
    const formatted = /[\s()[\]{}<>"'`]/.test(value) && !value.includes("`") ? `\`${value}\`` : value;
    setDraft(current => `${current}${current && !/\s$/.test(current) ? " " : ""}@${referenceKind}:${formatted}`);
    setReferenceValue("");
    setReferencePickerOpen(false);
    requestAnimationFrame(() => composerRef.current?.focus());
  }
  function editQueued(index: number) {
    const message = queuedDrafts[index];
    if (message === undefined) return;
    setQueuedDrafts(current => current.filter((_, position) => position !== index));
    setDraft(message);
    requestAnimationFrame(() => composerRef.current?.focus());
  }
  function moveQueued(index: number, direction: -1 | 1) {
    setQueuedDrafts(current => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }
  function onTranscriptScroll(event: UIEvent<HTMLElement>) {
    if (event.target !== event.currentTarget) return;
    const element = event.currentTarget;
    const distanceToBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
    const followingLatest = distanceToBottom <= 48;
    followLatestRef.current = followingLatest;
    setShowJump(!followingLatest);
  }

  function restoreHistory(direction: -1 | 1) {
    if (!userHistory.length) return;
    const current = historyIndex ?? -1;
    const next = Math.max(-1, Math.min(userHistory.length - 1, current + direction));
    setHistoryIndex(next);
    if (next >= 0) setDraft(userHistory[next]);
  }

  return <div className="workspace-content hermes-content">
    <section className="content-head"><div><h1>{session?.title ?? (live ? "New conversation" : "Hermes Workspace")}</h1></div><div className="head-actions">{session && session.persistence !== "draft" && <SessionActions session={session} onRename={onRenameSession} onArchive={onArchiveSession} onDelete={onDeleteSession} onExport={onExportSession} />}<button className="quiet-action files-panel-toggle" type="button" onClick={onToggleFiles} aria-pressed={filesOpen}>{filesOpen ? "Hide files" : "Files"}</button><button className="browse-sessions" type="button" onClick={onBrowseSessions}>Sessions</button></div></section>
    {loadError ? <section className="empty-state"><strong>Gateway connection unavailable</strong><p>{loadError}</p><div className="empty-actions"><button className="new-session" type="button" onClick={onRetryGateway}>Retry connection</button>{signInHref && <a className="quiet-action" href={signInHref}>Sign in to Hermes</a>}</div></section> : <section ref={transcriptRef} className="chat-transcript" aria-label="Conversation" onScroll={onTranscriptScroll}><div ref={transcriptContentRef} className="chat-transcript-content">
      {showNewSessionWelcome && <section className="new-session-welcome"><img src="./hermes-session-hero.png" alt="" /></section>}
      {(session?.messages ?? []).map(message => <TranscriptMessage key={message.id} message={message} messageKey={message.id} showActions={turnFinalAssistantIds.has(message.id)} />)}
      {showResponseLoader && <div className="assistant-working" role="status"><span className="pulse" />Thinking<span className="stream-cursor" aria-hidden="true" /></div>}
      {session?.approval && <article className="approval-card"><span className="eyebrow">Hermes approval</span><strong>{session.approval.command}</strong><p>{session.approval.description}</p><small>This choice is recorded by Hermes for this requested action.</small><div className="approval-actions">{session.approval.choices.map(choice => <button className={`approval-choice ${choice}`} key={choice} type="button" onClick={() => onRespondToApproval(choice)} disabled={Boolean(approvalChoice)}><span>{approvalChoice === choice ? "Responding..." : choice}</span><small>{approvalCopy[choice]}</small></button>)}</div></article>}
      {live && openingSession && <div className="empty-state"><strong>Opening session</strong><p>Hermes is loading the source transcript.</p></div>}
      {!session && <div className="empty-state"><strong>{live ? "Choose or create a session" : "Sign in to Hermes"}</strong><p>{live ? "Select a session from the sidebar, or start a new one." : "Your data remains in Hermes. This workspace does not show substitute mock conversations."}</p></div>}
    </div></section>}
    <div className="jump-latest-slot">{showJump && <button className="jump-latest" type="button" onClick={() => scrollToLatest()}>Jump to latest</button>}</div>
    {queuedDrafts.length > 0 && <section className="queued-messages" aria-label="Queued messages"><span>Queued {queuedDrafts.length}</span>{queuedDrafts.map((item, index) => <div key={`${index}-${item}`}><p title={item}>{item}</p><div className="queued-message-actions"><button type="button" aria-label="Move queued message earlier" disabled={index === 0} onClick={() => moveQueued(index, -1)}>↑</button><button type="button" aria-label="Move queued message later" disabled={index === queuedDrafts.length - 1} onClick={() => moveQueued(index, 1)}>↓</button><button type="button" className="queue-edit" aria-label="Edit queued message" onClick={() => editQueued(index)}>Edit</button><button type="button" aria-label="Remove queued message" onClick={() => setQueuedDrafts(current => current.filter((_, position) => position !== index))}>×</button></div></div>)}</section>}
    <form className="composer workspace-composer" onSubmit={event => { event.preventDefault(); void submit(); }} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); void attachFiles(event.dataTransfer.files); }}>
      <div className="composer-field">
        {commands.length > 0 && <div className="command-menu">{commands.map(command => <button type="button" key={command.text} onClick={() => { setDraft(command.text); setCommands([]); requestAnimationFrame(() => composerRef.current?.focus()); }}><strong>{command.text}</strong><span>{command.description}</span></button>)}</div>}
        {referencePickerOpen && <div className="reference-picker" role="dialog" aria-label="Add Hermes reference"><div><button type="button" className={referenceKind === "file" ? "selected" : ""} onClick={() => setReferenceKind("file")}>File</button><button type="button" className={referenceKind === "folder" ? "selected" : ""} onClick={() => setReferenceKind("folder")}>Folder</button><button type="button" className={referenceKind === "url" ? "selected" : ""} onClick={() => setReferenceKind("url")}>URL</button></div><input autoFocus value={referenceValue} onChange={event => setReferenceValue(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); addReference(); } if (event.key === "Escape") setReferencePickerOpen(false); }} placeholder={referenceKind === "url" ? "https://…" : referenceKind === "folder" ? "Folder path" : "File path"} /><button type="button" onClick={addReference} disabled={!referenceValue.trim()}>Add reference</button></div>}
        <textarea ref={composerRef} aria-label="Message" placeholder={live ? openingSession ? "Opening session..." : "Message" : "Sign in to use Hermes"} value={draft} onChange={event => { setDraft(event.target.value); setHistoryIndex(null); event.currentTarget.style.height = "auto"; event.currentTarget.style.height = `${Math.min(event.currentTarget.scrollHeight, 220)}px`; }} onKeyDown={event => { if (event.key === "Enter" && (event.ctrlKey || event.metaKey) && !event.shiftKey) { event.preventDefault(); void steerDraft(); return; } if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void submit(); } if ((event.key === "ArrowUp" || event.key === "ArrowDown") && !event.shiftKey && event.currentTarget.selectionStart === 0 && event.currentTarget.selectionEnd === 0) { event.preventDefault(); restoreHistory(event.key === "ArrowUp" ? 1 : -1); } if (event.key === "Escape") setCommands([]); }} disabled={!live || openingSession || !session?.runtimeId || sendingMessage || uploading} />
        {attachments.length > 0 && <div className="composer-attachments">{attachments.map(attachment => <button type="button" key={`${attachment.kind}-${attachment.name}`} onClick={() => setAttachments(current => current.filter(item => item !== attachment))}>{attachment.kind === "pdf" ? "PDF" : "Image"} · {attachment.name} ×</button>)}</div>}
        <div className="composer-tools"><button className="composer-attach" type="button" aria-label="Attach image or PDF" onClick={() => fileInputRef.current?.click()} disabled={!live || uploading || openingSession || Boolean(working)}>+</button><input ref={fileInputRef} className="visually-hidden" type="file" accept="image/*,application/pdf,.pdf" multiple onChange={event => { if (event.target.files) void attachFiles(event.target.files); event.currentTarget.value = ""; }} /><button className="composer-edit" type="button" onClick={insertReference} disabled={!live || openingSession}>@ Reference</button>{working && draft.trim() && <button className="composer-edit composer-steer" type="button" onClick={() => void steerDraft()} title="Ctrl/Cmd+Enter">Steer</button>}<button className="composer-edit" type="button" onClick={() => void editLastUserMessage()} disabled={working || !session?.messages.some(message => message.role === "user")}>Edit last</button>{savedDraft && !draft && <button className="composer-edit" type="button" onClick={() => { setDraft(savedDraft); requestAnimationFrame(() => composerRef.current?.focus()); }}>Restore draft</button>}</div>
      </div>
      <ComposerModelPicker key={session?.id} adapter={adapter} session={session} models={models} value={sessionModel} onSelect={chooseSessionModel} disabled={!live || openingSession || sendingMessage || working || models.length === 0} />
      <button className={`composer-send${working && !draft.trim() ? " composer-stop" : ""}`} type={working && !draft.trim() ? "button" : "submit"} onClick={working && !draft.trim() ? () => { restoreComposerFocusRef.current = true; onStopWork(); } : undefined} disabled={working && !draft.trim() ? !live : !canSend} aria-label={working && !draft.trim() ? "Stop generation" : working ? "Queue message" : "Send message"} title={working && !draft.trim() ? "Stop generation" : working ? "Queue message" : "Send message"}>{working && !draft.trim() ? "Stop" : sendingMessage ? "Sending..." : "Send"}</button>
    </form>
    {actionError && <p className="composer-error">{actionError}</p>}
  </div>;
}

function SessionActions({ session, onRename, onArchive, onDelete, onExport }: { session: HermesSession; onRename: (session: HermesSession, title: string) => Promise<void>; onArchive: (session: HermesSession) => Promise<void>; onDelete: (session: HermesSession) => Promise<void>; onExport: (session: HermesSession) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(session.title);
  const [saving, setSaving] = useState(false);
  useEffect(() => { setTitle(session.title); }, [session.id, session.title]);
  async function rename() {
    if (!title.trim() || title.trim() === session.title || saving) { setRenaming(false); return; }
    setSaving(true);
    try { await onRename(session, title); setRenaming(false); }
    finally { setSaving(false); }
  }
  async function archive() {
    if (!window.confirm(`Archive “${session.title}”? You can restore it in native Hermes.`)) return;
    setSaving(true);
    try { await onArchive(session); setOpen(false); }
    finally { setSaving(false); }
  }
  async function remove() {
    if (!window.confirm(`Delete “${session.title}”? This permanently removes the Hermes session.`)) return;
    setSaving(true);
    try { await onDelete(session); setOpen(false); }
    finally { setSaving(false); }
  }
  return <div className="session-actions"><button className="quiet-action session-actions-toggle" type="button" aria-label="Manage session" aria-expanded={open} onClick={() => setOpen(value => !value)}>•••</button>{open && <div className="session-actions-menu">{renaming ? <form onSubmit={event => { event.preventDefault(); void rename(); }}><input autoFocus value={title} onChange={event => setTitle(event.target.value)} aria-label="Session title" /><div><button className="quiet-action" type="submit" disabled={saving}>Save</button><button className="quiet-action" type="button" onClick={() => { setTitle(session.title); setRenaming(false); }} disabled={saving}>Cancel</button></div></form> : <><button type="button" onClick={() => setRenaming(true)}>Rename</button><button type="button" onClick={() => void onExport(session)} disabled={saving}>Export JSON</button><button type="button" onClick={() => void archive()} disabled={saving}>Archive</button><button className="danger-action" type="button" onClick={() => void remove()} disabled={saving}>Delete</button></>}</div>}</div>;
}

function ComposerModelPicker({ adapter, session, models, value, onSelect, disabled }: { adapter: SameOriginHermesAdapter | null; session: HermesSession | undefined; models: HermesModelOption[]; value: string; onSelect: (value: string) => Promise<void>; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [effort, setEffort] = useState<HermesReasoningEffort>("medium");
  const [reasoningError, setReasoningError] = useState("");
  const lastEnabledEffort = useRef<HermesReasoningEffort>("medium");
  const visibleModels = models.filter(option => `${option.providerLabel} ${option.model}`.toLowerCase().includes(query.trim().toLowerCase()));
  useEffect(() => {
    if (session?.reasoningEffort) {
      setEffort(session.reasoningEffort);
      if (session.reasoningEffort !== "none") lastEnabledEffort.current = session.reasoningEffort;
      return;
    }
    if (!adapter || !session?.runtimeId) return;
    void adapter.getSessionReasoning(session).then(current => { setEffort(current); if (current !== "none") lastEnabledEffort.current = current; }).catch(() => {});
  }, [adapter, session?.runtimeId, session?.reasoningEffort]);
  async function chooseModel(optionId: string) {
    await onSelect(optionId);
    setOpen(false);
  }
  async function chooseEffort(next: HermesReasoningEffort) {
    if (!adapter || !session) return;
    setReasoningError("");
    try {
      const confirmed = await adapter.setSessionReasoning(session, next);
      const current = await adapter.getSessionReasoning(session);
      if (current !== confirmed) throw new Error("Hermes did not confirm the requested thinking mode.");
      setEffort(current);
      if (current !== "none") lastEnabledEffort.current = current;
    } catch (error) { setReasoningError(error instanceof Error ? error.message : "Could not change reasoning mode."); }
  }
  return <div className="composer-model-picker"><button className="composer-model-trigger" type="button" aria-expanded={open} onClick={() => setOpen(current => !current)} disabled={disabled}>{value ? value.split("::").at(-1) : "Model"}</button>{open && <div className="composer-model-popover"><div className="model-picker-library"><input aria-label="Search models" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search models" autoFocus />{visibleModels.map(option => { const id = modelId(option); return <button className={id === value ? "selected" : ""} type="button" key={id} onClick={() => void chooseModel(id)}><span>{option.model}</span><small>{option.providerLabel}</small>{id === value && <b>✓</b>}</button>})}{visibleModels.length === 0 && <p>No matching models.</p>}</div><aside className="model-picker-options"><span>Options</span><button className="thinking-toggle" type="button" aria-pressed={effort !== "none"} onClick={() => void chooseEffort(effort === "none" ? lastEnabledEffort.current : "none")}><span>Thinking</span><i /></button><strong>Effort</strong>{(["minimal", "low", "medium", "high", "xhigh", "max", "ultra"] as HermesReasoningEffort[]).map(level => <button className={effort === level ? "selected" : ""} type="button" key={level} onClick={() => void chooseEffort(level)}>{level === "xhigh" ? "Extra high" : level}</button>)}{reasoningError && <p className="model-picker-error">{reasoningError}</p>}</aside></div>}</div>;
}

function CopyIcon() {
  return <svg viewBox="0 0 16 16" aria-hidden="true"><rect x="5" y="5" width="8" height="8" rx="1" /><path d="M3 11H2a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v1" /></svg>;
}

function TranscriptMessage({ message, showActions }: { message: HermesSession["messages"][number]; messageKey: string; showActions: boolean }) {
  if (message.role === "assistant" && !hasVisibleAssistantPart(message)) return null;
  const text = messageText(message);
  const parts: ReactNode[] = [];
  for (let index = 0; index < message.parts.length; index += 1) {
    const part = message.parts[index];
    if (part.type === "reasoning") {
      const group = [part];
      while (message.parts[index + 1]?.type === "reasoning") group.push(message.parts[++index] as Extract<typeof part, { type: "reasoning" }>);
      parts.push(<ReasoningMessage key={group.map(item => item.id).join("-")} content={group.map(item => item.content).join("\n\n")} streaming={group.some(item => item.streaming === true)} />);
      continue;
    }
    parts.push(part.type === "tool" ? <ToolEvent key={part.id} tool={part.tool} /> : <MessageContent key={part.id} content={part.content} />);
  }
  return <article className={`message ${message.role}${showActions ? " show-actions" : ""}`}>
    {parts}
    {showActions && (message.at || text) && <div className="message-meta">
      {message.at && <time>{message.at}</time>}
      {text && <button className="message-copy" type="button" title="Copy" aria-label="Copy message" onClick={() => void navigator.clipboard.writeText(text)}><CopyIcon /></button>}
    </div>}
  </article>;
}

function ReasoningMessage({ content, streaming }: { content: string; streaming: boolean }) {
  const [open, setOpen] = useState(streaming);
  useEffect(() => {
    if (streaming) setOpen(true);
  }, [streaming]);
  if (!content.trim()) return null;
  return <section className={`reasoning${open ? " open" : ""}`}>
    <button type="button" className="reasoning-toggle" aria-expanded={open} onClick={() => setOpen(value => !value)}>
      <span>{streaming ? "Thinking" : "Reasoning"}</span>
      <small>{streaming ? "Generating" : open ? "Hide" : "Show"}</small>
      <span className="reasoning-chevron" aria-hidden="true">⌄</span>
    </button>
    {open && <div className="reasoning-body"><MessageContent content={content} /></div>}
  </section>;
}

function ToolEvent({ tool }: { tool: NonNullable<HermesSession["toolEvents"]>[number] }) {
  const [expanded, setExpanded] = useState(false);
  const detail = tool.name === "terminal" ? stripAnsi(tool.error ?? tool.detail ?? "") : tool.error ?? tool.detail ?? "";
  const preview = (tool.context || detail).replace(/\s+/g, " ").trim();
  const contents = [tool.context, detail].filter((value, index, values) => value && values.indexOf(value) === index).join("\n\n");
  const todos = tool.name === "todo" ? readTodoItems(detail) : [];
  return <article className={`tool-event ${tool.status === "running" ? "running" : ""}${expanded ? " expanded" : ""}${tool.name === "terminal" ? " terminal" : ""}${tool.name.includes("diff") || detail.includes("diff --git") ? " diff" : ""}`} aria-live={tool.status === "running" ? "polite" : undefined}>
    <button type="button" className="tool-event-toggle" aria-expanded={expanded} aria-label={`${tool.name} ${tool.status}; ${expanded ? "hide" : "show"} details`} onClick={() => setExpanded(value => !value)}>
      <span className="tool-event-marker" aria-hidden="true" />
      <strong>{tool.name}</strong>
      {preview && <span className="tool-event-preview">{preview}</span>}
      <small className="tool-event-status">{tool.status === "running" ? "running" : "done"}</small>
      <span className="tool-event-chevron" aria-hidden="true">⌄</span>
    </button>
    {expanded && (todos.length > 0 ? <ul className="tool-todos">{todos.map((todo, index) => <li key={`${todo.content}-${index}`} className={todo.status}><span aria-hidden="true">{todo.status === "completed" ? "✓" : todo.status === "in_progress" ? "•" : "○"}</span>{todo.content}</li>)}</ul> : contents && <pre className="tool-event-detail">{contents}</pre>)}
  </article>;
}

function WorkspaceRail({ adapter, onClose }: { adapter: SameOriginHermesAdapter | null; onClose: () => void }) {
  const [root, setRoot] = useState("");
  const [entries, setEntries] = useState<Record<string, HermesFileEntry[]>>({});
  const [expanded, setExpanded] = useState<string[]>([]);
  const [loading, setLoading] = useState<string[]>([]);
  const [selectedPath, setSelectedPath] = useState("");
  const [text, setText] = useState("");
  const [fileState, setFileState] = useState<{ binary: boolean; truncated: boolean; language: string } | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  const loadDirectory = async (path: string) => {
    if (!adapter) return;
    setLoading(current => [...current, path]);
    try {
      const directoryEntries = await adapter.listFiles(path);
      setEntries(current => ({ ...current, [path]: directoryEntries }));
      setNotice("");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Hermes could not open this folder.");
    } finally {
      setLoading(current => current.filter(item => item !== path));
    }
  };

  useEffect(() => {
    if (!adapter) return;
    let active = true;
    void adapter.getFileRoot().then(path => {
      if (!active) return;
      setRoot(path);
      setExpanded([path]);
      void loadDirectory(path);
    }).catch(error => active && setNotice(error instanceof Error ? error.message : "Hermes could not open the workspace folder."));
    return () => { active = false; };
  }, [adapter]);

  async function selectFile(path: string) {
    if (!adapter || path === selectedPath) return;
    if (dirty) {
      setNotice("Save or discard the current edit before opening another file.");
      return;
    }
    setSelectedPath(path);
    setNotice("");
    setFileState(null);
    try {
      const file = await adapter.readTextFile(path);
      setText(file.text);
      setFileState({ binary: file.binary, truncated: file.truncated, language: file.language });
      setDirty(false);
    } catch (error) {
      setText("");
      setNotice(error instanceof Error ? error.message : "Hermes could not read this file.");
    }
  }

  async function toggleDirectory(path: string) {
    if (expanded.includes(path)) {
      setExpanded(current => current.filter(item => item !== path));
      return;
    }
    setExpanded(current => [...current, path]);
    if (!entries[path]) await loadDirectory(path);
  }

  async function save() {
    if (!adapter || !selectedPath || !dirty || fileState?.binary || fileState?.truncated) return;
    setSaving(true);
    try {
      await adapter.writeTextFile(selectedPath, text);
      setDirty(false);
      setNotice("Saved to Hermes workspace.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Hermes could not save this file.");
    } finally {
      setSaving(false);
    }
  }

  function closeEditor() {
    if (dirty && !window.confirm("Discard unsaved changes?")) return;
    setSelectedPath("");
    setText("");
    setFileState(null);
    setDirty(false);
    setNotice("");
  }

  return <aside className="workspace-rail" aria-label="Workspace files">
    <header className="work-rail-head"><div><span className="eyebrow">Hermes workspace</span><strong>Files</strong></div><button className="work-rail-close" type="button" onClick={onClose} aria-label="Close files panel">×</button></header>
    <div className="file-explorer-toolbar"><span title={root}>{root || "Opening workspace…"}</span><button type="button" onClick={() => root && void loadDirectory(root)} disabled={!root || loading.includes(root)} aria-label="Refresh folder">↻</button></div>
    {notice && <p className="file-explorer-notice" role="status">{notice}</p>}
    {selectedPath ? <section className="file-editor" aria-label="Text editor">
      <header><span title={selectedPath}>{selectedPath || "Select a text file"}</span><div>{fileState?.language && <small>{fileState.language}</small>}{selectedPath && <button className="file-editor-close" type="button" onClick={closeEditor}>Close</button>}</div></header>
      {fileState?.binary ? <p>This file is binary and cannot be edited here.</p> : fileState?.truncated ? <p>This file is too large to edit safely here.</p> : <textarea value={text} disabled={!selectedPath || Boolean(fileState?.binary) || Boolean(fileState?.truncated)} onChange={event => { setText(event.target.value); setDirty(true); setNotice(""); }} spellCheck={false} placeholder="Select a .md, .env, or text file" />}
      <footer><span>{dirty ? "Unsaved changes" : selectedPath ? "Saved" : ""}</span><button type="button" onClick={() => void save()} disabled={!dirty || saving || fileState?.binary || fileState?.truncated}>{saving ? "Saving…" : "Save"}</button></footer>
    </section> : <div className="file-explorer-tree"><ExplorerTree entries={root ? entries[root] ?? [] : []} nestedEntries={entries} expanded={expanded} loading={loading} selectedPath={selectedPath} onToggle={toggleDirectory} onSelect={selectFile} /></div>}
  </aside>;
}

function ExplorerTree({ entries, nestedEntries, expanded, loading, selectedPath, onToggle, onSelect }: { entries: HermesFileEntry[]; nestedEntries: Record<string, HermesFileEntry[]>; expanded: string[]; loading: string[]; selectedPath: string; onToggle: (path: string) => Promise<void>; onSelect: (path: string) => Promise<void> }) {
  return <ul>{entries.map(entry => <li key={entry.path}>{entry.isDirectory ? <><button className="explorer-directory" type="button" onClick={() => void onToggle(entry.path)}><span>{expanded.includes(entry.path) ? "⌄" : "›"}</span>{entry.name}</button>{expanded.includes(entry.path) && <ExplorerTree entries={nestedEntries[entry.path] ?? []} nestedEntries={nestedEntries} expanded={expanded} loading={loading} selectedPath={selectedPath} onToggle={onToggle} onSelect={onSelect} />}{loading.includes(entry.path) && <small className="explorer-loading">Loading…</small>}</> : <button className={`explorer-file${selectedPath === entry.path ? " selected" : ""}`} type="button" onClick={() => void onSelect(entry.path)}>{entry.name}</button>}</li>)}</ul>;
}

function readTodoItems(detail: string) {
  try {
    const data = JSON.parse(detail) as { todos?: Array<{ content?: unknown; status?: unknown }> };
    return Array.isArray(data.todos) ? data.todos.flatMap(todo => typeof todo?.content === "string" ? [{ content: todo.content, status: todo.status === "completed" || todo.status === "in_progress" ? todo.status : "pending" }] : []) : [];
  } catch { return []; }
}

function stripAnsi(value: string) {
  return value.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "");
}

function MessageContent({ content }: { content: string }) {
  return <div className="message-content"><ReactMarkdown remarkPlugins={[remarkGfm]} components={{
    a: ({ href, children }) => <MessageLink href={href}>{children}</MessageLink>,
    img: ({ src, alt }) => <img className="message-media message-image" src={src} alt={alt ?? ""} loading="lazy" />,
    pre: ({ children }) => <MarkdownPre>{children}</MarkdownPre>
  }}>{content}</ReactMarkdown></div>;
}

function MessageLink({ href, children }: { href?: string; children: ReactNode }) {
  const kind = href ? mediaKind(href) : null;
  if (kind === "image") return <figure className="message-media-figure"><a href={href} target="_blank" rel="noreferrer"><img className="message-media message-image" src={href} alt="" loading="lazy" /></a></figure>;
  if (kind === "video") return <video className="message-media" controls preload="metadata" src={href} />;
  if (kind === "audio") return <audio className="message-audio" controls preload="metadata" src={href} />;
  return <a href={href} target="_blank" rel="noreferrer">{children}</a>;
}

function mediaKind(href: string) {
  const path = href.split(/[?#]/, 1)[0].toLowerCase();
  if (/\.(png|jpe?g|gif|webp|avif)$/i.test(path)) return "image" as const;
  if (/\.(mp4|webm|mov|m4v)$/i.test(path)) return "video" as const;
  if (/\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(path)) return "audio" as const;
  return null;
}

function MarkdownPre({ children }: { children: ReactNode }) {
  const child = Children.toArray(children)[0];
  const props = isValidElement<{ children?: ReactNode; className?: string }>(child) ? child.props : undefined;
  const code = String(props?.children ?? "").replace(/\n$/, "");
  const language = props?.className?.match(/language-([\w+-]+)/)?.[1];
  return <pre>{language && <span className="code-language">{language}</span>}<button className="code-copy" type="button" title="Copy code" aria-label="Copy code" onClick={() => void navigator.clipboard.writeText(code)}><CopyIcon /></button>{children}</pre>;
}

function cronKey(job: HermesCronJob) {
  return `${job.profile ?? "default"}:${job.id}`;
}

function cronPresentation(job: HermesCronJob) {
  const state = job.state.toLowerCase();
  const lastStatus = job.lastStatus?.toLowerCase();
  if (state === "running") return { tone: "running", label: "Running now", description: "Hermes is executing this job now." };
  if (!job.enabled || state === "paused" || state === "disabled") return { tone: "paused", label: "Paused", description: "No new runs will start until you resume this schedule." };
  if (state === "failed" || state === "error" || lastStatus === "failed" || lastStatus === "error" || job.lastError || job.lastDeliveryError) return { tone: "failed", label: "Needs attention", description: "The latest run or its delivery reported a problem." };
  if (state === "completed" && !job.nextRunAt) return { tone: "completed", label: "Completed", description: "This one-time schedule has finished and has no next run." };
  return { tone: "scheduled", label: "Schedule active", description: job.nextRunAt ? "Hermes will run this job at the next scheduled time." : "Hermes has this schedule enabled; the next run time is not available yet." };
}

function EnhancedCronPanel({ adapter, profiles, activeProfile, onClose }: { adapter: SameOriginHermesAdapter | null; profiles: HermesProfile[]; activeProfile: string; onClose: () => void }) {
  const [jobs, setJobs] = useState<HermesCronJob[]>([]);
  const [runs, setRuns] = useState<Record<string, HermesCronRun[]>>({});
  const [expandedJob, setExpandedJob] = useState<string | null>(null);
  const [expandedRuns, setExpandedRuns] = useState<string | null>(null);
  const [loadingRuns, setLoadingRuns] = useState<string | null>(null);
  const [draft, setDraft] = useState<HermesCronJobDraft>({ name: "", prompt: "", schedule: "" });
  const [targetProfile, setTargetProfile] = useState(activeProfile);
  const [showCreate, setShowCreate] = useState(false);
  const [editingJob, setEditingJob] = useState<HermesCronJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const presets = [{ label: "Every day · 09:00", value: "0 9 * * *" }, { label: "Weekdays · 09:00", value: "0 9 * * 1-5" }, { label: "Every Monday · 09:00", value: "0 9 * * 1" }, { label: "Every hour", value: "0 * * * *" }];

  async function refresh() {
    if (!adapter) return;
    setLoading(true); setError(null);
    try { setJobs(await adapter.listCronJobs()); }
    catch (loadError) { setError(loadError instanceof Error ? loadError.message : "Could not load Hermes cron jobs."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void refresh(); }, [adapter]);
  useEffect(() => { setTargetProfile(activeProfile); }, [activeProfile]);

  async function createJob() {
    if (!adapter || saving || !draft.prompt.trim() || !draft.schedule.trim()) return;
    setSaving(true); setError(null);
    try {
      const savedDraft = { name: draft.name.trim(), prompt: draft.prompt.trim(), schedule: draft.schedule.trim() };
      if (editingJob) {
        const updated = await adapter.updateCronJob(editingJob, savedDraft);
        setJobs(current => current.map(item => cronKey(item) === cronKey(editingJob) ? updated : item));
      } else {
        const created = await adapter.createCronJob(savedDraft, targetProfile);
        setJobs(current => [created, ...current]);
      }
      setDraft({ name: "", prompt: "", schedule: "" }); setEditingJob(null); setShowCreate(false);
    } catch (createError) { setError(createError instanceof Error ? createError.message : "Could not create the Hermes cron job."); }
    finally { setSaving(false); }
  }
  function beginCreate() { setEditingJob(null); setDraft({ name: "", prompt: "", schedule: "" }); setShowCreate(value => !value); }
  function beginEdit(job: HermesCronJob) { setEditingJob(job); setTargetProfile(job.profile ?? activeProfile); setDraft({ name: job.name, prompt: job.prompt, schedule: job.schedule }); setShowCreate(true); }
  function duplicate(job: HermesCronJob) { setEditingJob(null); setTargetProfile(job.profile ?? activeProfile); setDraft({ name: `${job.name} copy`, prompt: job.prompt, schedule: job.schedule }); setShowCreate(true); }
  async function remove(job: HermesCronJob) {
    if (!adapter || actionId || !window.confirm(`Delete cron job “${job.name}”? This cannot be undone.`)) return;
    const key = cronKey(job); setActionId(key); setError(null);
    try { await adapter.deleteCronJob(job); setJobs(current => current.filter(item => cronKey(item) !== key)); }
    catch (removeError) { setError(removeError instanceof Error ? removeError.message : "Could not delete the Hermes cron job."); }
    finally { setActionId(null); }
  }
  async function act(job: HermesCronJob, action: "pause" | "resume" | "trigger") {
    if (!adapter || actionId) return;
    const key = cronKey(job); setActionId(key); setError(null);
    try {
      const updated = await adapter.runCronAction(job, action);
      setJobs(current => current.map(item => cronKey(item) === key ? updated : item));
      if (action === "trigger") void openRuns(updated, true);
    } catch (actionError) { setError(actionError instanceof Error ? actionError.message : "Could not update the Hermes cron job."); }
    finally { setActionId(null); }
  }
  async function openRuns(job: HermesCronJob, refreshOnly = false) {
    if (!adapter) return;
    const key = cronKey(job);
    if (!refreshOnly && expandedRuns === key) { setExpandedRuns(null); return; }
    setExpandedRuns(key); setLoadingRuns(key);
    try {
      const loadedRuns = await adapter.listCronRuns(job);
      setRuns(current => ({ ...current, [key]: loadedRuns }));
    }
    catch (loadError) { setError(loadError instanceof Error ? loadError.message : "Could not load Hermes run history."); }
    finally { setLoadingRuns(null); }
  }

  return <div className="workspace-content cron-content">
    <section className="content-head"><div><span className="eyebrow">Hermes / Automations</span><h1>Cron jobs</h1><p>State and run history come directly from Hermes. “Schedule active” means future runs are enabled; it does not mean a job is running right now.</p></div><div className="head-actions"><button className="quiet-action" type="button" onClick={onClose}>Close</button><button className="quiet-action" type="button" onClick={() => void refresh()} disabled={loading}>{loading ? "Refreshing..." : "Refresh"}</button><button className="new-session" type="button" onClick={beginCreate}>{showCreate && !editingJob ? "Close" : "New cron job"}</button></div></section>
    {showCreate && <section className="cron-create"><div><span className="eyebrow">{editingJob ? "Edit in Hermes" : "Create in Hermes"}</span><strong>{editingJob ? editingJob.name : "New scheduled job"}</strong></div><label>Profile<select value={targetProfile} onChange={event => setTargetProfile(event.target.value)} disabled={Boolean(editingJob)}>{profiles.map(profile => <option key={profile.id} value={profile.id}>{profile.label}</option>)}</select></label><label>Name <input value={draft.name} onChange={event => setDraft(current => ({ ...current, name: event.target.value }))} placeholder="Daily summary" /></label><label>Prompt <textarea value={draft.prompt} onChange={event => setDraft(current => ({ ...current, prompt: event.target.value }))} placeholder="What Hermes should do when this job runs" /></label><label>Schedule <input value={draft.schedule} onChange={event => setDraft(current => ({ ...current, schedule: event.target.value }))} placeholder="0 9 * * *" /><small>Hermes validates the expression. Browser time zone: {timezone}.</small></label><div className="cron-presets" aria-label="Schedule presets">{presets.map(preset => <button className="quiet-action" type="button" key={preset.value} onClick={() => setDraft(current => ({ ...current, schedule: preset.value }))}>{preset.label}</button>)}</div><div className="cron-create-actions"><button className="new-session" type="button" onClick={() => void createJob()} disabled={saving || !draft.prompt.trim() || !draft.schedule.trim()}>{saving ? "Saving..." : editingJob ? "Save changes" : "Create cron job"}</button><button className="quiet-action" type="button" onClick={() => { setShowCreate(false); setEditingJob(null); }} disabled={saving}>Cancel</button></div></section>}
    {error && <section className="cron-error">{error}</section>}
    <section className="cron-list" aria-label="Hermes cron jobs">{loading ? <div className="empty-state"><strong>Loading cron jobs</strong><p>Hermes is reading the current schedule.</p></div> : jobs.length === 0 ? <div className="empty-state"><strong>No scheduled jobs</strong><p>There are no Hermes cron jobs for the loaded profiles.</p></div> : jobs.map(job => {
      const key = cronKey(job); const status = cronPresentation(job); const jobRuns = runs[key] ?? [];
      const expanded = expandedJob === key;
      return <article className={`cron-job cron-${status.tone}`} key={key}><button className="cron-job-summary" type="button" onClick={() => setExpandedJob(current => current === key ? null : key)} aria-expanded={expanded}><div className="cron-job-head"><div><span className="eyebrow">{job.profile ?? "default"} / {job.deliver}</span><strong>{job.name}</strong></div><span className={`cron-state ${status.tone}`}>{status.label}</span></div><p className="cron-status-copy">{status.description}</p><span className="cron-job-expand">{expanded ? "Hide details" : "Show details"}</span></button>{expanded && <div className="cron-job-details"><p>{job.prompt || "No prompt recorded."}</p><dl><div><dt>Schedule</dt><dd>{job.schedule}</dd></div><div><dt>Next run</dt><dd>{status.tone === "paused" || status.tone === "completed" ? "Not scheduled" : formatCronDate(job.nextRunAt)}</dd></div><div><dt>Last result</dt><dd>{job.lastStatus ?? (job.lastRunAt ? "Completed" : "Not run yet")}</dd></div><div><dt>Last run</dt><dd>{formatCronDate(job.lastRunAt)}</dd></div></dl>{job.lastError && <p className="cron-job-error">Run error: {job.lastError}</p>}{job.lastDeliveryError && <p className="cron-job-error">Delivery error: {job.lastDeliveryError}</p>}<div className="cron-actions"><button className="quiet-action" type="button" onClick={() => void act(job, "trigger")} disabled={Boolean(actionId)}>{actionId === key ? "Updating..." : "Run now"}</button><button className="quiet-action" type="button" onClick={() => void act(job, status.tone === "paused" ? "resume" : "pause")} disabled={Boolean(actionId)}>{actionId === key ? "Updating..." : status.tone === "paused" ? "Resume schedule" : "Pause schedule"}</button><button className="quiet-action" type="button" onClick={() => beginEdit(job)} disabled={Boolean(actionId)}>Edit</button><button className="quiet-action" type="button" onClick={() => duplicate(job)} disabled={Boolean(actionId)}>Duplicate</button><button className="quiet-action danger-action" type="button" onClick={() => void remove(job)} disabled={Boolean(actionId)}>Delete</button><button className="quiet-action" type="button" onClick={() => void openRuns(job)} disabled={loadingRuns === key}>{expandedRuns === key ? "Hide run history" : loadingRuns === key ? "Loading history..." : "Run history"}</button></div>{expandedRuns === key && <section className="cron-runs" aria-label={`${job.name} run history`}>{loadingRuns === key ? <p>Reading Hermes run sessions...</p> : jobRuns.length === 0 ? <p>No stored run sessions yet.</p> : jobRuns.map(run => <article className={`cron-run ${run.active ? "active" : run.failed ? "failed" : ""}`} key={run.id}><div><strong>{run.active ? "Running now" : run.failed ? "Failed" : "Finished"}</strong><small>{formatCronDate(run.startedAt ?? run.updatedAt)}</small></div><p>{run.preview || run.title}</p></article>)}</section>}</div>}</article>;
    })}</section>
  </div>;
}

function formatCronDate(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("ko-KR", { dateStyle: "short", timeStyle: "short" }).format(date);
}

function HermesControls({ adapter, onClose }: { adapter: SameOriginHermesAdapter | null; onClose: () => void }) {
  const [settings, setSettings] = useState<HermesModelSettings | null>(null);
  const [options, setOptions] = useState<HermesModelOption[]>([]);
  const [shortlist, setShortlist] = useState<string[]>([]);
  const [shortlistReady, setShortlistReady] = useState(false);
  const [showModelSettings, setShowModelSettings] = useState(false);
  const [modelQuery, setModelQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingModel, setPendingModel] = useState<HermesModelOption | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!adapter) return;
    void Promise.all([adapter.getModelSettings(), adapter.getModelOptions()])
      .then(([loadedSettings, loadedOptions]) => {
        setSettings(loadedSettings);
        setOptions(loadedOptions);
      })
      .catch(loadError => setError(loadError instanceof Error ? loadError.message : "Could not load Hermes controls."));
  }, [adapter]);

  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(modelShortlistKey) ?? "[]");
      if (Array.isArray(saved)) setShortlist(saved.filter((value): value is string => typeof value === "string"));
    } catch {
      window.localStorage.removeItem(modelShortlistKey);
    } finally {
      setShortlistReady(true);
    }
  }, []);

  useEffect(() => {
    if (shortlistReady) window.localStorage.setItem(modelShortlistKey, JSON.stringify(shortlist));
  }, [shortlist, shortlistReady]);

  async function changeModel(option: HermesModelOption, confirmExpensiveModel = false) {
    if (!adapter || saving) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const result: HermesModelAssignment = await adapter.setMainModel(option.provider, option.model, confirmExpensiveModel);
      if (result.confirmationRequired) {
        setPendingModel(option);
        setNotice(result.confirmationMessage ?? "This model may incur additional cost. Confirm to save it in Hermes.");
        return;
      }
      setSettings(current => current ? { ...current, model: option.model, provider: option.provider } : current);
      setPendingModel(null);
      setNotice("Saved in Hermes. Start a new session to apply it; use /model in native Hermes chat to change the current session.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not update the Hermes model.");
    } finally {
      setSaving(false);
    }
  }

  async function changeReasoning(reasoningEffort: HermesReasoningEffort) {
    if (!adapter || saving) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await adapter.setReasoningEffort(reasoningEffort);
      setSettings(current => current ? { ...current, reasoningEffort } : current);
      setNotice("Reasoning preference saved in Hermes. It applies when the next agent turn starts.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not update Hermes reasoning.");
    } finally {
      setSaving(false);
    }
  }

  function toggleShortlist(option: HermesModelOption) {
    const id = modelId(option);
    setShortlist(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id]);
  }

  const selectedModel = settings ? `${settings.provider}::${settings.model}` : "";
  const visibleOptions = options.filter(option => shortlist.includes(modelId(option)) && modelId(option) !== selectedModel);
  const filteredOptions = options.filter(option => `${option.providerLabel} ${option.model}`.toLowerCase().includes(modelQuery.trim().toLowerCase()));

  return <section className="hermes-controls" aria-label="Hermes settings"><div className="controls-head"><div><span className="eyebrow">Hermes settings</span><strong>{showModelSettings ? "Visible models" : "Model and Reasoning"}</strong></div><div className="controls-head-actions">{!showModelSettings && <button className="controls-close" type="button" onClick={() => setShowModelSettings(true)}>Visible models</button>}<button className="controls-close" type="button" onClick={onClose}>Close</button></div></div>{error && <p className="controls-error">{error}</p>}{!settings && !error && <p className="controls-loading">Loading Hermes settings...</p>}{settings && showModelSettings && <div className="model-settings"><p>Choose only the models you want to see in Settings. This is a browser UI preference; Hermes still owns the active model.</p><label className="model-filter"><span>Search all Hermes models</span><input value={modelQuery} onChange={event => setModelQuery(event.target.value)} placeholder="Provider or model name" /></label><div className="model-catalog">{filteredOptions.map(option => { const id = modelId(option); return <label className="model-option" key={id}><input type="checkbox" checked={shortlist.includes(id)} onChange={() => toggleShortlist(option)} /><span><strong>{option.model}</strong><small>{option.providerLabel}{option.warning ? ` · ${option.warning}` : ""}</small></span></label>; })}</div><p className="controls-note">{shortlist.length} model{shortlist.length === 1 ? "" : "s"} shown in Settings.</p><button className="quiet-action" type="button" onClick={() => setShowModelSettings(false)}>Done</button></div>}{settings && !showModelSettings && <div className="controls-grid"><label>Model<select value={selectedModel} onChange={event => { const selected = options.find(option => modelId(option) === event.target.value); if (selected) void changeModel(selected); }} disabled={saving || visibleOptions.length === 0}><option value={selectedModel}>{settings.model}</option>{visibleOptions.map(option => <option key={modelId(option)} value={modelId(option)}>{option.providerLabel} / {option.model}</option>)}</select><button className="model-settings-link" type="button" onClick={() => setShowModelSettings(true)}>Edit visible models</button></label>{settings.supportsReasoning && <label>Reasoning<select value={settings.reasoningEffort} onChange={event => void changeReasoning(event.target.value as HermesReasoningEffort)} disabled={saving}>{(["none", "minimal", "low", "medium", "high", "xhigh", "max", "ultra"] as HermesReasoningEffort[]).map(effort => <option key={effort} value={effort}>{effort}</option>)}</select></label>}</div>}{pendingModel && <div className="controls-confirm"><p>{notice}</p><button type="button" className="new-session" onClick={() => void changeModel(pendingModel, true)} disabled={saving}>{saving ? "Saving..." : "Confirm model"}</button><button type="button" className="quiet-action" onClick={() => { setPendingModel(null); setNotice(null); }} disabled={saving}>Cancel</button></div>}{notice && !pendingModel && <p className="controls-notice">{notice}</p>}{!showModelSettings && <p className="controls-note">Settings save model choices in Hermes. The visible-model list is stored only in this browser.</p>}</section>;
}

type SettingsSection = "appearance" | "model" | "skills" | "mcp" | "plugins";

function CapabilitySettings({ adapter, section }: { adapter: SameOriginHermesAdapter | null; section: Exclude<SettingsSection, "model" | "appearance"> }) {
  const [skills, setSkills] = useState<HermesSkill[]>([]);
  const [mcpServers, setMcpServers] = useState<HermesMcpServer[]>([]);
  const [plugins, setPlugins] = useState<HermesPlugin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
  const [skillEditor, setSkillEditor] = useState<{ name: string; content: string } | null>(null);
  const [skillSaving, setSkillSaving] = useState(false);
  const [skillIdentifier, setSkillIdentifier] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [showMcpCreate, setShowMcpCreate] = useState(false);
  const [mcpMode, setMcpMode] = useState<"http" | "stdio">("http");
  const [mcpDraft, setMcpDraft] = useState<HermesMcpServerDraft>({ name: "", url: "", command: "" });
  const [mcpArgs, setMcpArgs] = useState("");
  const [mcpEnv, setMcpEnv] = useState("");
  const [mcpTests, setMcpTests] = useState<Record<string, { ok: boolean; detail: string }>>({});

  async function load() {
    if (!adapter) { setLoading(false); return; }
    setLoading(true); setError(null); setNotice(null);
    try {
      if (section === "skills") setSkills(await adapter.listSkills());
      if (section === "mcp") setMcpServers(await adapter.listMcpServers());
      if (section === "plugins") setPlugins(await adapter.listPlugins());
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : "Could not load Hermes capabilities."); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, [adapter, section]);

  async function togglePlugin(plugin: HermesPlugin) {
    if (!adapter || updating) return;
    setUpdating(plugin.name); setError(null);
    try {
      const updated = await adapter.setPluginEnabled(plugin.name, !plugin.enabled);
      if (updated) setPlugins(current => current.map(item => item.name === plugin.name ? updated : item));
      else await load();
    } catch (toggleError) { setError(toggleError instanceof Error ? toggleError.message : "Could not update the Hermes plugin."); }
    finally { setUpdating(null); }
  }

  async function toggleSkill(skill: HermesSkill) {
    if (!adapter || updating) return;
    setUpdating(`skill:${skill.name}`); setError(null);
    try {
      await adapter.setSkillEnabled(skill.name, !skill.enabled);
      setSkills(current => current.map(item => item.name === skill.name ? { ...item, enabled: !item.enabled } : item));
    } catch (toggleError) { setError(toggleError instanceof Error ? toggleError.message : "Could not update the Hermes skill."); }
    finally { setUpdating(null); }
  }

  async function runSkillHubAction(action: "install" | "uninstall" | "update", value?: string) {
    if (!adapter || updating || (action !== "update" && !value?.trim())) return;
    if (action === "uninstall" && !window.confirm(`Remove skill “${value}”? Hermes will remove it in the background.`)) return;
    setUpdating(`hub:${action}`); setError(null); setNotice(null);
    try {
      await adapter.startSkillHubAction(action, value?.trim());
      setSkillIdentifier("");
      setNotice(`Hermes started the skill ${action}. Refresh after the background action finishes.`);
    } catch (actionError) { setError(actionError instanceof Error ? actionError.message : "Could not start the Hermes skill action."); }
    finally { setUpdating(null); }
  }

  function parseMcpEnv() {
    const env: Record<string, string> = {};
    for (const line of mcpEnv.split("\n").map(value => value.trim()).filter(Boolean)) {
      const separator = line.indexOf("=");
      if (separator <= 0) throw new Error("Environment values must use KEY=VALUE.");
      env[line.slice(0, separator).trim()] = line.slice(separator + 1);
    }
    return env;
  }

  async function createMcpServer() {
    if (!adapter || updating || !mcpDraft.name.trim() || (mcpMode === "http" ? !mcpDraft.url?.trim() : !mcpDraft.command?.trim())) return;
    setUpdating("mcp:create"); setError(null); setNotice(null);
    try {
      const created = await adapter.addMcpServer({
        name: mcpDraft.name.trim(),
        ...(mcpMode === "http" ? { url: mcpDraft.url?.trim() } : { command: mcpDraft.command?.trim(), args: mcpArgs.split("\n").map(value => value.trim()).filter(Boolean) }),
        env: parseMcpEnv()
      });
      setMcpServers(current => [...current, created].sort((a, b) => a.name.localeCompare(b.name)));
      setMcpDraft({ name: "", url: "", command: "" }); setMcpArgs(""); setMcpEnv(""); setShowMcpCreate(false);
    } catch (createError) { setError(createError instanceof Error ? createError.message : "Could not add the Hermes MCP server."); }
    finally { setUpdating(null); }
  }

  async function toggleMcpServer(server: HermesMcpServer) {
    if (!adapter || updating) return;
    setUpdating(`mcp:${server.name}`); setError(null);
    try {
      await adapter.setMcpServerEnabled(server.name, !server.enabled);
      setMcpServers(current => current.map(item => item.name === server.name ? { ...item, enabled: !item.enabled } : item));
    } catch (toggleError) { setError(toggleError instanceof Error ? toggleError.message : "Could not update the Hermes MCP server."); }
    finally { setUpdating(null); }
  }

  async function testMcpServer(server: HermesMcpServer) {
    if (!adapter || updating) return;
    setUpdating(`mcp-test:${server.name}`); setError(null);
    try {
      const result = await adapter.testMcpServer(server.name);
      setMcpTests(current => ({ ...current, [server.name]: { ok: result.ok, detail: result.ok ? `${result.tools.length} tool${result.tools.length === 1 ? "" : "s"}${result.tools.length ? `: ${result.tools.slice(0, 4).map(tool => tool.name).join(", ")}` : ""}` : result.error ?? "Connection test failed." } }));
    } catch (testError) { setMcpTests(current => ({ ...current, [server.name]: { ok: false, detail: testError instanceof Error ? testError.message : "Connection test failed." } })); }
    finally { setUpdating(null); }
  }

  async function removeMcpServer(server: HermesMcpServer) {
    if (!adapter || updating || !window.confirm(`Remove MCP server “${server.name}”?`)) return;
    setUpdating(`mcp:${server.name}`); setError(null);
    try { await adapter.removeMcpServer(server.name); setMcpServers(current => current.filter(item => item.name !== server.name)); }
    catch (removeError) { setError(removeError instanceof Error ? removeError.message : "Could not remove the Hermes MCP server."); }
    finally { setUpdating(null); }
  }

  async function openSkillEditor(skill: HermesSkill) {
    if (!adapter || !skill.editable) return;
    setError(null);
    try {
      setSkillEditor({ name: skill.name, content: await adapter.readSkill(skill.name) });
    } catch (readError) { setError(readError instanceof Error ? readError.message : "Could not read the Hermes skill."); }
  }

  async function saveSkillEditor() {
    if (!adapter || !skillEditor || skillSaving) return;
    setSkillSaving(true); setError(null);
    try {
      await adapter.writeSkill(skillEditor.name, skillEditor.content);
      setSkillEditor(null);
      await load();
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : "Could not save the Hermes skill."); }
    finally { setSkillSaving(false); }
  }

  const heading = section === "skills" ? "Skills" : section === "mcp" ? "MCP servers" : "Plugins";
  const description = section === "skills" ? "Installed skills available to Hermes. Hub actions run in Hermes and do not change this browser directly." : section === "mcp" ? "Server definitions are saved through Hermes' MCP API and take effect for new sessions." : "Installed Hermes plugins. Toggle controls are saved by Hermes.";
  const empty = section === "skills" ? skills.length === 0 : section === "mcp" ? mcpServers.length === 0 : plugins.length === 0;

  if (skillEditor) return <section className="capability-settings skill-editor" aria-label={`${skillEditor.name} editor`}><div className="controls-head"><div><span className="eyebrow">Local skill</span><strong>{skillEditor.name}</strong></div><button className="controls-close" type="button" onClick={() => setSkillEditor(null)} disabled={skillSaving}>Close</button></div><p className="capability-description">Changes are saved in Hermes and apply to new sessions.</p>{error && <p className="controls-error">{error}</p>}<textarea value={skillEditor.content} onChange={event => setSkillEditor(current => current ? { ...current, content: event.target.value } : current)} spellCheck={false} aria-label={`${skillEditor.name} content`} /><div className="skill-editor-actions"><button className="new-session" type="button" onClick={() => void saveSkillEditor()} disabled={skillSaving}>{skillSaving ? "Saving..." : "Save"}</button><button className="quiet-action" type="button" onClick={() => setSkillEditor(null)} disabled={skillSaving}>Cancel</button></div></section>;

  return <section className="capability-settings" aria-label={heading}><div className="controls-head"><div><span className="eyebrow">Hermes</span><strong>{heading}</strong></div><div className="controls-head-actions">{section === "skills" && <button className="controls-close" type="button" onClick={() => void runSkillHubAction("update")} disabled={Boolean(updating)}>{updating === "hub:update" ? "Starting..." : "Update all"}</button>}{section === "mcp" && <button className="controls-close" type="button" onClick={() => setShowMcpCreate(value => !value)}>{showMcpCreate ? "Cancel" : "Add server"}</button>}<button className="controls-close" type="button" onClick={() => void load()} disabled={loading}>{loading ? "Loading..." : "Refresh"}</button></div></div><p className="capability-description">{description}</p>{section === "skills" && <div className="capability-add"><input value={skillIdentifier} onChange={event => setSkillIdentifier(event.target.value)} placeholder="Skill identifier, GitHub repo, or URL" /><button className="quiet-action" type="button" onClick={() => void runSkillHubAction("install", skillIdentifier)} disabled={Boolean(updating) || !skillIdentifier.trim()}>{updating === "hub:install" ? "Starting..." : "Install"}</button></div>}{section === "mcp" && showMcpCreate && <div className="capability-form"><label>Name<input value={mcpDraft.name} onChange={event => setMcpDraft(current => ({ ...current, name: event.target.value }))} placeholder="my-mcp" /></label><label>Transport<select value={mcpMode} onChange={event => setMcpMode(event.target.value as "http" | "stdio")}><option value="http">HTTP / SSE</option><option value="stdio">Command</option></select></label>{mcpMode === "http" ? <label>Server URL<input value={mcpDraft.url} onChange={event => setMcpDraft(current => ({ ...current, url: event.target.value }))} placeholder="https://example.com/mcp" /></label> : <><label>Command<input value={mcpDraft.command} onChange={event => setMcpDraft(current => ({ ...current, command: event.target.value }))} placeholder="npx" /></label><label>Arguments <small>One per line</small><textarea value={mcpArgs} onChange={event => setMcpArgs(event.target.value)} placeholder="-y\npackage-name" /></label></>}<label>Environment <small>Optional, KEY=VALUE per line</small><textarea value={mcpEnv} onChange={event => setMcpEnv(event.target.value)} spellCheck={false} /></label><div className="skill-editor-actions"><button className="new-session" type="button" onClick={() => void createMcpServer()} disabled={Boolean(updating) || !mcpDraft.name.trim() || (mcpMode === "http" ? !mcpDraft.url?.trim() : !mcpDraft.command?.trim())}>{updating === "mcp:create" ? "Saving..." : "Add MCP server"}</button><button className="quiet-action" type="button" onClick={() => setShowMcpCreate(false)} disabled={Boolean(updating)}>Cancel</button></div></div>}{error && <p className="controls-error">{error}</p>}{notice && <p className="controls-notice">{notice}</p>}{loading ? <p className="controls-loading">Loading from Hermes...</p> : empty ? <p className="controls-note">No {heading.toLowerCase()} configured in Hermes.</p> : <div className="capability-list">{section === "skills" && skills.map(skill => <article className="capability-row" key={skill.name}><div><strong>{skill.name}</strong>{skill.description && <small>{skill.description}</small>}</div><div className="capability-row-actions">{skill.category && <span>{skill.category}</span>}{skill.editable && <button className="plugin-toggle" type="button" onClick={() => void openSkillEditor(skill)}>Edit</button>}<button className="plugin-toggle" type="button" onClick={() => void toggleSkill(skill)} disabled={Boolean(updating)} aria-pressed={skill.enabled}>{updating === `skill:${skill.name}` ? "Saving..." : skill.enabled ? "Enabled" : "Disabled"}</button>{!skill.editable && <button className="plugin-toggle danger-action" type="button" onClick={() => void runSkillHubAction("uninstall", skill.name)} disabled={Boolean(updating)}>Remove</button>}</div></article>)}{section === "mcp" && mcpServers.map(server => <article className="capability-row capability-row-stacked" key={server.name}><div><strong>{server.name}</strong>{server.target && <small>{server.transport ? `${server.transport} / ` : ""}{server.target}{server.args?.length ? ` ${server.args.join(" ")}` : ""}</small>}{mcpTests[server.name] && <small className={mcpTests[server.name].ok ? "capability-test-ok" : "capability-test-error"}>{mcpTests[server.name].detail}</small>}</div><div className="capability-row-actions"><button className="plugin-toggle" type="button" onClick={() => void toggleMcpServer(server)} disabled={Boolean(updating)} aria-pressed={server.enabled}>{updating === `mcp:${server.name}` ? "Saving..." : server.enabled ? "Enabled" : "Disabled"}</button><button className="plugin-toggle" type="button" onClick={() => void testMcpServer(server)} disabled={Boolean(updating)}>{updating === `mcp-test:${server.name}` ? "Testing..." : "Test"}</button><button className="plugin-toggle danger-action" type="button" onClick={() => void removeMcpServer(server)} disabled={Boolean(updating)}>Remove</button></div></article>)}{section === "plugins" && plugins.map(plugin => <article className="capability-row" key={plugin.name}><div><strong>{plugin.name}{plugin.version ? ` ${plugin.version}` : ""}</strong>{plugin.description && <small>{plugin.description}</small>}{plugin.source && <small>{plugin.source}</small>}</div><button className="plugin-toggle" type="button" onClick={() => void togglePlugin(plugin)} disabled={Boolean(updating)} aria-pressed={plugin.enabled}>{updating === plugin.name ? "Saving..." : plugin.enabled ? "Enabled" : "Disabled"}</button></article>)}</div>}</section>;
}

function ProfileSettings({ adapter, onChanged }: { adapter: SameOriginHermesAdapter | null; onChanged: () => void }) {
  const [profiles, setProfiles] = useState<HermesProfile[]>([]);
  const [name, setName] = useState("");
  const [cloneDefault, setCloneDefault] = useState(true);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [nextName, setNextName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function load() {
    if (!adapter) return;
    try { setError(null); setProfiles((await adapter.loadWorkspace()).profiles); }
    catch (loadError) { setError(loadError instanceof Error ? loadError.message : "Could not load Hermes profiles."); }
  }
  useEffect(() => { void load(); }, [adapter]);
  async function create() {
    if (!adapter || saving || !name.trim()) return;
    setSaving(true); setError(null);
    try { await adapter.createProfile(name.trim(), cloneDefault); setName(""); await load(); onChanged(); }
    catch (createError) { setError(createError instanceof Error ? createError.message : "Could not create the Hermes profile."); }
    finally { setSaving(false); }
  }
  async function rename(profile: HermesProfile) {
    if (!adapter || saving || !nextName.trim()) return;
    setSaving(true); setError(null);
    try { await adapter.renameProfile(profile.id, nextName.trim()); setRenaming(null); await load(); onChanged(); }
    catch (renameError) { setError(renameError instanceof Error ? renameError.message : "Could not rename the Hermes profile."); }
    finally { setSaving(false); }
  }
  async function remove(profile: HermesProfile) {
    if (!adapter || saving || profile.id === "default" || !window.confirm(`Delete profile “${profile.label}”? Hermes will remove its profile data.`)) return;
    setSaving(true); setError(null);
    try { await adapter.deleteProfile(profile.id); await load(); onChanged(); }
    catch (removeError) { setError(removeError instanceof Error ? removeError.message : "Could not delete the Hermes profile."); }
    finally { setSaving(false); }
  }
  return <section className="capability-settings" aria-label="Profiles"><div className="controls-head"><div><span className="eyebrow">Hermes</span><strong>Profiles</strong></div><button className="controls-close" type="button" onClick={() => void load()} disabled={saving}>Refresh</button></div><p className="capability-description">Profiles remain Hermes-owned. A new profile can start with the default profile configuration and skills.</p><div className="capability-form"><label>Name<input value={name} onChange={event => setName(event.target.value)} placeholder="research" /></label><label className="profile-clone"><input type="checkbox" checked={cloneDefault} onChange={event => setCloneDefault(event.target.checked)} /> Copy default configuration and skills</label><div className="skill-editor-actions"><button className="new-session" type="button" onClick={() => void create()} disabled={saving || !name.trim()}>{saving ? "Saving..." : "Create profile"}</button></div></div>{error && <p className="controls-error">{error}</p>}<div className="capability-list">{profiles.map(profile => <article className="capability-row" key={profile.id}><div><strong>{profile.label}</strong><small>{profile.id} / {profile.model}</small></div>{renaming === profile.id ? <form className="capability-inline-form" onSubmit={event => { event.preventDefault(); void rename(profile); }}><input autoFocus value={nextName} onChange={event => setNextName(event.target.value)} /><button className="plugin-toggle" type="submit" disabled={saving}>Save</button><button className="plugin-toggle" type="button" onClick={() => setRenaming(null)} disabled={saving}>Cancel</button></form> : <div className="capability-row-actions"><button className="plugin-toggle" type="button" onClick={() => { setRenaming(profile.id); setNextName(profile.label); }} disabled={saving}>Rename</button>{profile.id !== "default" && <button className="plugin-toggle danger-action" type="button" onClick={() => void remove(profile)} disabled={saving}>Delete</button>}</div>}</article>)}</div></section>;
}

function AppearanceSettings({ skin, onSkinChange }: { skin: SkinId; onSkinChange: (skin: SkinId) => void }) {
  return <section className="capability-settings appearance-settings" aria-label="Appearance"><div className="controls-head"><div><span className="eyebrow">Workspace</span><strong>Appearance</strong></div></div><p className="capability-description">Choose a color skin for this browser. Hermes profiles, sessions, and settings are unchanged.</p><div className="skin-grid">{skins.map(option => <button className={`skin-option ${skin === option.id ? "selected" : ""}`} type="button" key={option.id} onClick={() => onSkinChange(option.id)} aria-pressed={skin === option.id}><span className={`skin-swatch ${option.id}`} aria-hidden="true"><i /><i /><i /></span><span><strong>{option.name}</strong><small>{option.description}</small></span></button>)}</div></section>;
}

function SettingsSheet({ adapter, skin, onSkinChange, onClose, onWorkspaceChanged }: { adapter: SameOriginHermesAdapter | null; skin: SkinId; onSkinChange: (skin: SkinId) => void; onClose: () => void; onWorkspaceChanged: () => void }) {
  const [section, setSection] = useState<SettingsSection | "profiles">("appearance");
  return <div className="settings-scrim" role="presentation" onMouseDown={onClose}><aside className="settings-sheet" role="dialog" aria-modal="true" aria-label="Hermes settings" onMouseDown={event => event.stopPropagation()}><header className="settings-head"><strong>Settings</strong><button className="controls-close" type="button" onClick={onClose}>Close</button></header><nav className="settings-tabs" aria-label="Settings sections">{(["appearance", "model", "profiles", "skills", "mcp", "plugins"] as Array<SettingsSection | "profiles">).map(item => <button key={item} type="button" className={section === item ? "active" : ""} onClick={() => setSection(item)}>{item === "appearance" ? "Appearance" : item === "model" ? "Model" : item === "mcp" ? "MCP" : item[0].toUpperCase() + item.slice(1)}</button>)}</nav>{section === "appearance" ? <AppearanceSettings skin={skin} onSkinChange={onSkinChange} /> : section === "model" ? <HermesControls adapter={adapter} onClose={onClose} /> : section === "profiles" ? <ProfileSettings adapter={adapter} onChanged={onWorkspaceChanged} /> : <CapabilitySettings adapter={adapter} section={section} />}</aside></div>;
}

function modelId(option: Pick<HermesModelOption, "provider" | "model">) {
  return `${option.provider}::${option.model}`;
}
