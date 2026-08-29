// TODO: fill these in as you build the register/update endpoints.
// Keep them pure functions (no DB calls) so they're easy to test directly.

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidPhone(phone) {
  // Basic Indonesian phone check — adjust as needed.
  return /^0\d{9,13}$/.test(phone);
}

function isStrongEnoughPassword(password) {
  return typeof password === 'string' && password.length >= 8;
}

module.exports = { isValidEmail, isValidPhone, isStrongEnoughPassword };
