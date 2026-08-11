import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export function hashPassword(password: string) {
  if (password.length < 12) throw new Error("Passwords must contain at least 12 characters");
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `scrypt:${salt.toString("base64url")}:${hash.toString("base64url")}`;
}

export function verifyPassword(password: string, encoded: string) {
  const [algorithm, saltValue, hashValue] = encoded.split(":");
  if (algorithm !== "scrypt" || !saltValue || !hashValue) return false;
  const expected = Buffer.from(hashValue, "base64url");
  const actual = scryptSync(password, Buffer.from(saltValue, "base64url"), expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
