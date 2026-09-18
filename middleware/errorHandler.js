const { AppError } = require('../lib/errors');

function errorHandler(err, req, res, next) {
  const statusCode = err instanceof AppError ? err.statusCode : 500;
  res.status(statusCode).json({ error: err.message || 'Internal Server Error' });
}

module.exports = errorHandler;
