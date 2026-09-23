// Wraps an async controller so a rejected promise reaches Express's error
// handler instead of crashing the process or hanging the request.
function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = asyncHandler;
