import mongoose from "mongoose";
import { env } from "./env";
import { logger } from "./logger";

let listenersAttached = false;

export async function connectMongo(): Promise<void> {
  if (mongoose.connection.readyState === 1) return;
  mongoose.set("strictQuery", true);
  if (!listenersAttached) {
    mongoose.connection.on("error", (err) => logger.error({ err }, "MongoDB error"));
    mongoose.connection.on("disconnected", () => logger.warn("MongoDB disconnected"));
    mongoose.connection.on("reconnected", () => logger.info("MongoDB reconnected"));
    listenersAttached = true;
  }
  await mongoose.connect(env.MONGODB_URI, {
    dbName: env.MONGODB_DB,
    // Indexes (incl. unique constraints) MUST exist in production.
    autoIndex: true,
    maxPoolSize: 50,
    serverSelectionTimeoutMS: 10_000,
    socketTimeoutMS: 45_000
  });
  logger.info({ db: env.MONGODB_DB }, "MongoDB connected");
}

export async function disconnectMongo(): Promise<void> {
  await mongoose.disconnect();
}

export function mongoReady(): boolean {
  return mongoose.connection.readyState === 1;
}
