const argon2 = require("argon2");

function isArgon2Hash(value) {
  if (!value) {
    return false;
  }
  return String(value).startsWith("$argon2id$");
}

async function hashPassword(plain) {
  return argon2.hash(plain, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1
  });
}

async function verifyPassword(hash, plain) {
  return argon2.verify(hash, plain, {
    type: argon2.argon2id
  });
}

module.exports = {
  isArgon2Hash,
  hashPassword,
  verifyPassword
};
