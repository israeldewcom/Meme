import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import mongoose from "mongoose";
import multer from "multer";
import { ApiError } from "../utils/ApiError";
import { logger } from "../config/logger";

export function notFoundHandler(req: Request, _res: Response, next: NextFunction) {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.path}`));
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  let status = 500;
  let message = "Internal server error";
  let details: unknown;
  let code: string | undefined;

  if (err instanceof ApiError) {
    status = err.statusCode;
    message = err.message;
    details = err.details;
    code = err.code;
  } else if (err instanceof ZodError) {
    status = 422;
    message = "Validation failed";
    details = err.flatten();
    code = "VALIDATION_ERROR";
  } else if (err instanceof multer.MulterError) {
    status = err.code === "LIMIT_FILE_SIZE" ? 413 : 400;
    message = err.message;
    code = "UPLOAD_ERROR";
  } else if (err instanceof mongoose.Error.ValidationError) {
    status = 422;
    message = "Database validation failed";
    details = Object.fromEntries(Object.entries(err.errors).map(([k, v]) => [k, v.message]));
    code = "DB_VALIDATION";
  } else if (err instanceof mongoose.Error.CastError) {
    status = 400;
    message = `Invalid ${err.path}`;
    code = "CAST_ERROR";
  } else if ((err as any)?.code === 11000) {
    status = 409;
    message = "Duplicate entry";
    code = "DUPLICATE";
  } else if ((err as any)?.type === "entity.too.large") {
    status = 413;
    message = "Payload too large";
    code = "PAYLOAD_TOO_LARGE";
  } else if (err instanceof SyntaxError && (err as any).status === 400 && "body" in err) {
    status = 400;
    message = "Invalid JSON body";
    code = "INVALID_JSON";
  }

  if (status >= 500) {
    logger.error({ err, url: req.originalUrl, method: req.method, reqId: req.requestId }, "Unhandled error");
  }

  res.status(status).json({
    success: false,
    error: { message, code, ...(details ? { details } : {}), requestId: req.requestId }
  });
}
