const jwt = require("jsonwebtoken");

class JwtService {
  constructor({ secret, ttlHours }) {
    this.secret = secret;
    this.ttlHours = ttlHours;
  }

  assertReady() {
    if (!this.secret || String(this.secret).trim() === "") {
      throw new Error("JWT_SECRET is required");
    }
  }

  sign(payload) {
    this.assertReady();
    return jwt.sign(payload, this.secret, {
      expiresIn: `${this.ttlHours}h`
    });
  }

  verify(token) {
    this.assertReady();
    return jwt.verify(token, this.secret);
  }
}

module.exports = {
  JwtService
};
