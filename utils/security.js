const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { jwt: jwtConfig, bcryptRounds } = require('../config/env');

const hashPassword = (password) => bcrypt.hash(password, bcryptRounds);

// A valid bcrypt hash of random bytes, used for accounts that must set their
// password via an invitation link. Nobody knows the plaintext, so the
// account cannot be logged into until the invite is completed.
const unusablePasswordHash = () => hashPassword(crypto.randomBytes(32).toString('hex'));

// Compared against when the email is unknown, so response time does not
// reveal which emails are registered.
let dummyHashPromise;
const getDummyHash = () => {
  if (!dummyHashPromise) dummyHashPromise = hashPassword(crypto.randomBytes(16).toString('hex'));
  return dummyHashPromise;
};

const verifyPassword = async (password, hash) => {
  if (!hash) {
    await bcrypt.compare(password, await getDummyHash());
    return false;
  }
  return bcrypt.compare(password, hash);
};

const signToken = (user) =>
  jwt.sign({ sub: String(user.user_id), role: user.role }, jwtConfig.secret, {
    algorithm: 'HS256',
    expiresIn: jwtConfig.expiresIn,
    issuer: jwtConfig.issuer,
  });

// Opaque one-time tokens (invitations / password resets). Only the SHA-256
// hash is stored, so a database leak does not expose usable tokens.
const generateOneTimeToken = () => {
  const token = crypto.randomBytes(32).toString('base64url');
  return { token, tokenHash: hashOneTimeToken(token) };
};

const hashOneTimeToken = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');

module.exports = {
  hashPassword,
  unusablePasswordHash,
  verifyPassword,
  signToken,
  generateOneTimeToken,
  hashOneTimeToken,
};
