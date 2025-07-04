export default class AppError extends Error {
  constructor(message, statusCode = 500, options = {}) {
    super(message);

    this.statusCode = statusCode;
    this.details = options.details || null;
    this.code = options.code || null;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}
