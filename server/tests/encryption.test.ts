import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { encryptValue, decryptValue, isEncryptionAvailable } from "../lib/encryption";

describe("Encryption", () => {
  const originalKey = process.env.APP_ENCRYPTION_KEY;

  afterAll(() => {
    // Restore original
    if (originalKey) {
      process.env.APP_ENCRYPTION_KEY = originalKey;
    } else {
      delete process.env.APP_ENCRYPTION_KEY;
    }
  });

  describe("isEncryptionAvailable", () => {
    it("returns false when APP_ENCRYPTION_KEY not set", () => {
      delete process.env.APP_ENCRYPTION_KEY;
      expect(isEncryptionAvailable()).toBe(false);
    });

    it("returns false when APP_ENCRYPTION_KEY is too short", () => {
      process.env.APP_ENCRYPTION_KEY = "c2hvcnQ="; // "short" base64
      expect(isEncryptionAvailable()).toBe(false);
    });

    it("returns true when APP_ENCRYPTION_KEY is valid 32-byte base64", () => {
      // 32 bytes in base64: requires 44 characters
      process.env.APP_ENCRYPTION_KEY = "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";
      expect(isEncryptionAvailable()).toBe(true);
    });
  });

  describe("encryptValue and decryptValue", () => {
    beforeAll(() => {
      // Set a valid test key (32 bytes in base64)
      // This is "0123456789abcdef0123456789abcdef" encoded as base64
      process.env.APP_ENCRYPTION_KEY = "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";
    });

    it("encrypts and decrypts a simple string", () => {
      const original = "my-secret-api-key";
      const encrypted = encryptValue(original);
      
      expect(encrypted).not.toBe(original);
      
      const decrypted = decryptValue(encrypted);
      expect(decrypted).toBe(original);
    });

    it("produces different ciphertext for same input (due to IV)", () => {
      const original = "same-value";
      const encrypted1 = encryptValue(original);
      const encrypted2 = encryptValue(original);
      
      expect(encrypted1).not.toBe(encrypted2);
      
      expect(decryptValue(encrypted1)).toBe(original);
      expect(decryptValue(encrypted2)).toBe(original);
    });

    it("handles unicode characters", () => {
      const original = "Unicode: 日本語 🔐 émojis";
      const encrypted = encryptValue(original);
      const decrypted = decryptValue(encrypted);
      
      expect(decrypted).toBe(original);
    });

    it("handles long strings", () => {
      const original = "x".repeat(10000);
      const encrypted = encryptValue(original);
      const decrypted = decryptValue(encrypted);
      
      expect(decrypted).toBe(original);
    });

    it("throws on invalid encrypted format", () => {
      expect(() => decryptValue("invalid-format")).toThrow();
    });

    it("throws on tampered ciphertext (authentication failure)", () => {
      const original = "test-value";
      const encrypted = encryptValue(original);
      
      // Decode, tamper with ciphertext, re-encode
      const decoded = Buffer.from(encrypted, "base64").toString("utf8");
      const parsed = JSON.parse(decoded);
      parsed.ciphertext = "dGFtcGVyZWQ="; // "tampered" in base64
      const tampered = Buffer.from(JSON.stringify(parsed)).toString("base64");
      
      expect(() => decryptValue(tampered)).toThrow();
    });
  });

  describe("without encryption key", () => {
    beforeAll(() => {
      delete process.env.APP_ENCRYPTION_KEY;
    });

    it("encryptValue throws when key not configured", () => {
      expect(() => encryptValue("test")).toThrow("Encryption key not configured");
    });

    it("decryptValue throws when key not configured", () => {
      expect(() => decryptValue("dGVzdA==")).toThrow("Encryption key not configured");
    });
  });
});
