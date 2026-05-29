// Typed errors thrown at the boundary; converted to HTTP responses centrally.

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const notFound = (what: string) => new ApiError(404, `${what} not found`);
export const badRequest = (msg: string) => new ApiError(400, msg);
export const unauthorized = (msg = 'Unauthorized') => new ApiError(401, msg);
