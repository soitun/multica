/**
 * Autocomplete Input
 *
 * Real-time dropdown autocomplete for terminal input
 * No external dependencies - uses raw terminal control
 */

import * as readline from "readline";
import { colors } from "./colors.js";

export interface AutocompleteOption {
  value: string;
  label?: string;
}

export interface AutocompleteConfig {
  /** Function to get suggestions based on current input */
  getSuggestions: (input: string) => AutocompleteOption[];
  /** Prompt string */
  prompt?: string;
  /** Max suggestions to show */
  maxSuggestions?: number;
}

// ANSI escape codes
const ESC = "\x1b";
const CLEAR_LINE = `${ESC}[2K`;
const CURSOR_UP = (n: number) => (n > 0 ? `${ESC}[${n}A` : "");
const CURSOR_TO_COL = (n: number) => `${ESC}[${n}G`;
const RESET = `${ESC}[0m`;
const INVERSE = `${ESC}[7m`;
const SHOW_CURSOR = `${ESC}[?25h`;
const SAVE_CURSOR = `${ESC}[s`;
const RESTORE_CURSOR = `${ESC}[u`;
const CLEAR_TO_END = `${ESC}[J`;
const CURSOR_DOWN = (n: number) => (n > 0 ? `${ESC}[${n}B` : "");

// Strip ANSI escape codes to get visual length
const ANSI_REGEX = /\x1b\[[0-9;]*m/g;
function stripAnsi(str: string): string {
  return str.replace(ANSI_REGEX, "");
}

/**
 * Read a line with real-time autocomplete dropdown
 */
export function autocompleteInput(config: AutocompleteConfig): Promise<string> {
  return new Promise((resolve) => {
    const { getSuggestions, prompt = "> ", maxSuggestions = 5 } = config;

    const stdin = process.stdin;
    const stdout = process.stdout;

    let input = "";
    let cursorPos = 0;
    let suggestions: AutocompleteOption[] = [];
    let selectedIndex = -1;
    let initialized = false;

    // Enable raw mode
    if (stdin.isTTY) {
      stdin.setRawMode(true);
    }
    readline.emitKeypressEvents(stdin);

    const cleanup = () => {
      stdout.write(SHOW_CURSOR);
      if (stdin.isTTY) {
        stdin.setRawMode(false);
      }
      stdin.removeListener("keypress", onKeypress);
    };

    const render = () => {
      if (!initialized) {
        // First render - save cursor position as anchor
        stdout.write(SAVE_CURSOR);
        initialized = true;
      } else {
        // Restore to anchor and clear everything after it
        stdout.write(RESTORE_CURSOR);
        stdout.write(CLEAR_TO_END);
        // Re-save in case terminal scrolled
        stdout.write(SAVE_CURSOR);
      }

      // Write prompt and input
      stdout.write(`${prompt}${input}`);

      // Calculate cursor position accounting for line wrapping
      const termWidth = stdout.columns || 80;
      const promptVisualLen = stripAnsi(prompt).length;
      const cursorOffset = promptVisualLen + cursorPos;

      // Handle edge case: when cursor is exactly at line boundary,
      // show it at end of current line, not start of next line
      let cursorRow: number;
      let cursorCol: number;
      if (cursorOffset > 0 && cursorOffset % termWidth === 0) {
        cursorRow = cursorOffset / termWidth - 1;
        cursorCol = termWidth;
      } else {
        cursorRow = Math.floor(cursorOffset / termWidth);
        cursorCol = (cursorOffset % termWidth) + 1;
      }

      // Calculate total lines for suggestions positioning
      const totalLength = promptVisualLen + input.length;
      const totalLines = Math.ceil(totalLength / termWidth) || 1;

      // Get and display suggestions if input starts with /
      if (input.startsWith("/") && input.length > 1) {
        suggestions = getSuggestions(input).slice(0, maxSuggestions);

        if (suggestions.length > 0) {
          // Ensure selectedIndex is valid
          if (selectedIndex >= suggestions.length) {
            selectedIndex = suggestions.length - 1;
          }

          // Move to end of input text before showing suggestions
          // Cursor is currently at end of text, just go to new line
          stdout.write("\n");

          for (let i = 0; i < suggestions.length; i++) {
            const opt = suggestions[i]!;
            const isSelected = i === selectedIndex;
            const value = isSelected
              ? `${INVERSE}  ${opt.value}${RESET}`
              : `  ${colors.suggestionDim(opt.value)}`;
            const label = opt.label ? ` ${colors.suggestionLabel(opt.label)}` : "";
            const line = `${value}${label}`;

            stdout.write(`${CLEAR_LINE}${line}`);
            if (i < suggestions.length - 1) {
              stdout.write("\n");
            }
          }

          // Move cursor back up to input line (accounting for wrapped lines)
          const linesFromEnd = totalLines - 1 - cursorRow;
          stdout.write(CURSOR_UP(suggestions.length + linesFromEnd));
          stdout.write(CURSOR_TO_COL(cursorCol));
        }
      } else {
        suggestions = [];
        selectedIndex = -1;
      }

      // Position cursor for wrapped text
      // After writing, cursor is at end of text. Move to correct position.
      // Go back to start of input block, then move to target row/col
      const endRow = totalLines - 1;
      if (endRow > cursorRow) {
        stdout.write(CURSOR_UP(endRow - cursorRow));
      }
      stdout.write(CURSOR_TO_COL(cursorCol));
    };

    const submit = (value: string) => {
      // Clear suggestions before submitting
      stdout.write(RESTORE_CURSOR);
      stdout.write(CLEAR_TO_END);
      stdout.write(`${prompt}${value}\n`);
      cleanup();
      resolve(value);
    };

    const onKeypress = (_char: string, key: readline.Key) => {
      if (!key) return;

      // Handle Ctrl+C
      if (key.ctrl && key.name === "c") {
        cleanup();
        process.exit(0);
      }

      // Handle Ctrl+D (EOF)
      if (key.ctrl && key.name === "d") {
        cleanup();
        stdout.write("\n");
        resolve("");
        return;
      }

      // Handle Enter
      if (key.name === "return" || key.name === "enter") {
        if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
          // Use selected suggestion
          const selected = suggestions[selectedIndex]!;
          submit(selected.value);
        } else {
          submit(input);
        }
        return;
      }

      // Handle Tab - cycle through suggestions or complete selected one
      if (key.name === "tab") {
        if (suggestions.length > 0) {
          if (selectedIndex >= 0) {
            // Already have a selection - complete it to input
            const selected = suggestions[selectedIndex]!;
            input = selected.value + " ";
            cursorPos = input.length;
            selectedIndex = -1;
            render();
          } else {
            // No selection yet - select first item
            if (key.shift) {
              selectedIndex = suggestions.length - 1;
            } else {
              selectedIndex = 0;
            }
            render();
          }
        }
        return;
      }

      // Handle arrow keys
      if (key.name === "up") {
        if (suggestions.length > 0) {
          selectedIndex = selectedIndex <= 0 ? suggestions.length - 1 : selectedIndex - 1;
          render();
        }
        return;
      }

      if (key.name === "down") {
        if (suggestions.length > 0) {
          selectedIndex = selectedIndex >= suggestions.length - 1 ? 0 : selectedIndex + 1;
          render();
        }
        return;
      }

      // Handle Escape - clear selection
      if (key.name === "escape") {
        selectedIndex = -1;
        render();
        return;
      }

      // Handle backspace
      if (key.name === "backspace") {
        if (cursorPos > 0) {
          input = input.slice(0, cursorPos - 1) + input.slice(cursorPos);
          cursorPos--;
          selectedIndex = -1;
          render();
        }
        return;
      }

      // Handle delete
      if (key.name === "delete") {
        if (cursorPos < input.length) {
          input = input.slice(0, cursorPos) + input.slice(cursorPos + 1);
          selectedIndex = -1;
          render();
        }
        return;
      }

      // Handle left arrow
      if (key.name === "left") {
        if (cursorPos > 0) {
          cursorPos--;
          render();
        }
        return;
      }

      // Handle right arrow
      if (key.name === "right") {
        if (cursorPos < input.length) {
          cursorPos++;
          render();
        }
        return;
      }

      // Handle home
      if (key.name === "home" || (key.ctrl && key.name === "a")) {
        cursorPos = 0;
        render();
        return;
      }

      // Handle end
      if (key.name === "end" || (key.ctrl && key.name === "e")) {
        cursorPos = input.length;
        render();
        return;
      }

      // Handle printable characters
      if (key.sequence && !key.ctrl && !key.meta) {
        const char = key.sequence;
        if (char.length === 1 && char.charCodeAt(0) >= 32) {
          input = input.slice(0, cursorPos) + char + input.slice(cursorPos);
          cursorPos++;
          selectedIndex = -1;
          render();
        }
      }
    };

    stdin.on("keypress", onKeypress);
    render();
  });
}
