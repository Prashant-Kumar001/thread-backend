import AppError from '../utils/appError.js';

export default (err, _req, _res, next) => {


  if (err instanceof AppError) return next(err);


  if (err?.errors && Array.isArray(err.errors)) {
    return next(
      new AppError('Validation failed', 422, err.errors.map(e => e.msg)),
    );
  }

  if (err?.name === 'TypeError' && err.message.includes('Cannot read properties of undefined')) {
    return next(new AppError('Unexpected error: Undefined property access', 500, {
      details: err.message,
      code: 'UNEXPECTED_ERROR',
    }));
  }


  if (err.name === 'ValidationError') {

    const details = Object.values(err.errors).map(e => e.message)
    return next(new AppError('Validation failed', 400, {
      details,
      code: 'VALIDATION_FAILED',
    }));
  }

  if (err.name === 'CastError') {
    return next(
      new AppError(`Invalid ${err.path}: ${err.value}`, 400),
    );
  }


  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    return next(new AppError(`${field} already exists`, 409));
  }

  if (err.code === 'LIMIT_FILE_SIZE') {
    return next(new AppError('File too large', 413));
  }

  if (err.name === 'JsonWebTokenError') return next(new AppError('Invalid token', 401));
  if (err.name === 'TokenExpiredError') return next(new AppError('Token expired', 401));
  if (err.name === 'MongooseError') return next(new AppError('Database error', 500));


  if (err.type === 'entity.parse.failed') return next(new AppError('Malformed JSON', 400));



  next(new AppError(err.message || 'Internal server error', err.statusCode || 500));
};
