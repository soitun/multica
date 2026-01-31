#!/usr/bin/env node
import * as readline from "readline";
import { Agent } from "../runner.js";
import type { AgentOptions } from "../types.js";
import { SkillManager } from "../skills/index.js";
import { autocompleteInput, type AutocompleteOption } from "./autocomplete.js";
import { colors, dim, cyan, brightCyan, yellow, green, gray } from "./colors.js";

type CliOptions = {
  profile?: string | undefined;
  provider?: string | undefined;
  model?: string | undefined;
  system?: string | undefined;
  thinking?: string | undefined;
  cwd?: string | undefined;
  session?: string | undefined;
  help?: boolean | undefined;
};

const COMMANDS = {
  help: "Show this help message",
  exit: "Exit the CLI (aliases: quit, q)",
  clear: "Clear the current session and start fresh",
  session: "Show current session ID",
  new: "Start a new session",
  multiline: "Toggle multi-line input mode (end with a line containing only '.')",
};

function printUsage() {
  console.log(`${cyan("Usage:")} pnpm agent:interactive [options]`);
  console.log("");
  console.log(`${cyan("Options:")}`);
  console.log(`  ${yellow("--profile")} ID     Load agent profile (identity, soul, tools, memory)`);
  console.log(`  ${yellow("--provider")} NAME  LLM provider (e.g., openai, anthropic, kimi)`);
  console.log(`  ${yellow("--model")} NAME     Model name`);
  console.log(`  ${yellow("--system")} TEXT    System prompt (ignored if --profile is set)`);
  console.log(`  ${yellow("--thinking")} LEVEL Thinking level`);
  console.log(`  ${yellow("--cwd")} DIR        Working directory for commands`);
  console.log(`  ${yellow("--session")} ID     Session ID to resume`);
  console.log(`  ${yellow("--help")}, -h       Show this help`);
  console.log("");
  console.log(`${cyan("Commands")} (use during interaction):`);
  for (const [cmd, desc] of Object.entries(COMMANDS)) {
    console.log(`  ${yellow(`/${cmd}`.padEnd(14))} ${dim(desc)}`);
  }
}

function parseArgs(argv: string[]) {
  const args = [...argv];
  const opts: CliOptions = {};

  while (args.length > 0) {
    const arg = args.shift();
    if (!arg) break;
    if (arg === "--help" || arg === "-h") {
      opts.help = true;
      break;
    }
    if (arg === "--profile") {
      opts.profile = args.shift();
      continue;
    }
    if (arg === "--provider") {
      opts.provider = args.shift();
      continue;
    }
    if (arg === "--model") {
      opts.model = args.shift();
      continue;
    }
    if (arg === "--system") {
      opts.system = args.shift();
      continue;
    }
    if (arg === "--thinking") {
      opts.thinking = args.shift();
      continue;
    }
    if (arg === "--cwd") {
      opts.cwd = args.shift();
      continue;
    }
    if (arg === "--session") {
      opts.session = args.shift();
      continue;
    }
  }

  return opts;
}

function printWelcome(sessionId: string, opts: CliOptions) {
  const border = cyan("│");
  const topBorder = cyan("╭─────────────────────────────────────────╮");
  const bottomBorder = cyan("╰─────────────────────────────────────────╯");

  console.log(topBorder);
  console.log(`${border}     ${brightCyan("Super Multica Interactive CLI")}       ${border}`);
  console.log(bottomBorder);

  // Show configuration
  const configLines: string[] = [];
  configLines.push(`${dim("Session:")} ${gray(sessionId.slice(0, 8))}...`);
  if (opts.profile) {
    configLines.push(`${dim("Profile:")} ${yellow(opts.profile)}`);
  }
  if (opts.provider) {
    configLines.push(`${dim("Provider:")} ${green(opts.provider)}`);
  }
  if (opts.model) {
    configLines.push(`${dim("Model:")} ${green(opts.model)}`);
  }

  console.log(configLines.join("  "));
  console.log(`${dim("Type")} ${cyan("/help")} ${dim("for commands,")} ${cyan("/exit")} ${dim("to quit.")}`);
  console.log("");
}

function printHelp(skillManager?: SkillManager) {
  console.log(`\n${cyan("Built-in commands:")}`);
  for (const [cmd, desc] of Object.entries(COMMANDS)) {
    console.log(`  ${yellow(`/${cmd}`.padEnd(14))} ${dim(desc)}`);
  }

  // Show skill commands if available
  if (skillManager) {
    const reservedNames = new Set(Object.keys(COMMANDS));
    const skillCommands = skillManager.getSkillCommands({ reservedNames });
    if (skillCommands.length > 0) {
      console.log(`\n${cyan("Skill commands:")}`);
      for (const cmd of skillCommands) {
        console.log(`  ${yellow(`/${cmd.name}`.padEnd(14))} ${dim(cmd.description)}`);
      }
    }
  }

  console.log(`\n${dim("Just type your message and press Enter to chat with the agent.")}`);
  console.log("");
}

/**
 * Status Bar - renders a persistent status line at the bottom of the terminal
 */
class StatusBar {
  private enabled: boolean;
  private currentStatus: string = "";
  private stream: NodeJS.WriteStream;

  constructor(stream: NodeJS.WriteStream = process.stdout) {
    this.stream = stream;
    this.enabled = stream.isTTY === true;
  }

  /**
   * Update the status bar content
   */
  update(parts: { session?: string; provider?: string; model?: string; tokens?: number }) {
    if (!this.enabled) return;

    const segments: string[] = [];

    if (parts.session) {
      segments.push(`${dim("session:")}${gray(parts.session.slice(0, 8))}`);
    }
    if (parts.provider) {
      segments.push(`${dim("provider:")}${green(parts.provider)}`);
    }
    if (parts.model) {
      segments.push(`${dim("model:")}${yellow(parts.model)}`);
    }
    if (parts.tokens !== undefined) {
      segments.push(`${dim("tokens:")}${cyan(String(parts.tokens))}`);
    }

    this.currentStatus = segments.join("  ");
    this.render();
  }

  /**
   * Render the status bar
   */
  private render() {
    if (!this.enabled || !this.currentStatus) return;

    const termWidth = this.stream.columns || 80;
    const termHeight = this.stream.rows || 24;

    // Save cursor, move to bottom, clear line, write status, restore cursor
    const statusLine = ` ${this.currentStatus} `.slice(0, termWidth);

    this.stream.write(
      `\x1b[s` + // Save cursor
      `\x1b[${termHeight};1H` + // Move to last row
      `\x1b[7m` + // Inverse video (highlight)
      `\x1b[2K` + // Clear line
      statusLine.padEnd(termWidth) + // Write status padded to terminal width
      `\x1b[0m` + // Reset
      `\x1b[u` // Restore cursor
    );
  }

  /**
   * Clear the status bar
   */
  clear() {
    if (!this.enabled) return;

    const termHeight = this.stream.rows || 24;

    this.stream.write(
      `\x1b[s` + // Save cursor
      `\x1b[${termHeight};1H` + // Move to last row
      `\x1b[2K` + // Clear line
      `\x1b[u` // Restore cursor
    );
    this.currentStatus = "";
  }

  /**
   * Temporarily hide status bar (for clean output)
   */
  hide() {
    this.clear();
  }

  /**
   * Show status bar again
   */
  show() {
    this.render();
  }
}

class InteractiveCLI {
  private agent: Agent;
  private opts: CliOptions;
  private rl: readline.Interface | null = null;
  private multilineMode = false;
  private multilineBuffer: string[] = [];
  private running = true;
  private skillManager: SkillManager;
  private reservedNames: Set<string>;
  private statusBar: StatusBar;

  constructor(opts: CliOptions) {
    this.opts = opts;
    this.agent = this.createAgent(opts.session);
    this.statusBar = new StatusBar();

    // Initialize SkillManager for tab completion
    this.skillManager = new SkillManager({
      profileId: opts.profile,
    });

    // Build list of reserved command names (built-in CLI commands)
    this.reservedNames = new Set(Object.keys(COMMANDS));

    // Handle Ctrl+C gracefully
    process.on("SIGINT", () => {
      this.statusBar.clear();
      console.log(`\n${dim("Goodbye!")}`);
      process.exit(0);
    });
  }

  /**
   * Get or create readline interface (lazy initialization)
   * Only created when needed for multiline mode to avoid interfering with autocomplete
   */
  private getReadline(): readline.Interface {
    if (!this.rl) {
      this.rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        terminal: true,
      });

      this.rl.on("close", () => {
        this.running = false;
        this.statusBar.clear();
        console.log(`\n${dim("Goodbye!")}`);
        process.exit(0);
      });
    }
    return this.rl;
  }

  /**
   * Close readline interface when not needed
   */
  private closeReadline() {
    if (this.rl) {
      this.rl.close();
      this.rl = null;
    }
  }

  /**
   * Get autocomplete suggestions for input
   */
  private getSuggestions(input: string): AutocompleteOption[] {
    if (!input.startsWith("/")) {
      return [];
    }

    const prefix = input.slice(1).toLowerCase();
    const suggestions: AutocompleteOption[] = [];

    // Add built-in command suggestions
    for (const [cmd, desc] of Object.entries(COMMANDS)) {
      if (cmd.toLowerCase().startsWith(prefix)) {
        suggestions.push({
          value: `/${cmd}`,
          label: desc.slice(0, 40),
        });
      }
    }

    // Add skill command suggestions
    const skillCommands = this.skillManager.getSkillCommands({ reservedNames: this.reservedNames });
    for (const cmd of skillCommands) {
      if (cmd.name.toLowerCase().startsWith(prefix)) {
        suggestions.push({
          value: `/${cmd.name}`,
          label: cmd.description.slice(0, 40),
        });
      }
    }

    // Sort: shorter first, then alphabetically
    suggestions.sort((a, b) => {
      if (a.value.length !== b.value.length) return a.value.length - b.value.length;
      return a.value.localeCompare(b.value);
    });

    return suggestions;
  }

  private createAgent(sessionId?: string): Agent {
    return new Agent({
      profileId: this.opts.profile,
      provider: this.opts.provider,
      model: this.opts.model,
      systemPrompt: this.opts.system,
      thinkingLevel: this.opts.thinking as AgentOptions["thinkingLevel"],
      cwd: this.opts.cwd,
      sessionId,
    });
  }

  private prompt(): string {
    if (this.multilineMode) {
      return this.multilineBuffer.length === 0 ? cyan(">>> ") : cyan("... ");
    }
    return `${brightCyan("You:")} `;
  }

  private updateStatusBar() {
    const statusUpdate: { session?: string; provider?: string; model?: string; tokens?: number } = {
      session: this.agent.sessionId,
      provider: this.opts.provider ?? "default",
    };
    if (this.opts.model) {
      statusUpdate.model = this.opts.model;
    }
    this.statusBar.update(statusUpdate);
  }

  async run() {
    printWelcome(this.agent.sessionId, this.opts);
    this.updateStatusBar();
    await this.loop();
  }

  private async loop() {
    while (this.running) {
      let input: string;

      if (this.multilineMode) {
        // Use simple readline for multiline mode
        const lineInput = await this.readline(this.prompt());
        if (lineInput === null) break;
        input = lineInput;

        if (input === ".") {
          // End of multiline input
          const fullInput = this.multilineBuffer.join("\n");
          this.multilineBuffer = [];
          this.multilineMode = false;
          // Close readline to avoid interfering with autocomplete
          this.closeReadline();
          if (fullInput.trim()) {
            await this.handleInput(fullInput);
          }
        } else {
          this.multilineBuffer.push(input);
        }
        continue;
      }

      // Use autocomplete input for normal mode
      try {
        this.statusBar.hide();
        input = await autocompleteInput({
          prompt: this.prompt(),
          getSuggestions: (text) => this.getSuggestions(text),
          maxSuggestions: 8,
        });
        this.statusBar.show();
      } catch {
        break;
      }

      const trimmed = input.trim();
      if (!trimmed) continue;

      if (trimmed.startsWith("/")) {
        const handled = await this.handleCommand(trimmed);
        if (!handled) {
          await this.handleInput(trimmed);
        }
      } else {
        await this.handleInput(trimmed);
      }
    }
  }

  private readline(prompt: string): Promise<string | null> {
    return new Promise((resolve) => {
      this.getReadline().question(prompt, (answer) => {
        resolve(answer);
      });
    });
  }

  private async handleCommand(input: string): Promise<boolean> {
    const cmd = input.slice(1).toLowerCase().split(/\s+/)[0];

    switch (cmd) {
      case "help":
        printHelp(this.skillManager);
        return true;

      case "exit":
      case "quit":
      case "q":
        this.statusBar.clear();
        console.log(dim("Goodbye!"));
        this.running = false;
        this.closeReadline();
        process.exit(0);
        return true;

      case "clear":
        this.agent = this.createAgent();
        this.updateStatusBar();
        console.log(`${green("Session cleared.")} ${dim("New session:")} ${gray(this.agent.sessionId.slice(0, 8))}...\n`);
        return true;

      case "session":
        console.log(`${dim("Current session:")} ${cyan(this.agent.sessionId)}\n`);
        return true;

      case "new":
        this.agent = this.createAgent();
        this.updateStatusBar();
        console.log(`${green("Started new session:")} ${gray(this.agent.sessionId.slice(0, 8))}...\n`);
        return true;

      case "multiline":
        this.multilineMode = !this.multilineMode;
        if (this.multilineMode) {
          console.log(`${green("Multi-line mode enabled.")} ${dim("End input with a line containing only '.'")}`);
          this.multilineBuffer = [];
        } else {
          console.log(dim("Multi-line mode disabled."));
          this.multilineBuffer = [];
          // Close readline to avoid interfering with autocomplete
          this.closeReadline();
        }
        return true;

      default:
        // Check if it's a skill command
        const invocation = this.skillManager.resolveCommand(input);
        if (invocation) {
          // Skill command found - send to agent with skill instructions as context
          const skillPrompt = invocation.args
            ? `[Skill: ${invocation.command.name}]\n\n${invocation.instructions}\n\nUser request: ${invocation.args}`
            : `[Skill: ${invocation.command.name}]\n\n${invocation.instructions}`;
          await this.handleInput(skillPrompt);
          return true;
        }
        // Unknown command - let the agent handle it as-is
        return false;
    }
  }

  private async handleInput(input: string) {
    try {
      console.log(""); // Add spacing before response
      this.statusBar.hide();
      const result = await this.agent.run(input);
      this.statusBar.show();
      if (result.error) {
        console.error(`\n${colors.error(`Error: ${result.error}`)}`);
      }
      console.log(""); // Add spacing after response
    } catch (err) {
      console.error(`\n${colors.error(`Error: ${err instanceof Error ? err.message : String(err)}`)}`);
      console.log("");
    }
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.help) {
    printUsage();
    return;
  }

  // Check if running in a TTY
  if (!process.stdin.isTTY) {
    console.error(colors.error("Error: Interactive CLI requires a TTY. Use agent:cli for non-interactive mode."));
    process.exit(1);
  }

  const cli = new InteractiveCLI(opts);
  await cli.run();
}

main().catch((err) => {
  console.error(err?.stack || String(err));
  process.exit(1);
});
