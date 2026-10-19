export interface ApiResponse<T = unknown> {
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export class ApiError extends Error {
  code: string;
  status: number;
  details?: unknown;

  constructor(message: string, status: number, code: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = path.startsWith('/') ? path : `/${path}`;
  
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(url, {
    ...options,
    headers,
    credentials: 'include', // Envia cookies httpOnly para a API
  });

  if (response.status === 204) {
    return {} as T;
  }

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const error = data?.error;
    throw new ApiError(
      error?.message || `Erro na requisição (${response.status})`,
      response.status,
      error?.code || 'UNKNOWN_ERROR',
      error?.details
    );
  }

  return data as T;
}

// Helpers específicos
export const api = {
  get: <T>(path: string) => apiFetch<T>(path, { method: 'GET' }),
  post: <T>(path: string, body?: unknown) =>
    apiFetch<T>(path, {
      method: 'POST',
      body: body instanceof FormData ? body : JSON.stringify(body),
    }),
  patch: <T>(path: string, body?: unknown) =>
    apiFetch<T>(path, {
      method: 'PATCH',
      body: body instanceof FormData ? body : JSON.stringify(body),
    }),
  put: <T>(path: string, body?: unknown) =>
    apiFetch<T>(path, {
      method: 'PUT',
      body: body instanceof FormData ? body : JSON.stringify(body),
    }),
  delete: <T>(path: string) => apiFetch<T>(path, { method: 'DELETE' }),
};
