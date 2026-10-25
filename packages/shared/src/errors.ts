/**
 * Central error model shared by every service. All HTTP error responses are
 * rendered from `AppError` so the contract is always:
 *
 *   { "error": { "code", "message", "details"?, "requestId"? } }
 */
export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }

  static badRequest(message = 'Bad request', details?: unknown): AppError {
    return new AppError(400, 'BAD_REQUEST', message, details);
  }

  static validation(details: unknown, message = 'Request validation failed'): AppError {
    return new AppError(400, 'VALIDATION_ERROR', message, details);
  }

  static unauthorized(message = 'Authentication required'): AppError {
    return new AppError(401, 'UNAUTHORIZED', message);
  }

  static notFound(resource = 'Resource'): AppError {
    return new AppError(404, 'NOT_FOUND', `${resource} not found`);
  }

  static forbidden(message = 'Forbidden', details?: unknown): AppError {
    return new AppError(403, 'FORBIDDEN', message, details);
  }

  static conflict(message = 'Conflict', details?: unknown): AppError {
    return new AppError(409, 'CONFLICT', message, details);
  }

  static unprocessable(message: string, details?: unknown): AppError {
    return new AppError(422, 'UNPROCESSABLE_ENTITY', message, details);
  }

  static unavailable(service: string, message?: string): AppError {
    return new AppError(
      503,
      'SERVICE_UNAVAILABLE',
      message ?? `Upstream service '${service}' is unavailable`,
    );
  }

  static internal(message = 'Internal server error', details?: unknown): AppError {
    return new AppError(500, 'INTERNAL_ERROR', message, details);
  }

  toJSON(): { code: string; message: string; details?: unknown } {
    return { code: this.code, message: this.message, ...(this.details !== undefined ? { details: this.details } : {}) };
  }
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
    requestId?: string;
  };
}
