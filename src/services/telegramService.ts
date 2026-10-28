import axios from "axios";
import { env } from "../config/env";
import { logger } from "../config/logger";

export class TelegramService {
  static get enabled() {
    return env.TELEGRAM_ENABLED && !!env.TELEGRAM_BOT_TOKEN;
  }

  static async sendMessage(chatId: string | undefined, text: string) {
    if (!this.enabled || !chatId) return { skipped: true };
    try {
      const { data } = await axios.post(
        `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
        { chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true },
        { timeout: 10_000 }
      );
      return { ok: true, messageId: data?.result?.message_id };
    } catch (err) {
      // Never log the URL (contains the bot token)
      logger.warn({ msg: (err as Error).message.replace(env.TELEGRAM_BOT_TOKEN, "***"), chatId }, "Telegram send failed");
      throw new Error("Telegram send failed");
    }
  }

  static async getMe(): Promise<{ ok: boolean; username?: string }> {
    if (!env.TELEGRAM_BOT_TOKEN) return { ok: false };
    try {
      const { data } = await axios.get(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getMe`, { timeout: 8_000 });
      return { ok: !!data?.ok, username: data?.result?.username };
    } catch {
      return { ok: false };
    }
  }

  static formatAnnouncement(title: string, body: string, tenantName: string): string {
    return `<b>📣 ${this.escape(title)}</b>\n\n${this.escape(body)}\n\n<i>— ${this.escape(tenantName)}</i>`;
  }

  private static escape(s: string): string {
    return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
}
