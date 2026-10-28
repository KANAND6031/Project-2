// file_c.js - User authentication utilities

function validateUserPayload(user) {
  if (!user || typeof user !== 'object') {
    return { valid: false, error: 'User payload must be a non-null object' };
  }
  if (!user.email || !user.email.includes('@')) {
    return { valid: false, error: 'User must provide a valid email address' };
  }
  return { valid: true };
}

module.exports = { validateUserPayload };

