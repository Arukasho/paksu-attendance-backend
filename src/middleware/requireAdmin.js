// Must run AFTER authenticate() so req.user is already set.
// This is the server-side enforcement of admin-only routes — never rely on
// the client (admin web app) alone to hide the UI for non-admins.
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({
      error: true,
      code: 'forbidden',
      message: 'Admin access required.',
    });
  }
  next();
}

module.exports = requireAdmin;
