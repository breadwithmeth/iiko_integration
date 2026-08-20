import { describe, expect, it } from "vitest";
import { normalizePhone } from "../lib/phone.js";

describe("normalizePhone", () => {
  it("normalizes Kazakhstan/Russia formatted phone", () => {
    expect(normalizePhone("+7 777 123 45 67")).toBe("+77771234567");
  });

  it("converts local 8 prefix to +7", () => {
    expect(normalizePhone("8 (777) 123-45-67")).toBe("+77771234567");
  });
});
