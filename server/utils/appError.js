// A thrown AppError carries an HTTP status so the error middleware can
// respond correctly without every controller needing its own try/catch logic.
class AppError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
  }
}

module.exports = AppError;
