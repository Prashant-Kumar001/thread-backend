export const createResponse = (success, data = null, error = null, meta = {}) => ({
  success,
  data,
  error: error ? { message: error } : null,
  meta: { ...meta, timestamp: new Date().toISOString() },
});