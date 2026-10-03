export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export const notFound = (what: string) => new AppError(404, 'NOT_FOUND', `${what} not found`);
export const badRequest = (message: string) => new AppError(400, 'BAD_REQUEST', message);
