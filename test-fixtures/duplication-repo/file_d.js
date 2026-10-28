// file_d.js - Profile service with copied validation logic

function checkProfileInput(user) {
  if (!user || typeof user !== 'object') {
    return { valid: false, error: 'User payload must be a non-null object' };
  }
  if (!user.email || !user.email.includes('@')) {
    return { valid: false, error: 'User must provide a valid email address' };
  }
  return { valid: true };
}

function updateBio(bio) {
  return bio.trim();
}

module.exports = { checkProfileInput, updateBio };

