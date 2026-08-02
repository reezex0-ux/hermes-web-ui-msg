import type { HermesAdapter, HermesProfile, HermesSession, HermesWorkspaceSnapshot } from "./hermes-adapter";

function mockMessage(role: "user" | "assistant", content: string, at: string, sequence: number) {
  return { id: `mock-${sequence}-${role}`, sequence, role, content, at, parts: [{ id: `mock-${sequence}-text`, type: "text" as const, content }] };
}

const publicDemoSnapshot: HermesWorkspaceSnapshot = {
  gatewayState: "mock",
  profiles: [
    { id: "default", label: "Assistant", model: "example-model", gateway: "running" },
    { id: "research", label: "Research", model: "example-model", gateway: "running" },
    { id: "operations", label: "Operations", model: "example-model", gateway: "running" }
  ] as HermesProfile[],
  sessions: [
    {
      id: "session-alpha", profileId: "default", title: "Product review", updatedAt: "now", status: "working",
      messages: [
        mockMessage("user", "Review the latest product notes.", "16:26", 0),
        {
          ...mockMessage("assistant", "This demo renders example data. Connect your Hermes Gateway to work with your own sessions.", "16:27", 1),
          parts: [
            { id: "mock-1-text", type: "text" as const, content: "This demo renders example data. Connect your Hermes Gateway to work with your own sessions." },
            { id: "mock-1-tool", type: "tool" as const, tool: { id: "mock-tool-build", name: "npm run build", context: "release check", status: "complete" as const, detail: "Build completed in 2.1s.", elapsedMs: 2100 } }
          ]
        }
      ],
      approval: { command: "npm run build", description: "Example approval request rendered with demo data only.", choices: ["once", "deny"] }
    },
    {
      id: "session-beta", profileId: "default", title: "Release checklist", updatedAt: "14:02", status: "idle",
      messages: [
        mockMessage("user", "Summarize the release checklist.", "14:01", 0),
        mockMessage("assistant", "The public package contains no runtime credentials or session data.", "14:02", 1)
      ]
    },
    {
      id: "session-gamma", profileId: "research", title: "Research notes", updatedAt: "yesterday", status: "idle",
      messages: [
        mockMessage("user", "Check the research workflow.", "09:40", 0),
        mockMessage("assistant", "Connect a compatible Hermes Gateway to replace this example session list.", "09:41", 1)
      ]
    }
  ] satisfies HermesSession[],
  projectsCapability: "unavailable"
};

export const hermesAdapterMock: HermesAdapter & HermesWorkspaceSnapshot = {
  ...publicDemoSnapshot,
  async loadWorkspace() {
    return publicDemoSnapshot;
  }
};
