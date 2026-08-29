// Catches any error passed to next(err), or thrown inside an async route handler
// wrapped by a try/catch that calls next(err). Formats it into the standard
// error shape defined in the API contract.
function errorHandler(err, req, res, next) {
  console.error(err);

  const status = err.status || 500;
  const code = err.code || 'internal_error';
  const message = err.message || 'Something went wrong.';

  res.status(status).json({ error: true, code, message });
}

module.exports = errorHandler;
