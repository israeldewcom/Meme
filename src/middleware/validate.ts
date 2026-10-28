import { Request, Response, NextFunction } from "express";
import { ZodTypeAny } from "zod";
import { ApiError } from "../utils/ApiError";

export function validateBody(schema: ZodTypeAny) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (e) {
      next(e);
    }
  };
}

export function validateQuery(schema: ZodTypeAny) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      req.validatedQuery = schema.parse(req.query);
      next();
    } catch (e) {
      next(e);
    }
  };
}

export function validateObjectId(...names: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    for (const n of names) {
      if (!/^[a-f0-9]{24}$/i.test(String(req.params[n] || ""))) return next(ApiError.badRequest(`Invalid ${n}`));
    }
    next();
  };
}
