#!/usr/bin/env node
/**
 * CLI tool to inspect and test tool policy configuration.
 *
 * Usage:
 *   pnpm tools:cli list                           # List all available tools
 *   pnpm tools:cli list --allow group:fs           # List tools after allowing fs group
 *   pnpm tools:cli list --deny exec               # List tools after denying exec
 *   pnpm tools:cli groups                         # Show all tool groups
 */

import { createAllTools } from "@multica/core";
import { filterTools, type ToolsConfig } from "@multica/core";
import { TOOL_GROUPS, expandToolGroups } from "@multica/core";

type Command = "list" | "groups" | "help";

interface CliOptions {
  command: Command;
  allow?: string[];
  deny?: string[];
  provider?: string | undefined;
  isSubagent?: boolean;
}

function printUsage() {
  console.log("Usage: pnpm tools:cli <command> [options]");
  console.log("");
  console.log("Commands:");
  console.log("  list       List available tools (with optional filtering)");
  console.log("  groups     Show all tool groups");
  console.log("  help       Show this help");
  console.log("");
  console.log("Options for 'list':");
  console.log("  --allow TOOLS        Allow specific tools (comma-separated)");
  console.log("  --deny TOOLS         Deny specific tools (comma-separated)");
  console.log("  --provider NAME      Apply provider-specific rules");
  console.log("  --subagent           Apply subagent restrictions");
  console.log("");
  console.log("Examples:");
  console.log("  pnpm tools:cli list");
  console.log("  pnpm tools:cli list --deny exec");
  console.log("  pnpm tools:cli list --allow group:fs,web_fetch");
  console.log("  pnpm tools:cli groups");
}

function parseArgs(argv: string[]): CliOptions {
  const args = [...argv];
  const command = (args.shift() || "help") as Command;

  const opts: CliOptions = { command };

  while (args.length > 0) {
    const arg = args.shift();
    if (!arg) break;

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

function listTools(opts: CliOptions) {
  const allTools = createAllTools(process.cwd());

  console.log(`Total tools available: ${allTools.length}`);
  console.log("");

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
    if (opts.allow) console.log(`  Allow: ${opts.allow.join(", ")}`);
    if (opts.deny) console.log(`  Deny: ${opts.deny.join(", ")}`);
    if (opts.provider) console.log(`  Provider: ${opts.provider}`);
    if (opts.isSubagent) console.log(`  Subagent: true`);
    console.log("");
    console.log(`Tools after filtering: ${filtered.length}`);
    console.log("");
  }

  console.log("Tools:");
  for (const tool of filtered) {
    const desc = tool.description?.slice(0, 60) || "";
    console.log(`  ${tool.name.padEnd(15)} ${desc}${desc.length >= 60 ? "..." : ""}`);
  }

  if (filtered.length < allTools.length) {
    const removed = allTools.filter((t) => !filtered.find((f) => f.name === t.name));
    console.log("");
    console.log(`Filtered out (${removed.length}):`);
    for (const tool of removed) {
      console.log(`  ${tool.name}`);
    }
  }
}

function showGroups() {
  console.log("Tool Groups:");
  console.log("");
  for (const [name, tools] of Object.entries(TOOL_GROUPS)) {
    console.log(`  ${name}:`);
    console.log(`    ${tools.join(", ")}`);
    console.log("");
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  switch (opts.command) {
    case "list":
      listTools(opts);
      break;
    case "groups":
      showGroups();
      break;
    case "help":
    default:
      printUsage();
      break;
  }
}

main().catch((err) => {
  console.error(err?.stack || String(err));
  process.exit(1);
});
