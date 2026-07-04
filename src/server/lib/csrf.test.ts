// @vitest-environment node
import { describe, expect, it } from "vitest";
import { generateCsrfSecret, deriveCsrfToken, verifyCsrfToken } from "./csrf";

const KEY = "test-hmac-secret";

describe("generateCsrfSecret", () => {
  it("正常系: 呼び出すたびに異なる文字列を返す", () => {
    // Act
    const a = generateCsrfSecret();
    const b = generateCsrfSecret();

    // Assert
    expect(a).not.toBe(b);
    expect(typeof a).toBe("string");
    expect(a.length).toBeGreaterThan(0);
  });
});

describe("deriveCsrfToken", () => {
  it("正常系: 同じ secret・key なら同じトークンを返す（決定的）", async () => {
    // Act
    const tokenA = await deriveCsrfToken("secret-1", KEY);
    const tokenB = await deriveCsrfToken("secret-1", KEY);

    // Assert
    expect(tokenA).toBe(tokenB);
  });

  it("正常系: hex 文字列（64 文字, SHA-256）を返す", async () => {
    // Act
    const token = await deriveCsrfToken("secret-1", KEY);

    // Assert
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it("正常系: secret が異なれば異なるトークンを返す", async () => {
    // Act
    const tokenA = await deriveCsrfToken("secret-1", KEY);
    const tokenB = await deriveCsrfToken("secret-2", KEY);

    // Assert
    expect(tokenA).not.toBe(tokenB);
  });

  it("正常系: key（HMAC 鍵）が異なれば異なるトークンを返す", async () => {
    // Act
    const tokenA = await deriveCsrfToken("secret-1", "key-a");
    const tokenB = await deriveCsrfToken("secret-1", "key-b");

    // Assert
    expect(tokenA).not.toBe(tokenB);
  });
});

describe("verifyCsrfToken", () => {
  it("正常系: 正しい secret から再計算したトークンと一致すれば true", async () => {
    // 準備
    const secret = "secret-1";
    const token = await deriveCsrfToken(secret, KEY);

    // Act
    const valid = await verifyCsrfToken(secret, token, KEY);

    // Assert
    expect(valid).toBe(true);
  });

  it("異常系: トークンが改ざんされていれば false", async () => {
    // 準備
    const secret = "secret-1";
    const token = await deriveCsrfToken(secret, KEY);

    // Act
    const valid = await verifyCsrfToken(secret, `${token}tampered`, KEY);

    // Assert
    expect(valid).toBe(false);
  });

  it("異常系: secret が異なれば false", async () => {
    // 準備
    const token = await deriveCsrfToken("secret-1", KEY);

    // Act
    const valid = await verifyCsrfToken("secret-2", token, KEY);

    // Assert
    expect(valid).toBe(false);
  });

  it("異常系: token が空文字なら false", async () => {
    // 準備
    const secret = "secret-1";

    // Act
    const valid = await verifyCsrfToken(secret, "", KEY);

    // Assert
    expect(valid).toBe(false);
  });
});
