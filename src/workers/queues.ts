import { Queue } from "bullmq";
import { redis } from "../config/redis";

export interface TelegramJob { chatId: string; title: string; body: string; tenantName: string }
export const telegramQueue = new Queue<TelegramJob>("telegram", { connection: redis });
