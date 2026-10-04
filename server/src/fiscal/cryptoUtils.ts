import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

const AES_256_GCM = "aes-256-gcm";
const KEY_BYTES = 32;
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;

/** Base64 is used only as a transport format for database columns. */
export interface EncryptedPayload {
  ciphertext: string;
  iv: string;
  tag: string;
}

export interface EncryptionOptions {
  /**
   * Cryptographically binds this ciphertext to its tenant and intended use.
   * Use a different value for the certificate and its password.
   */
  aad?: Buffer;
  key?: Buffer;
}

function decodeBase64Strict(value: string, name: string): Buffer {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value) || value.length % 4 !== 0) {
    throw new Error(`${name} must be a valid base64 value`);
  }

  return Buffer.from(value, "base64");
}

/**
 * Reads a 256-bit key from the environment. It accepts exactly 64 hexadecimal
 * characters or a base64 encoding of exactly 32 bytes. Do not expose this
 * value to the browser, logs, storage, or Supabase Edge Functions.
 */
export function encryptionKeyFromEnv(environment = process.env): Buffer {
  const raw = environment.ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("ENCRYPTION_KEY is required");
  }

  const key = /^[0-9a-fA-F]{64}$/.test(raw)
    ? Buffer.from(raw, "hex")
    : decodeBase64Strict(raw, "ENCRYPTION_KEY");

  if (key.length !== KEY_BYTES) {
    throw new Error("ENCRYPTION_KEY must decode to exactly 32 bytes");
  }

  return key;
}

function requireKey(options: EncryptionOptions): Buffer {
  const key = options.key ?? encryptionKeyFromEnv();
  if (key.length !== KEY_BYTES) {
    throw new Error("AES-256-GCM requires a 32-byte key");
  }
  return key;
}

export function encryptBuffer(
  plaintext: Buffer,
  options: EncryptionOptions = {},
): EncryptedPayload {
  const key = requireKey(options);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(AES_256_GCM, key, iv, { authTagLength: AUTH_TAG_BYTES });

  if (options.aad) cipher.setAAD(options.aad);

  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
  };
}

export function decryptBuffer(
  payload: EncryptedPayload,
  options: EncryptionOptions = {},
): Buffer {
  const key = requireKey(options);
  const iv = decodeBase64Strict(payload.iv, "iv");
  const tag = decodeBase64Strict(payload.tag, "tag");
  const ciphertext = decodeBase64Strict(payload.ciphertext, "ciphertext");

  if (iv.length !== IV_BYTES || tag.length !== AUTH_TAG_BYTES) {
    throw new Error("Invalid AES-256-GCM IV or authentication tag");
  }

  const decipher = createDecipheriv(AES_256_GCM, key, iv, { authTagLength: AUTH_TAG_BYTES });
  if (options.aad) decipher.setAAD(options.aad);
  decipher.setAuthTag(tag);

  // final() authenticates the tag and throws if any protected byte was changed.
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

export function encryptUtf8(
  plaintext: string,
  options: EncryptionOptions = {},
): EncryptedPayload {
  return encryptBuffer(Buffer.from(plaintext, "utf8"), options);
}

export function decryptUtf8(
  payload: EncryptedPayload,
  options: EncryptionOptions = {},
): string {
  const plaintext = decryptBuffer(payload, options);
  try {
    return plaintext.toString("utf8");
  } finally {
    plaintext.fill(0);
  }
}

/** Constant-time helper for the rare case a caller needs to compare key bytes. */
export function safeBufferEquals(left: Buffer, right: Buffer): boolean {
  return left.length === right.length && timingSafeEqual(left, right);
}
