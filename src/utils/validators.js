import Joi from 'joi';

export const paginationSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(50).default(10),
});

export const createThreadSchema = Joi.object({
  content: Joi.string().trim().min(1).max(500).required(),
  parent: Joi.string().hex().length(24).optional().allow(null),
  visibility: Joi.string().valid('public', 'private').optional().default('public'),
});

export const threadIdSchema = Joi.string().hex().length(24).required();
export const userIdSchema = Joi.string().hex().length(24).required();