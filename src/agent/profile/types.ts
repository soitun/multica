/**
 * Agent Profile Type Definitions
 */

import type { ToolsConfig } from "../tools/policy.js";

/** Profile filename constants */
export const PROFILE_FILES = {
  soul: "soul.md",
  identity: "identity.md",
  user: "user.md",
  workspace: "workspace.md",
  memory: "memory.md",
  bootstrap: "bootstrap.md",
  config: "config.json",
} as const;

/** Profile config.json structure */
export interface ProfileConfig {
  /** Tools policy configuration */
  tools?: ToolsConfig;
  /** Default LLM provider */
  provider?: string;
  /** Default model */
  model?: string;
  /** Default thinking level */
  thinkingLevel?: string;
}

/** Agent Profile configuration */
export interface AgentProfile {
  /** Profile ID */
  id: string;
  /** Personality constraints - defines agent's behavior boundaries and style */
  soul?: string | undefined;
  /** Identity information - agent's name and self-awareness */
  identity?: string | undefined;
  /** User profile - information about the person being assisted */
  user?: string | undefined;
  /** Workspace guidelines - behavior rules and conventions */
  workspace?: string | undefined;
  /** Persistent memory - long-term knowledge base */
  memory?: string | undefined;
  /** Initial context - guidance information for each conversation */
  bootstrap?: string | undefined;
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
