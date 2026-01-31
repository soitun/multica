#!/usr/bin/env node
/**
 * Skills CLI
 *
 * Command-line interface for managing skills
 *
 * Usage:
 *   pnpm skills:cli list              List all skills
 *   pnpm skills:cli status [id]       Show skill status
 *   pnpm skills:cli install <id>      Install skill dependencies
 *   pnpm skills:cli add <source>      Add skill from GitHub
 *   pnpm skills:cli remove <name>     Remove an installed skill
 */

import {
  SkillManager,
  installSkill,
  getInstallOptions,
  addSkill,
  removeSkill,
  listInstalledSkills,
  checkEligibilityDetailed,
  type DiagnosticItem,
} from "../skills/index.js";

// ============================================================================
// Types
// ============================================================================

type Command = "list" | "status" | "install" | "add" | "remove" | "help";

interface ParsedArgs {
  command: Command;
  args: string[];
  verbose: boolean;
  force: boolean;
}

// ============================================================================
// Argument Parsing
// ============================================================================

function parseArgs(argv: string[]): ParsedArgs {
  const args = [...argv];
  let verbose = false;
  let force = false;
  const positional: string[] = [];

  while (args.length > 0) {
    const arg = args.shift();
    if (!arg) break;

    if (arg === "--verbose" || arg === "-v") {
      verbose = true;
      continue;
    }

    if (arg === "--force" || arg === "-f") {
      force = true;
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      return { command: "help", args: [], verbose, force };
    }

    positional.push(arg);
  }

  const command = (positional[0] ?? "help") as Command;
  const commandArgs = positional.slice(1);

  return { command, args: commandArgs, verbose, force };
}

// ============================================================================
// Commands
// ============================================================================

function printHelp(): void {
  console.log(`
Skills CLI - Manage super-multica skills

Usage:
  pnpm skills:cli <command> [options]

Commands:
  list              List all available skills
  status [id]       Show detailed status of a skill (or all skills)
  install <id>      Install dependencies for a skill
  add <source>      Add skill from GitHub (owner/repo or owner/repo/skill)
  remove <name>     Remove an installed skill

Options:
  -v, --verbose     Show more details
  -f, --force       Force overwrite existing skill
  -h, --help        Show this help

Examples:
  pnpm skills:cli list
  pnpm skills:cli status commit
  pnpm skills:cli install nano-pdf
  pnpm skills:cli add vercel-labs/agent-skills
  pnpm skills:cli add vercel-labs/agent-skills/perplexity
  pnpm skills:cli remove agent-skills
`);
}

function cmdList(manager: SkillManager, verbose: boolean): void {
  const skills = manager.listAllSkillsWithStatus();

  if (skills.length === 0) {
    console.log("No skills found.");
    return;
  }

  console.log("\nAvailable Skills:\n");

  for (const skill of skills) {
    const status = skill.eligible ? "✓" : "✗";
    const statusColor = skill.eligible ? "\x1b[32m" : "\x1b[31m";
    const reset = "\x1b[0m";

    console.log(`  ${statusColor}${status}${reset} ${skill.emoji} ${skill.name} (${skill.id})`);
    console.log(`    ${skill.description}`);
    console.log(`    Source: ${skill.source}`);

    if (!skill.eligible && skill.reasons) {
      for (const reason of skill.reasons) {
        console.log(`    ${statusColor}└ ${reason}${reset}`);
      }
    }

    if (verbose) {
      console.log();
    }
  }

  console.log();
  const eligibleCount = skills.filter((s) => s.eligible).length;
  console.log(`Total: ${skills.length} skills (${eligibleCount} eligible)`);
}

function cmdStatus(manager: SkillManager, skillId?: string, verbose?: boolean): void {
  if (!skillId) {
    // Show summary status with diagnostics
    cmdStatusSummary(manager, verbose);
    return;
  }

  // Show specific skill status with detailed diagnostics
  cmdStatusDetail(manager, skillId, verbose);
}

function cmdStatusSummary(manager: SkillManager, verbose?: boolean): void {
  const skills = manager.listAllSkillsWithStatus();
  const eligible = skills.filter((s) => s.eligible);
  const ineligible = skills.filter((s) => !s.eligible);

  console.log("\nSkills Status Summary:\n");
  console.log(`  Total:      ${skills.length}`);
  console.log(`  \x1b[32mEligible:   ${eligible.length}\x1b[0m`);
  console.log(`  \x1b[31mIneligible: ${ineligible.length}\x1b[0m`);

  if (ineligible.length > 0) {
    console.log("\n─────────────────────────────────────────");
    console.log("Ineligible Skills:");

    // Group by issue type
    const byIssue: Map<string, string[]> = new Map();
    for (const s of ineligible) {
      const skill = manager.getSkillFromAll(s.id);
      if (skill) {
        const detailed = checkEligibilityDetailed(skill);
        const mainIssue = detailed.diagnostics?.[0]?.type ?? "unknown";
        const existing = byIssue.get(mainIssue) ?? [];
        existing.push(s.id);
        byIssue.set(mainIssue, existing);
      }
    }

    // Print grouped issues
    const issueLabels: Record<string, string> = {
      disabled: "Disabled in config",
      not_in_allowlist: "Not in allowlist",
      platform: "Platform mismatch",
      binary: "Missing binaries",
      any_binary: "Missing binaries (any)",
      env: "Missing environment variables",
      config: "Missing config values",
      unknown: "Unknown issues",
    };

    for (const [issue, skillIds] of byIssue) {
      const label = issueLabels[issue] ?? issue;
      console.log(`\n  \x1b[33m${label}:\x1b[0m`);
      for (const id of skillIds) {
        const skill = manager.getSkillFromAll(id);
        if (skill && verbose) {
          const detailed = checkEligibilityDetailed(skill);
          const diag = detailed.diagnostics?.[0];
          console.log(`    - ${id}`);
          if (diag?.hint) {
            console.log(`      \x1b[36mHint: ${diag.hint}\x1b[0m`);
          }
        } else {
          console.log(`    - ${id}`);
        }
      }
    }

    console.log("\n─────────────────────────────────────────");
    console.log(`\x1b[36mTip: Run 'pnpm skills:cli status <skill-id>' for detailed diagnostics\x1b[0m`);
  }
}

function cmdStatusDetail(manager: SkillManager, skillId: string, verbose?: boolean): void {
  const skill = manager.getSkillFromAll(skillId);
  if (!skill) {
    console.error(`Skill not found: ${skillId}`);
    process.exit(1);
  }

  const detailed = checkEligibilityDetailed(skill);
  const metadata = skill.frontmatter.metadata;

  console.log(`\n${metadata?.emoji ?? "🔧"} ${skill.frontmatter.name}`);
  console.log("═".repeat(50));
  console.log(`ID:          ${skill.id}`);
  console.log(`Description: ${skill.frontmatter.description ?? "N/A"}`);
  console.log(`Version:     ${skill.frontmatter.version ?? "N/A"}`);
  console.log(`Source:      ${skill.source}`);
  console.log(`Path:        ${skill.filePath}`);
  console.log(`Homepage:    ${skill.frontmatter.homepage ?? metadata?.homepage ?? "N/A"}`);

  console.log();
  console.log("─".repeat(50));
  console.log(`Status: ${detailed.eligible ? "\x1b[32m✓ ELIGIBLE\x1b[0m" : "\x1b[31m✗ NOT ELIGIBLE\x1b[0m"}`);

  // Show detailed diagnostics
  if (!detailed.eligible && detailed.diagnostics) {
    console.log("\nDiagnostics:");
    for (const diag of detailed.diagnostics) {
      printDiagnostic(diag);
    }
  }

  // Show requirements summary
  const requirements = metadata?.requires;
  const hasBins = requirements?.bins?.length ?? metadata?.requiresBinaries?.length ?? 0;
  const hasAnyBins = requirements?.anyBins?.length ?? 0;
  const hasEnvs = requirements?.env?.length ?? metadata?.requiresEnv?.length ?? 0;

  if (hasBins > 0 || hasAnyBins > 0 || hasEnvs > 0) {
    console.log("\n─".repeat(50));
    console.log("Requirements:");

    if (hasBins > 0) {
      const bins = requirements?.bins ?? metadata?.requiresBinaries ?? [];
      printRequirementStatus("Binaries (all required)", bins, checkBinaries);
    }

    if (hasAnyBins > 0) {
      const anyBins = requirements?.anyBins ?? [];
      printRequirementStatus("Binaries (any one)", anyBins, checkBinaries, true);
    }

    if (hasEnvs > 0) {
      const envs = requirements?.env ?? metadata?.requiresEnv ?? [];
      printRequirementStatus("Environment vars", envs, checkEnvVars);
    }
  }

  // Show install options
  const installOptions = getInstallOptions(skill);
  if (installOptions.length > 0) {
    console.log("\n─".repeat(50));
    console.log("Install Options:");
    for (const opt of installOptions) {
      const status = opt.available ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m";
      console.log(`  ${status} [${opt.id}] ${opt.label}`);
      if (!opt.available && opt.reason) {
        console.log(`    └ ${opt.reason}`);
      }
    }
  }

  // Show quick actions if not eligible
  if (!detailed.eligible) {
    console.log("\n─".repeat(50));
    console.log("\x1b[33mQuick Actions:\x1b[0m");

    for (const diag of detailed.diagnostics ?? []) {
      if (diag.hint) {
        console.log(`  → ${diag.hint}`);
      }
    }

    if (installOptions.length > 0) {
      console.log(`  → pnpm skills:cli install ${skillId}`);
    }
  }
}

function printDiagnostic(diag: DiagnosticItem): void {
  const typeColors: Record<string, string> = {
    disabled: "\x1b[33m",
    not_in_allowlist: "\x1b[33m",
    platform: "\x1b[35m",
    binary: "\x1b[31m",
    any_binary: "\x1b[31m",
    env: "\x1b[34m",
    config: "\x1b[36m",
  };

  const color = typeColors[diag.type] ?? "\x1b[37m";
  const reset = "\x1b[0m";

  console.log(`\n  ${color}[${diag.type.toUpperCase()}]${reset}`);
  console.log(`  ${diag.message}`);

  if (diag.values && diag.values.length > 0) {
    console.log(`  Values: ${diag.values.join(", ")}`);
  }

  if (diag.hint) {
    console.log(`  \x1b[36m💡 ${diag.hint}${reset}`);
  }
}

function printRequirementStatus(
  label: string,
  items: string[],
  checker: (items: string[]) => Map<string, boolean>,
  anyMode: boolean = false,
): void {
  const status = checker(items);
  const found = Array.from(status.entries()).filter(([, ok]) => ok).map(([name]) => name);
  const missing = Array.from(status.entries()).filter(([, ok]) => !ok).map(([name]) => name);

  const allOk = anyMode ? found.length > 0 : missing.length === 0;
  const statusIcon = allOk ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m";

  console.log(`\n  ${statusIcon} ${label}:`);
  for (const [name, ok] of status) {
    const icon = ok ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m";
    console.log(`      ${icon} ${name}`);
  }
}

function checkBinaries(bins: string[]): Map<string, boolean> {
  const result = new Map<string, boolean>();
  for (const bin of bins) {
    try {
      const cmd = process.platform === "win32" ? `where ${bin}` : `which ${bin}`;
      require("child_process").execSync(cmd, { stdio: "ignore" });
      result.set(bin, true);
    } catch {
      result.set(bin, false);
    }
  }
  return result;
}

function checkEnvVars(envs: string[]): Map<string, boolean> {
  const result = new Map<string, boolean>();
  for (const env of envs) {
    result.set(env, env in process.env);
  }
  return result;
}

async function cmdInstall(manager: SkillManager, skillId: string, installId?: string): Promise<void> {
  const skill = manager.getSkillFromAll(skillId);
  if (!skill) {
    console.error(`Skill not found: ${skillId}`);
    process.exit(1);
  }

  const installOptions = getInstallOptions(skill);
  if (installOptions.length === 0) {
    console.error(`Skill '${skillId}' has no install specifications.`);
    process.exit(1);
  }

  // Show available options if multiple
  if (!installId && installOptions.length > 1) {
    console.log(`\nMultiple install options available for '${skillId}':\n`);
    for (const opt of installOptions) {
      const status = opt.available ? "available" : `unavailable: ${opt.reason}`;
      console.log(`  [${opt.id}] ${opt.label} (${status})`);
    }
    console.log(`\nUse: pnpm skills:cli install ${skillId} <install-id>`);
    return;
  }

  console.log(`\nInstalling dependencies for '${skillId}'...`);

  const result = await installSkill({
    skill,
    installId,
  });

  if (result.ok) {
    console.log(`\n\x1b[32m✓ ${result.message}\x1b[0m`);
  } else {
    console.error(`\n\x1b[31m✗ ${result.message}\x1b[0m`);
    if (result.stderr) {
      console.error("\nError output:");
      console.error(result.stderr);
    }
    process.exit(1);
  }
}

// ============================================================================
// Add/Remove Commands
// ============================================================================

async function cmdAdd(source: string, force: boolean): Promise<void> {
  console.log(`\nAdding skill from '${source}'...`);

  const result = await addSkill({
    source,
    force,
  });

  if (result.ok) {
    console.log(`\n\x1b[32m✓ ${result.message}\x1b[0m`);
    if (result.skills && result.skills.length > 1) {
      console.log("\nSkills found:");
      for (const name of result.skills) {
        console.log(`  - ${name}`);
      }
    }
    if (result.path) {
      console.log(`\nInstalled to: ${result.path}`);
    }
  } else {
    console.error(`\n\x1b[31m✗ ${result.message}\x1b[0m`);
    process.exit(1);
  }
}

async function cmdRemove(name: string): Promise<void> {
  console.log(`\nRemoving skill '${name}'...`);

  const result = await removeSkill(name);

  if (result.ok) {
    console.log(`\n\x1b[32m✓ ${result.message}\x1b[0m`);
  } else {
    console.error(`\n\x1b[31m✗ ${result.message}\x1b[0m`);
    process.exit(1);
  }
}

async function cmdListInstalled(): Promise<void> {
  const skills = await listInstalledSkills();

  if (skills.length === 0) {
    console.log("\nNo skills installed in ~/.super-multica/skills/");
    console.log("Use 'pnpm skills:cli add <source>' to add skills.");
    return;
  }

  console.log("\nInstalled skills (~/.super-multica/skills/):\n");
  for (const name of skills) {
    console.log(`  - ${name}`);
  }
  console.log(`\nTotal: ${skills.length} installed`);
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  const { command, args, verbose, force } = parseArgs(process.argv.slice(2));

  if (command === "help") {
    printHelp();
    return;
  }

  switch (command) {
    case "add":
      if (!args[0]) {
        console.error("Usage: pnpm skills:cli add <source> [--force]");
        console.error("\nSource formats:");
        console.error("  owner/repo              Clone entire repository");
        console.error("  owner/repo/skill-name   Clone single skill directory");
        console.error("  owner/repo@branch       Clone specific branch/tag");
        process.exit(1);
      }
      await cmdAdd(args[0], force);
      return;

    case "remove":
      if (!args[0]) {
        console.error("Usage: pnpm skills:cli remove <skill-name>");
        await cmdListInstalled();
        process.exit(1);
      }
      await cmdRemove(args[0]);
      return;
  }

  // Commands that need SkillManager
  const manager = new SkillManager();

  switch (command) {
    case "list":
      cmdList(manager, verbose);
      break;

    case "status":
      cmdStatus(manager, args[0], verbose);
      break;

    case "install":
      if (!args[0]) {
        console.error("Usage: pnpm skills:cli install <skill-id> [install-id]");
        process.exit(1);
      }
      await cmdInstall(manager, args[0], args[1]);
      break;

    default:
      console.error(`Unknown command: ${command}`);
      printHelp();
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(err?.stack || String(err));
  process.exit(1);
});
