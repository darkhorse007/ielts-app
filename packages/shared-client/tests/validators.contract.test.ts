import { describe, expect, test } from "vitest";
import { validateBandScore, validateEmail, validatePassword, validatePhone } from "../src/validators";

describe("shared client validator contracts", () => {
  test("accepts and rejects email addresses consistently", () => {
    expect(validateEmail("learner@example.com")).toBe(true);
    expect(validateEmail(" learner@example.com ")).toBe(true);
    expect(validateEmail("learner.example.com")).toBe(false);
  });

  test("accepts and rejects phone numbers consistently", () => {
    expect(validatePhone("+8613800138000")).toBe(true);
    expect(validatePhone("13800138000")).toBe(true);
    expect(validatePhone("12-34")).toBe(false);
  });

  test("enforces minimum password length", () => {
    expect(validatePassword("StrongPass123")).toBe(true);
    expect(validatePassword("short")).toBe(false);
  });

  test("enforces IELTS band score stepping", () => {
    expect(validateBandScore(6.5)).toBe(true);
    expect(validateBandScore(9)).toBe(true);
    expect(validateBandScore(6.3)).toBe(false);
    expect(validateBandScore(9.5)).toBe(false);
  });
});
