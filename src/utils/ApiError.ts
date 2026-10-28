export class ApiError extends Error {
  statusCode: number;
  isOperational = true;
  details?: unknown;
  code?: string;

  constructor(statusCode: number, message: string, details?: unknown, code?: string) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    this.code = code;
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(msg = "Bad request", d?: unknown) { return new ApiError(400, msg, d); }
  static unauthorized(msg = "Unauthorized") { return new ApiError(401, msg); }
  static forbidden(msg = "Forbidden") { return new ApiError(403, msg); }
  static notFound(msg = "Not found") { return new ApiError(404, msg); }
  static conflict(msg = "Conflict") { return new ApiError(409, msg); }
  static unprocessable(msg = "Unprocessable entity", d?: unknown) { return new ApiError(422, msg, d); }
  static tooMany(msg = "Too many requests") { return new ApiError(429, msg); }
  static internal(msg = "Internal server error") { return new ApiError(500, msg); }
  static serviceUnavailable(msg = "Service unavailable") { return new ApiError(503, msg); }
}
