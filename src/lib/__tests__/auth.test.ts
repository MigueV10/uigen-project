// @vitest-environment node
import { describe, test, expect, vi, beforeEach } from "vitest";
import { SignJWT } from "jose";

vi.mock("server-only", () => ({}));

const mockGet = vi.fn();
vi.mock("next/headers", () => ({
  cookies: vi.fn(() => Promise.resolve({ get: mockGet, set: vi.fn(), delete: vi.fn() })),
}));

import { getSession } from "@/lib/auth";

const SECRET = new TextEncoder().encode("development-secret-key");

async function signToken(payload: object, expiresIn: string) {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(expiresIn)
    .setIssuedAt()
    .sign(SECRET);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGet.mockReturnValue(undefined);
});

describe("getSession", () => {
  test("returns null when no cookie is present", async () => {
    mockGet.mockReturnValue(undefined);
    expect(await getSession()).toBeNull();
  });

  test("returns null when cookie value is empty string", async () => {
    mockGet.mockReturnValue({ value: "" });
    expect(await getSession()).toBeNull();
  });

  test("returns null for a malformed token", async () => {
    mockGet.mockReturnValue({ value: "not.a.jwt" });
    expect(await getSession()).toBeNull();
  });

  test("returns null for a token signed with a different secret", async () => {
    const wrongSecret = new TextEncoder().encode("wrong-secret");
    const token = await new SignJWT({ userId: "x", email: "x@x.com" })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("7d")
      .setIssuedAt()
      .sign(wrongSecret);

    mockGet.mockReturnValue({ value: token });
    expect(await getSession()).toBeNull();
  });

  test("returns null for an expired token", async () => {
    const token = await signToken(
      { userId: "user-1", email: "expired@example.com" },
      "-1s" // already expired
    );

    mockGet.mockReturnValue({ value: token });
    expect(await getSession()).toBeNull();
  });

  test("returns payload with correct userId and email", async () => {
    const token = await signToken(
      { userId: "user-42", email: "alice@example.com" },
      "7d"
    );

    mockGet.mockReturnValue({ value: token });
    const session = await getSession();

    expect(session).not.toBeNull();
    expect(session!.userId).toBe("user-42");
    expect(session!.email).toBe("alice@example.com");
  });

  test("reads the auth-token cookie specifically", async () => {
    const token = await signToken({ userId: "u1", email: "u@u.com" }, "7d");
    mockGet.mockReturnValue({ value: token });

    await getSession();

    expect(mockGet).toHaveBeenCalledWith("auth-token");
  });
});
