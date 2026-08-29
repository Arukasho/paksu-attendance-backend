const { verifyAccessToken } = require('../services/token.service');

// Reads "Authorization: Bearer <token>", verifies it, and attaches the decoded
// payload to req.user. Use this on every route except register/login/refresh/
// forgot-password/verify-otp/reset-password.
function authenticate(req, res, next) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({
      error: true,
      code: 'unauthorized',
      message: 'Missing or malformed Authorization header.',
    });
  }

  const token = header.slice('Bearer '.length);

  try {
    const payload = verifyAccessToken(token);
    req.user = payload; // e.g. { id, role }
    next();
  } catch (err) {
    return res.status(401).json({
      error: true,
      code: 'invalid_or_expired_token',
      message: 'Access token is invalid or expired.',
    });
  }
}

module.exports = authenticate;
