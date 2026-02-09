/**
 * Agent Profile Type Definitions
 */

import type { ToolsConfig } from "../tools/policy.js";
import type { ExecApprovalConfig } from "../tools/exec-approval-types.js";

/** Profile filename constants */
export const PROFILE_FILES = {
  soul: "soul.md",
  user: "user.md",
  workspace: "workspace.md",
  memory: "memory.md",
  heartbeat: "heartbeat.md",
  config: "config.json",
} as const;

/** Profile config.json structure */
export interface ProfileConfig {
  /** Agent display name */
  name?: string;
  /** Tools policy configuration */
  tools?: ToolsConfig;
  /** Default LLM provider */
  provider?: string;
  /** Default model */
  model?: string;
  /** Default thinking level */
  thinkingLevel?: string;
  /** Reasoning mode: off, on, stream */
  reasoningMode?: "off" | "on" | "stream" | undefined;
  /** Exec approval configuration (security level, ask mode, allowlist) */
  execApproval?: ExecApprovalConfig | undefined;
  /** Heartbeat configuration */
  heartbeat?: {
    /** Global heartbeat enable switch */
    enabled?: boolean | undefined;
    /** Interval, e.g. "30m", "1h" */
    every?: string | undefined;
    /** Optional prompt override */
    prompt?: string | undefined;
    /** Max chars after HEARTBEAT_OK to still treat as ack */
    ackMaxChars?: number | undefined;
  } | undefined;
}

/** Agent Profile configuration */
export interface AgentProfile {
  /** Profile ID */
  id: string;
  /** Agent identity and behavior - name, role, style, and principles */
  soul?: string | undefined;
  /** User profile - information about the person being assisted */
  user?: string | undefined;
  /** Workspace guidelines - behavior rules and conventions */
  workspace?: string | undefined;
  /** Persistent memory - long-term knowledge base */
  memory?: string | undefined;
  /** Periodic heartbeat instructions */
  heartbeat?: string | undefined;
  /** Profile configuration (from config.json) */
  config?: ProfileConfig | undefined;
}

/** Profile Manager options */
export interface ProfileManagerOptions {
  /** Profile ID */
  profileId: string;
  /** Base directory, defaults to ~/.super-multica/agent-profiles */
  baseDir?: string | undefined;
}

/** Create Profile options */
export interface CreateProfileOptions {
  /** Base directory */
  baseDir?: string | undefined;
  /** Whether to initialize with default templates */
  useTemplates?: boolean | undefined;
}
