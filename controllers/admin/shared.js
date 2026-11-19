const { generateOneTimeToken } = require('../../utils/security');
const { frontendUrl, inviteTokenTtlHours } = require('../../config/env');


// Create a one-time password-setup link for a user. Previous unused links
// for that user are invalidated. Returns the plaintext link ONCE.
const createPasswordSetupLink = async (client, userId, purpose, createdBy) => {
  await client.query(
    'UPDATE password_setup_tokens SET used_at = now() WHERE user_id = $1 AND used_at IS NULL',
    [userId]
  );
  const { token, tokenHash } = generateOneTimeToken();
  const { rows } = await client.query(
    `INSERT INTO password_setup_tokens (user_id, token_hash, purpose, expires_at, created_by)
     VALUES ($1, $2, $3, now() + make_interval(hours => $4), $5)
     RETURNING expires_at`,
    [userId, tokenHash, purpose, inviteTokenTtlHours, createdBy]
  );
  return {
    url: `${frontendUrl}/set-password?token=${encodeURIComponent(token)}`,
    expires_at: rows[0].expires_at,
    purpose,
  };
};


const studentStatusLabel = (row) => (row.is_active ? 'active' : 'inactive');

module.exports = { createPasswordSetupLink, studentStatusLabel };
