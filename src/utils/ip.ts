import { Request } from "express";
export const clientIp = (req: Request): string => req.ip || "unknown";
