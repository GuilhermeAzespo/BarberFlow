export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code: string = 'ERROR',
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'HttpError';
  }

  static badRequest(message: string, details?: unknown) {
    return new HttpError(400, message, 'BAD_REQUEST', details);
  }

  static unauthorized(message = 'Não autenticado') {
    return new HttpError(401, message, 'UNAUTHORIZED');
  }

  static forbidden(message = 'Acesso negado', code = 'FORBIDDEN') {
    return new HttpError(403, message, code);
  }

  static notFound(message = 'Recurso não encontrado') {
    return new HttpError(404, message, 'NOT_FOUND');
  }

  static conflict(message: string, code = 'CONFLICT') {
    return new HttpError(409, message, code);
  }

  static paymentRequired(message: string, code = 'PLAN_LIMIT') {
    return new HttpError(402, message, code);
  }
}
