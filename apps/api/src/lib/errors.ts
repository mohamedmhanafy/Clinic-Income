/** An error that is safe to show to the client, carrying an HTTP status and a stable code. */
export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static notFound(message: string, details?: unknown) {
    return new AppError(404, 'NOT_FOUND', message, details);
  }

  static badRequest(message: string, details?: unknown) {
    return new AppError(400, 'BAD_REQUEST', message, details);
  }

  static conflict(message: string, details?: unknown) {
    return new AppError(409, 'CONFLICT', message, details);
  }

  static unprocessable(message: string, details?: unknown) {
    return new AppError(422, 'UNPROCESSABLE', message, details);
  }
}
