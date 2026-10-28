import express, { Application } from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import pinoHttp from "pino-http";
import path from "path";
import { env } from "./config/env";
import { logger } from "./config/logger";
import routes from "./routes";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import { apiLimiter } from "./middleware/rateLimiter";
import { requestId } from "./middleware/requestId";
import { mongoReady } from "./config/database";
import { redisReady } from "./config/redis";

export function createApp(): Application {
  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", env.TRUST_PROXY);

  app.use(requestId);
  const csp: any = {
    useDefaults: true,
    directives: {
      "script-src": ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
      "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      "font-src": ["'self'", "https://fonts.gstatic.com", "data:"],
      "img-src": ["'self'", "data:", "blob:", "https:"],
      "connect-src": ["'self'", ...env.CORS_ORIGINS],
      "upgrade-insecure-requests": env.NODE_ENV === "production" ? [] : null
    }
  };
  app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" }, contentSecurityPolicy: csp }));
  app.use(
    cors({
      // Same-origin / server-to-server requests have no Origin header and are allowed.
      origin: (origin, cb) => cb(null, !origin || env.CORS_ORIGINS.includes(origin)),
      credentials: true,
      exposedHeaders: ["x-request-id", "x-data-source"]
    })
  );
  app.use(compression());
  app.use(express.json({ limit: "1mb" }));
  app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === "/health" }, customProps: (req) => ({ reqId: (req as any).requestId }) }));

  app.get("/health", (_req, res) => {
    const mongo = mongoReady();
    const redisOk = redisReady();
    const ok = mongo && redisOk;
    res.status(ok ? 200 : 503).json({ status: ok ? "ok" : "degraded", uptime: process.uptime(), mongo, redis: redisOk });
  });

  app.use(`/api/${env.API_VERSION}`, apiLimiter, routes);

  if (env.UPLOAD_PROVIDER === "local") {
    app.use(
      env.LOCAL_UPLOAD_PUBLIC_URL,
      express.static(path.resolve(env.LOCAL_UPLOAD_DIR), { maxAge: "30d", immutable: true, index: false, dotfiles: "deny", setHeaders: (res) => res.setHeader("X-Content-Type-Options", "nosniff") })
    );
  }

  const publicDir = path.resolve(process.cwd(), "public");
  app.use(express.static(publicDir, { maxAge: "1h", index: false, dotfiles: "deny" }));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api/") || req.path.startsWith(env.LOCAL_UPLOAD_PUBLIC_URL) || req.path === "/health") return next();
    res.sendFile(path.join(publicDir, "index.html"), (err) => {
      if (err) next();
    });
  });

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
