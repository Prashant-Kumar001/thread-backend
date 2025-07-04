
export default (err, _req, res, _next) => {
  const response = {
    status: err.statusCode || 500,
    message: err.message,
    ...(err.details && { details: err.details }),
  };

  res.status(response.status).json(response);
};
