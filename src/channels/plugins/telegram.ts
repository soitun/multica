/**
 * Telegram channel plugin.
 *
 * Uses grammy to connect to Telegram Bot API via long polling.
 * - Private chats: all messages are processed
 * - Group chats: only messages that @mention the bot or reply to the bot
 */

import { Bot, GrammyError } from "grammy";
import type { ChannelPlugin, ChannelMessage, ChannelConfigAdapter, ChannelsConfig, DeliveryContext } from "../types.js";
import { markdownToTelegramHtml } from "./telegram-format.js";

/** Telegram account config shape */
interface TelegramAccountConfig {
  botToken: string;
}

/** Keep bot instances per account for outbound use */
const bots = new Map<string, Bot>();

/** Check if a GrammyError is an HTML parse failure */
function isParseError(err: unknown): boolean {
  return err instanceof GrammyError && err.description.includes("can't parse entities");
}

/** Send a message with HTML formatting, fallback to plain text on parse error */
async function sendFormatted(
  bot: Bot,
  chatId: number,
  text: string,
  extra?: Record<string, unknown>,
): Promise<void> {
  const html = markdownToTelegramHtml(text);
  try {
    await bot.api.sendMessage(chatId, html, { ...extra, parse_mode: "HTML" });
  } catch (err) {
    if (isParseError(err)) {
      console.warn("[Telegram] HTML parse failed, retrying as plain text");
      await bot.api.sendMessage(chatId, text, extra);
    } else {
      throw err;
    }
  }
}

export const telegramChannel: ChannelPlugin = {
  id: "telegram",
  meta: {
    name: "Telegram",
    description: "Telegram bot integration via long polling",
  },

  config: {
    listAccountIds(config: ChannelsConfig): string[] {
      const section = config["telegram"];
      return section ? Object.keys(section) : [];
    },

    resolveAccount(config: ChannelsConfig, accountId: string): Record<string, unknown> | undefined {
      return config["telegram"]?.[accountId];
    },

    isConfigured(account: Record<string, unknown>): boolean {
      return Boolean((account as unknown as TelegramAccountConfig).botToken);
    },
  } satisfies ChannelConfigAdapter,

  gateway: {
    async start(
      accountId: string,
      config: Record<string, unknown>,
      onMessage: (message: ChannelMessage) => void,
      signal: AbortSignal,
    ): Promise<void> {
      const { botToken } = config as unknown as TelegramAccountConfig;

      const bot = new Bot(botToken);
      bots.set(accountId, bot);

      // Get bot info for mention detection
      const botInfo = await bot.api.getMe();
      const botUsername = botInfo.username;
      console.log(`[Telegram] Starting bot: @${botUsername}`);

      // Handle text messages
      bot.on("message:text", (ctx) => {
        const msg = ctx.message;
        const isGroup = msg.chat.type === "group" || msg.chat.type === "supergroup";

        // In groups, only respond if bot is mentioned or replied to
        if (isGroup) {
          const isMentioned = msg.entities?.some(
            (e) =>
              e.type === "mention" &&
              msg.text.substring(e.offset, e.offset + e.length).toLowerCase() === `@${botUsername?.toLowerCase()}`,
          );
          const isReplyToBot = msg.reply_to_message?.from?.is_bot === true;

          if (!isMentioned && !isReplyToBot) {
            return; // Ignore group messages not directed at bot
          }
          console.log(`[Telegram] Received message: chatId=${msg.chat.id} from=${msg.from?.id} type=group text="${msg.text.slice(0, 50)}"`);
        } else {
          console.log(`[Telegram] Received message: chatId=${msg.chat.id} from=${msg.from?.id} type=direct text="${msg.text.slice(0, 50)}"`);
        }

        // Strip @mention from text for cleaner agent input
        let text = msg.text;
        if (botUsername) {
          text = text.replace(new RegExp(`@${botUsername}\\s*`, "gi"), "").trim();
        }
        if (!text) return;

        onMessage({
          messageId: String(msg.message_id),
          conversationId: String(msg.chat.id),
          senderId: String(msg.from?.id ?? "unknown"),
          text,
          chatType: isGroup ? "group" : "direct",
        });
      });

      // Graceful shutdown on abort
      signal.addEventListener("abort", () => {
        console.log("[Telegram] Bot stopped");
        bot.stop();
        bots.delete(accountId);
      });

      // Start long polling (fire-and-forget, errors are caught here)
      console.log("[Telegram] Bot is polling for messages");
      bot.start({
        onStart: () => {
          // Already logged above
        },
      }).catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("409") || msg.includes("Conflict")) {
          console.error(`[Telegram] Bot conflict: another instance is already polling with this token. Stop the other process and restart.`);
        } else {
          console.error(`[Telegram] Bot polling error: ${msg}`);
        }
        bots.delete(accountId);
      });
    },
  },

  outbound: {
    async sendText(ctx: DeliveryContext, text: string): Promise<void> {
      const bot = bots.get(ctx.accountId);
      if (!bot) throw new Error(`No Telegram bot for account ${ctx.accountId}`);

      console.log(`[Telegram] Sending message to chatId=${ctx.conversationId}`);
      await sendFormatted(bot, Number(ctx.conversationId), text);
    },

    async replyText(ctx: DeliveryContext, text: string): Promise<void> {
      const bot = bots.get(ctx.accountId);
      if (!bot) throw new Error(`No Telegram bot for account ${ctx.accountId}`);

      if (ctx.replyToMessageId) {
        console.log(`[Telegram] Sending reply to chatId=${ctx.conversationId} (replyTo=${ctx.replyToMessageId})`);
        await sendFormatted(bot, Number(ctx.conversationId), text, {
          reply_to_message_id: Number(ctx.replyToMessageId),
        });
      } else {
        await telegramChannel.outbound.sendText(ctx, text);
      }
    },

    async sendTyping(ctx: DeliveryContext): Promise<void> {
      const bot = bots.get(ctx.accountId);
      if (!bot) return;

      try {
        await bot.api.sendChatAction(Number(ctx.conversationId), "typing");
      } catch {
        // Best-effort — typing indicator failure is not critical
      }
    },
  },
};
