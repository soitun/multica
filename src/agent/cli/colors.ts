/**
 * Terminal Colors and Styling
 *
 * Simple ANSI color utilities for terminal output
 */

// Check if colors should be disabled
const NO_COLOR = process.env.NO_COLOR !== undefined || process.env.TERM === "dumb";

type StyleFn = (s: string) => string;

const identity: StyleFn = (s) => s;

function style(code: number, reset: number = 0): StyleFn {
  if (NO_COLOR) return identity;
  return (s: string) => `\x1b[${code}m${s}\x1b[${reset}m`;
}

// Basic styles
export const reset = "\x1b[0m";
export const bold = style(1, 22);
export const dim = style(2, 22);
export const italic = style(3, 23);
export const underline = style(4, 24);
export const inverse = style(7, 27);

// Foreground colors
export const black = style(30, 39);
export const red = style(31, 39);
export const green = style(32, 39);
export const yellow = style(33, 39);
export const blue = style(34, 39);
export const magenta = style(35, 39);
export const cyan = style(36, 39);
export const white = style(37, 39);
export const gray = style(90, 39);

// Bright colors
export const brightRed = style(91, 39);
export const brightGreen = style(92, 39);
export const brightYellow = style(93, 39);
export const brightBlue = style(94, 39);
export const brightMagenta = style(95, 39);
export const brightCyan = style(96, 39);

// Background colors
export const bgRed = style(41, 49);
export const bgGreen = style(42, 49);
export const bgYellow = style(43, 49);
export const bgBlue = style(44, 49);

// Semantic colors for the CLI
export const colors = {
  // UI elements
  prompt: cyan,
  promptSymbol: brightCyan,
  sessionId: dim,

  // Tool output
  toolName: yellow,
  toolArgs: dim,
  toolBullet: cyan,
  toolArrow: dim,
  toolError: red,

  // Messages
  error: red,
  warning: yellow,
  success: green,
  info: blue,

  // Status bar
  statusBg: inverse,
  statusLabel: dim,
  statusValue: white,

  // Welcome banner
  bannerBorder: cyan,
  bannerText: brightCyan,

  // Suggestions
  suggestionSelected: inverse,
  suggestionDim: dim,
  suggestionLabel: gray,
};

// Spinner frames for thinking indicator
export const spinnerFrames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

// Alternative spinner styles
export const spinnerStyles = {
  dots: ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"],
  line: ["-", "\\", "|", "/"],
  arc: ["◜", "◠", "◝", "◞", "◡", "◟"],
  bounce: ["⠁", "⠂", "⠄", "⠂"],
  pulse: ["◯", "◔", "◑", "◕", "●", "◕", "◑", "◔"],
};

/**
 * Create a spinner instance
 */
export function createSpinner(options: {
  stream?: NodeJS.WritableStream;
  frames?: string[];
  interval?: number;
} = {}) {
  const {
    stream = process.stderr,
    frames = spinnerFrames,
    interval = 80,
  } = options;

  let frameIndex = 0;
  let timer: ReturnType<typeof setInterval> | null = null;
  let currentText = "";

  const render = () => {
    const frame = colors.toolBullet(frames[frameIndex % frames.length]!);
    stream.write(`\r\x1b[K${frame} ${currentText}`);
    frameIndex++;
  };

  return {
    start(text: string) {
      currentText = text;
      frameIndex = 0;
      if (timer) clearInterval(timer);
      render();
      timer = setInterval(render, interval);
    },

    update(text: string) {
      currentText = text;
    },

    stop(finalText?: string) {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      stream.write("\r\x1b[K");
      if (finalText) {
        stream.write(finalText + "\n");
      }
    },

    isSpinning() {
      return timer !== null;
    },
  };
}
