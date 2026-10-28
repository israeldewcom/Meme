import { Response } from "express";

export class ApiResponse {
  static ok<T>(res: Response, data: T, meta?: Record<string, unknown>) {
    return res.status(200).json({ success: true, data, ...(meta ? { meta } : {}) });
  }
  static created<T>(res: Response, data: T) {
    return res.status(201).json({ success: true, data });
  }
  static noContent(res: Response) {
    return res.status(204).send();
  }
  static paginated<T>(res: Response, items: T[], page: number, limit: number, total: number) {
    return res.status(200).json({
      success: true,
      data: items,
      meta: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) }
    });
  }
}
