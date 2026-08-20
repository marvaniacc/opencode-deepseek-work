export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export function badRequest(message: string, details?: unknown): HttpError {
  return new HttpError(400, message, details);
}

export function unauthorized(message = "unauthorized"): HttpError {
  return new HttpError(401, message);
}

export function forbidden(message = "forbidden"): HttpError {
  return new HttpError(403, message);
}

export function notFound(message = "not_found"): HttpError {
  return new HttpError(404, message);
}

export function conflict(message: string): HttpError {
  return new HttpError(409, message);
}

export function unprocessable(message: string, details?: unknown): HttpError {
  return new HttpError(422, message, details);
}