import { describe, it, expect, beforeAll } from '@jest/globals';
import { hashPassword, comparePassword, generateOTP, generatePassword } from '../utils/helpers.js';

describe('Authentication Utilities', () => {
  describe('Password Hashing', () => {
    it('should hash a password', async () => {
      const password = 'TestPassword123!';
      const hash = await hashPassword(password);

      expect(hash).toBeDefined();
      expect(hash).not.toBe(password);
      expect(hash.length).toBeGreaterThan(0);
    });

    it('should verify correct password', async () => {
      const password = 'TestPassword123!';
      const hash = await hashPassword(password);
      const isValid = await comparePassword(password, hash);

      expect(isValid).toBe(true);
    });

    it('should reject incorrect password', async () => {
      const password = 'TestPassword123!';
      const wrongPassword = 'WrongPassword456!';
      const hash = await hashPassword(password);
      const isValid = await comparePassword(wrongPassword, hash);

      expect(isValid).toBe(false);
    });
  });

  describe('OTP Generation', () => {
    it('should generate 6-digit OTP', () => {
      const otp = generateOTP();

      expect(otp).toBeDefined();
      expect(otp.length).toBe(6);
      expect(/^\d{6}$/.test(otp)).toBe(true);
    });

    it('should generate different OTPs', () => {
      const otp1 = generateOTP();
      const otp2 = generateOTP();

      expect(otp1).not.toBe(otp2);
    });

    it('should be hashable and verifiable', async () => {
      const otp = generateOTP();
      const hash = await hashPassword(otp);
      const isValid = await comparePassword(otp, hash);

      expect(isValid).toBe(true);
    });
  });

  describe('Password Generation', () => {
    it('should generate password of specified length', () => {
      const password = generatePassword(12);

      expect(password).toBeDefined();
      expect(password.length).toBe(12);
    });

    it('should generate password with default length', () => {
      const password = generatePassword();

      expect(password).toBeDefined();
      expect(password.length).toBe(8);
    });

    it('should contain at least one uppercase letter', () => {
      const password = generatePassword(8);

      expect(/[A-Z]/.test(password)).toBe(true);
    });

    it('should contain at least one lowercase letter', () => {
      const password = generatePassword(8);

      expect(/[a-z]/.test(password)).toBe(true);
    });

    it('should contain at least one number', () => {
      const password = generatePassword(8);

      expect(/[0-9]/.test(password)).toBe(true);
    });

    it('should contain at least one special character', () => {
      const password = generatePassword(8);

      expect(/[@#$!]/.test(password)).toBe(true);
    });
  });
});
