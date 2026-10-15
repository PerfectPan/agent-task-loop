import type { SessionUpdate } from '@agentclientprotocol/sdk';
import type { McpServerConfig, PermissionDecision, PermissionRequest, PromptBlock } from '@rivus/agent-kit/acp';

/**
 * The endpoint's own turn contract — the slots a turn carries and how it ends.
 * It was the control-plane package's `Harness`; with the ACP driving adopted
 * from `@rivus/agent-kit`'s `/acp`, the contract lives with the endpoint that
 * fills it, and the kit's own shapes (`PromptBlock`, `McpServerConfig`,
 * `PermissionRequest`) travel across the boundary unchanged.
 */
export type { SessionUpdate };

/**
 * One tool the endpoint contributes to a member's session. The endpoint's
 * ToolServer hosts the definitions as one streamable-HTTP MCP endpoint per
 * session (ACP carries `mcpServers` only on `session/new`); each turn
 * re-serves its definitions on it.
 */
export interface ToolDefinition {
  name: string;
  description?: string;
  /** Zod raw shape; the MCP SDK turns it into the wire JSON schema. */
  inputSchema: import('zod').ZodRawShape;
  handler: (input: Record<string, unknown>, context: { sessionId: string | undefined }) => Promise<unknown>;
}

/**
 * How one turn ended. `stopReason` is the agent's own, or null when the turn
 * never resolved (timeout, lost process). `timedOut` is true only when the
 * turn ended by a watchdog, which is what separates a timeout from a failure.
 */
export interface TurnResult {
  stopReason: string | null;
  timedOut: boolean;
  error?: string;
}

/**
 * How a permission request is answered. A policy returns the option it selects
 * or undefined to deny — the driver forwards both to the kit, whose own rules
 * deny everything else: no callback, a callback failure, or an answer that
 * names no option the request offered (fail-closed by construction).
 */
export type TurnPermissionPolicy = (
  request: PermissionRequest,
) => PermissionDecision | undefined | Promise<PermissionDecision | undefined>;

/** The slots of one member's turn, assembled by the endpoint and driven over ACP. */
export interface TurnHarness {
  cwd: string;
  /** Native channel when the agent profile has one, else the first prompt block. */
  systemPrompt?: string;
  /** This turn's input. */
  blocks: readonly PromptBlock[];
  /** Room tools and anything else the endpoint adds, already hosted. */
  mcpServers: readonly McpServerConfig[];
  /** How session/request_permission is answered. */
  permissions: TurnPermissionPolicy;
  hooks?: {
    /** The member's running turn has called a tool; drives the 工作中 status. */
    onToolCall?(): void;
    /**
     * The driver awaits a returned promise before it releases the lease, so
     * the turn's fenced writes land inside the held window.
     */
    afterTurn?(result: TurnResult): void | Promise<void>;
  };
}
