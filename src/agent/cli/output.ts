import type { AgentEvent, AgentMessage } from "@mariozechner/pi-agent-core";
import { colors, createSpinner } from "./colors.js";

export type AgentOutputState = {
  lastAssistantText: string;
  printedLen: number;
  streaming: boolean;
};

export type AgentOutput = {
  state: AgentOutputState;
  handleEvent: (event: AgentEvent) => void;
};

function extractText(message: AgentMessage | undefined): string {
  if (!message || typeof message !== "object" || !("content" in message)) return "";
  const content = (message as { content?: Array<{ type: string; text?: string }> }).content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((c) => c.type === "text")
    .map((c) => c.text ?? "")
    .join("");
}

function toolDisplayName(name: string): string {
  const map: Record<string, string> = {
    read: "ReadFile",
    write: "WriteFile",
    edit: "EditFile",
    exec: "Exec",
    process: "Process",
    grep: "Grep",
    find: "FindFiles",
    ls: "ListDir",
  };
  return map[name] || name;
}

function formatToolArgs(name: string, args: unknown): string {
  if (!args || typeof args !== "object") return "";
  const record = args as Record<string, unknown>;
  const get = (key: string) => (record[key] !== undefined ? String(record[key]) : "");
  switch (name) {
    case "read":
      return get("path") || get("file");
    case "write":
      return get("path") || get("file");
    case "edit":
      return get("path") || get("file");
    case "grep":
      return [get("pattern"), get("path") || get("directory")].filter(Boolean).join(" ");
    case "find":
      return [get("glob") || get("pattern"), get("path") || get("directory")].filter(Boolean).join(" ");
    case "ls":
      return get("path") || get("directory");
    case "exec":
      return get("command");
    case "process":
      return [get("action"), get("id")].filter(Boolean).join(" ");
    default:
      return "";
  }
}

function formatToolLine(name: string, args: unknown): string {
  const title = colors.toolName(toolDisplayName(name));
  const argText = formatToolArgs(name, args);
  const bullet = colors.toolBullet("•");
  if (argText) {
    return `${bullet} ${title} ${colors.toolArgs(`(${argText})`)}`;
  }
  return `${bullet} ${title}`;
}

export function createAgentOutput(params: {
  stdout: NodeJS.WritableStream;
  stderr: NodeJS.WritableStream;
}): AgentOutput {
  const state: AgentOutputState = {
    lastAssistantText: "",
    printedLen: 0,
    streaming: false,
  };

  // Create spinner for thinking indicator
  const spinner = createSpinner({ stream: params.stderr });
  let pendingToolName = "";
  let pendingToolArgs: unknown = null;

  const handleEvent = (event: AgentEvent) => {
    switch (event.type) {
      case "message_start": {
        const msg = event.message;
        if (msg.role === "assistant") {
          // Stop any running spinner when assistant starts responding
          if (spinner.isSpinning()) {
            spinner.stop();
          }
          state.streaming = true;
          state.printedLen = 0;
          const text = extractText(msg);
          if (text.length > 0) {
            params.stdout.write(text);
            state.printedLen = text.length;
          }
        }
        break;
      }
      case "message_update": {
        const msg = event.message;
        if (msg.role === "assistant") {
          const text = extractText(msg);
          if (text.length > state.printedLen) {
            params.stdout.write(text.slice(state.printedLen));
            state.printedLen = text.length;
          }
        }
        break;
      }
      case "message_end": {
        const msg = event.message;
        if (msg.role === "assistant") {
          const text = extractText(msg);
          if (text.length > state.printedLen) {
            params.stdout.write(text.slice(state.printedLen));
            state.printedLen = text.length;
          }
          if (state.streaming) params.stdout.write("\n");
          state.streaming = false;
          state.lastAssistantText = text;
        }
        break;
      }
      case "tool_execution_start": {
        pendingToolName = event.toolName;
        pendingToolArgs = event.args;
        const title = colors.toolName(toolDisplayName(event.toolName));
        const argText = formatToolArgs(event.toolName, event.args);
        const displayText = argText ? `${title} ${colors.toolArgs(`(${argText})`)}` : title;
        spinner.start(displayText);
        break;
      }
      case "tool_execution_update": {
        // Show real-time output updates (e.g., from exec tool)
        const updateText = extractText(event.partialResult);
        if (updateText && pendingToolName) {
          const title = colors.toolName(toolDisplayName(pendingToolName));
          const preview = colors.toolArgs(updateText.slice(-50).replace(/\n/g, " "));
          spinner.update(`${title} ${colors.toolArrow("→")} ${preview}`);
        }
        break;
      }
      case "tool_execution_end": {
        // Stop spinner and show final result
        if (event.isError) {
          const errorText = extractText(event.result) || "Tool failed";
          const bullet = colors.toolError("✗");
          const title = colors.toolName(toolDisplayName(event.toolName));
          spinner.stop(`${bullet} ${title}: ${colors.toolError(errorText)}`);
        } else {
          spinner.stop(formatToolLine(event.toolName, pendingToolArgs));
        }
        pendingToolName = "";
        pendingToolArgs = null;
        break;
      }
      default:
        break;
    }
  };

  return { state, handleEvent };
}
