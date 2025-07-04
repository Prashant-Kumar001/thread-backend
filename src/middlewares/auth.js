import jwt from 'jsonwebtoken';
import { JWT_ACCESS_SECRET } from '../config/index.js';
import AppError from '../utils/appError.js';

export const protect = (req, _res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(
      new AppError('Authorization header missing or malformed', 401, {
        details: 'Expected format: "Bearer <token>"',
        code: 'AUTH_HEADER_MISSING',
      })
    );
  }

  const token = authHeader.split(' ')[1];


  jwt.verify(token, JWT_ACCESS_SECRET, (err, decoded) => {
    if (err) {
      return next(
        new AppError('Invalid or expired token', 401, {
          details: err.message,
          code: 'AUTH_TOKEN_INVALID',
        })
      );
    }
    req.user = decoded; 

    next();
  });
};
