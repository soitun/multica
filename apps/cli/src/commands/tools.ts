/**
 * Tools command - Inspect and test tool policies
 *
 * Usage:
 *   multica tools list [options]     List available tools
 *   multica tools groups             Show all tool groups
 */

import { createAllTools } from "@multica/core";
import { filterTools, type ToolsConfig } from "@multica/core";
import { TOOL_GROUPS, expandToolGroups } from "@multica/core";
import { cyan, yellow, green, dim } from "../colors.js";

type Command = "list" | "groups" | "help";

interface ToolsOptions {
  command: Command;
  allow?: string[];
  deny?: string[];
  provider?: string | undefined;
  isSubagent?: boolean;
}

function printHelp() {
  console.log(`
${cyan("Usage:")} multica tools <command> [options]

${cyan("Commands:")}
  ${yellow("list")}                List available tools (with optional filtering)
  ${yellow("groups")}              Show all tool groups
  ${yellow("help")}                Show this help

${cyan("Options for 'list':")}
  ${yellow("--allow")} TOOLS       Allow specific tools (comma-separated)
  ${yellow("--deny")} TOOLS        Deny specific tools (comma-separated)
  ${yellow("--provider")} NAME     Apply provider-specific rules
  ${yellow("--subagent")}          Apply subagent restrictions

${cyan("Examples:")}
  ${dim("# List all tools")}
  multica tools list

  ${dim("# List tools with allow/deny")}
  multica tools list --deny exec
  multica tools list --allow group:fs,web_fetch

  ${dim("# Show tool groups")}
  multica tools groups
`);
}

function parseArgs(argv: string[]): ToolsOptions {
  const args = [...argv];
  const raw = args.shift() || "help";

  if (raw === "--help" || raw === "-h") {
    return { command: "help" };
  }

  const command = raw as Command;
  const opts: ToolsOptions = { command };

  while (args.length > 0) {
    const arg = args.shift();
    if (!arg) break;

    if (arg === "--help" || arg === "-h") {
      return { command: "help" };
    }
    if (arg === "--allow") {
      const value = args.shift();
      opts.allow = value?.split(",").map((s) => s.trim()) ?? [];
      continue;
    }
    if (arg === "--deny") {
      const value = args.shift();
      opts.deny = value?.split(",").map((s) => s.trim()) ?? [];
      continue;
    }
    if (arg === "--provider") {
      opts.provider = args.shift();
      continue;
    }
    if (arg === "--subagent") {
      opts.isSubagent = true;
      continue;
    }
  }

  return opts;
}

function cmdList(opts: ToolsOptions) {
  const allTools = createAllTools(process.cwd());

  console.log(`\n${cyan("Tools Overview")}`);
  console.log(`Total tools available: ${allTools.length}\n`);

  // Build config
  let config: ToolsConfig | undefined;
  if (opts.allow || opts.deny) {
    config = {};
    if (opts.allow) {
      config.allow = opts.allow;
    }
    if (opts.deny) {
      config.deny = opts.deny;
    }
  }

  const filterOpts: import("@multica/core").FilterToolsOptions = {};
  if (config) {
    filterOpts.config = config;
  }
  if (opts.provider) {
    filterOpts.provider = opts.provider;
  }
  if (opts.isSubagent) {
    filterOpts.isSubagent = opts.isSubagent;
  }

  const filtered = filterTools(allTools, filterOpts);

  if (config || opts.provider || opts.isSubagent) {
    console.log("Applied filters:");
    if (opts.allow) console.log(`  ${dim("Allow:")} ${opts.allow.join(", ")}`);
    if (opts.deny) console.log(`  ${dim("Deny:")} ${opts.deny.join(", ")}`);
    if (opts.provider) console.log(`  ${dim("Provider:")} ${opts.provider}`);
    if (opts.isSubagent) console.log(`  ${dim("Subagent:")} true`);
    console.log("");
    console.log(`Tools after filtering: ${green(String(filtered.length))}`);
    console.log("");
  }

  console.log("Tools:");
  for (const tool of filtered) {
    const desc = tool.description?.slice(0, 55) || "";
    console.log(`  ${yellow(tool.name.padEnd(15))} ${dim(desc)}${desc.length >= 55 ? "..." : ""}`);
  }

  if (filtered.length < allTools.length) {
    const removed = allTools.filter((t) => !filtered.find((f) => f.name === t.name));
    console.log("");
    console.log(`${dim(`Filtered out (${removed.length}):`)}`);
    for (const tool of removed) {
      console.log(`  ${dim(tool.name)}`);
    }
  }
}

function cmdGroups() {
  console.log(`\n${cyan("Tool Groups:")}\n`);
  for (const [name, tools] of Object.entries(TOOL_GROUPS)) {
    console.log(`  ${yellow(name)}:`);
    console.log(`    ${dim(tools.join(", "))}`);
    console.log("");
  }
}

export async function toolsCommand(args: string[]): Promise<void> {
  const opts = parseArgs(args);

  switch (opts.command) {
    case "list":
      cmdList(opts);
      break;
    case "groups":
      cmdGroups();
      break;
    case "help":
    default:
      printHelp();
      break;
  }
}
