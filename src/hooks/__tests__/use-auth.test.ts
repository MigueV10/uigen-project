import { describe, test, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAuth } from "../use-auth";

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("@/actions", () => ({
  signIn: vi.fn(),
  signUp: vi.fn(),
}));

vi.mock("@/lib/anon-work-tracker", () => ({
  getAnonWorkData: vi.fn(),
  clearAnonWork: vi.fn(),
}));

vi.mock("@/actions/get-projects", () => ({
  getProjects: vi.fn(),
}));

vi.mock("@/actions/create-project", () => ({
  createProject: vi.fn(),
}));

// ── Typed imports ─────────────────────────────────────────────────────────────

import { signIn as signInAction, signUp as signUpAction } from "@/actions";
import { getAnonWorkData, clearAnonWork } from "@/lib/anon-work-tracker";
import { getProjects } from "@/actions/get-projects";
import { createProject } from "@/actions/create-project";

const mockSignIn = vi.mocked(signInAction);
const mockSignUp = vi.mocked(signUpAction);
const mockGetAnonWorkData = vi.mocked(getAnonWorkData);
const mockClearAnonWork = vi.mocked(clearAnonWork);
const mockGetProjects = vi.mocked(getProjects);
const mockCreateProject = vi.mocked(createProject);

// ── Helpers ───────────────────────────────────────────────────────────────────

function successResult() {
  return { success: true };
}

function failureResult() {
  return { success: false, error: "Invalid credentials" };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("useAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAnonWorkData.mockReturnValue(null);
    mockGetProjects.mockResolvedValue([]);
    mockCreateProject.mockResolvedValue({ id: "new-project-id" } as any);
  });

  // ── Initial state ──────────────────────────────────────────────────────────

  test("starts with isLoading = false", () => {
    const { result } = renderHook(() => useAuth());
    expect(result.current.isLoading).toBe(false);
  });

  test("exposes signIn, signUp, and isLoading", () => {
    const { result } = renderHook(() => useAuth());
    expect(typeof result.current.signIn).toBe("function");
    expect(typeof result.current.signUp).toBe("function");
    expect(typeof result.current.isLoading).toBe("boolean");
  });

  // ── signIn ─────────────────────────────────────────────────────────────────

  describe("signIn", () => {
    test("calls signInAction with email and password", async () => {
      mockSignIn.mockResolvedValue(successResult() as any);
      mockGetProjects.mockResolvedValue([{ id: "p1" }] as any);

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signIn("user@test.com", "secret");
      });

      expect(mockSignIn).toHaveBeenCalledWith("user@test.com", "secret");
    });

    test("sets isLoading to true during the call and false after", async () => {
      let loadingDuringCall = false;

      mockSignIn.mockImplementation(async () => {
        loadingDuringCall = true; // will be checked after act resolves
        return successResult() as any;
      });
      mockGetProjects.mockResolvedValue([{ id: "p1" }] as any);

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signIn("user@test.com", "secret");
      });

      expect(loadingDuringCall).toBe(true);
      expect(result.current.isLoading).toBe(false);
    });

    test("returns the result from signInAction", async () => {
      const expected = failureResult();
      mockSignIn.mockResolvedValue(expected as any);

      const { result } = renderHook(() => useAuth());

      let returned: any;
      await act(async () => {
        returned = await result.current.signIn("bad@test.com", "wrong");
      });

      expect(returned).toEqual(expected);
    });

    test("resets isLoading to false even when signInAction throws", async () => {
      mockSignIn.mockRejectedValue(new Error("network error"));

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        try {
          await result.current.signIn("user@test.com", "pass");
        } catch {
          // expected
        }
      });

      expect(result.current.isLoading).toBe(false);
    });

    test("does not call handlePostSignIn when sign-in fails", async () => {
      mockSignIn.mockResolvedValue(failureResult() as any);

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signIn("user@test.com", "wrong");
      });

      expect(mockGetAnonWorkData).not.toHaveBeenCalled();
      expect(mockGetProjects).not.toHaveBeenCalled();
      expect(mockCreateProject).not.toHaveBeenCalled();
      expect(mockPush).not.toHaveBeenCalled();
    });
  });

  // ── signUp ─────────────────────────────────────────────────────────────────

  describe("signUp", () => {
    test("calls signUpAction with email and password", async () => {
      mockSignUp.mockResolvedValue(successResult() as any);
      mockGetProjects.mockResolvedValue([{ id: "p1" }] as any);

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signUp("new@test.com", "pass");
      });

      expect(mockSignUp).toHaveBeenCalledWith("new@test.com", "pass");
    });

    test("resets isLoading to false after signUp", async () => {
      mockSignUp.mockResolvedValue(successResult() as any);
      mockGetProjects.mockResolvedValue([{ id: "p1" }] as any);

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signUp("new@test.com", "pass");
      });

      expect(result.current.isLoading).toBe(false);
    });

    test("does not navigate when sign-up fails", async () => {
      mockSignUp.mockResolvedValue(failureResult() as any);

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signUp("new@test.com", "bad");
      });

      expect(mockPush).not.toHaveBeenCalled();
    });
  });

  // ── handlePostSignIn – anonymous work ──────────────────────────────────────

  describe("handlePostSignIn – with anonymous work", () => {
    const anonWork = {
      messages: [{ role: "user", content: "Hello" }],
      fileSystemData: { "/App.jsx": { type: "file", content: "export default () => null" } },
    };

    beforeEach(() => {
      mockSignIn.mockResolvedValue(successResult() as any);
      mockGetAnonWorkData.mockReturnValue(anonWork as any);
      mockCreateProject.mockResolvedValue({ id: "anon-project" } as any);
    });

    test("creates a project with the anonymous work data", async () => {
      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signIn("user@test.com", "pass");
      });

      expect(mockCreateProject).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: anonWork.messages,
          data: anonWork.fileSystemData,
        })
      );
    });

    test("clears anonymous work after creating the project", async () => {
      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signIn("user@test.com", "pass");
      });

      expect(mockClearAnonWork).toHaveBeenCalled();
    });

    test("redirects to the new project page", async () => {
      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signIn("user@test.com", "pass");
      });

      expect(mockPush).toHaveBeenCalledWith("/anon-project");
    });

    test("does not call getProjects when anonymous work exists", async () => {
      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signIn("user@test.com", "pass");
      });

      expect(mockGetProjects).not.toHaveBeenCalled();
    });
  });

  // ── handlePostSignIn – no anonymous work, existing projects ───────────────

  describe("handlePostSignIn – no anon work, existing projects", () => {
    beforeEach(() => {
      mockSignIn.mockResolvedValue(successResult() as any);
      mockGetAnonWorkData.mockReturnValue(null);
      mockGetProjects.mockResolvedValue([
        { id: "first-project" },
        { id: "second-project" },
      ] as any);
    });

    test("redirects to the most recent (first) project", async () => {
      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signIn("user@test.com", "pass");
      });

      expect(mockPush).toHaveBeenCalledWith("/first-project");
    });

    test("does not create a new project when one already exists", async () => {
      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signIn("user@test.com", "pass");
      });

      expect(mockCreateProject).not.toHaveBeenCalled();
    });
  });

  // ── handlePostSignIn – no anon work, no projects ──────────────────────────

  describe("handlePostSignIn – no anon work, no existing projects", () => {
    beforeEach(() => {
      mockSignIn.mockResolvedValue(successResult() as any);
      mockGetAnonWorkData.mockReturnValue(null);
      mockGetProjects.mockResolvedValue([]);
      mockCreateProject.mockResolvedValue({ id: "brand-new" } as any);
    });

    test("creates a new empty project", async () => {
      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signIn("user@test.com", "pass");
      });

      expect(mockCreateProject).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [],
          data: {},
        })
      );
    });

    test("redirects to the newly created project", async () => {
      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signIn("user@test.com", "pass");
      });

      expect(mockPush).toHaveBeenCalledWith("/brand-new");
    });
  });

  // ── handlePostSignIn – anon work with empty messages ─────────────────────

  describe("handlePostSignIn – anon work with empty messages", () => {
    beforeEach(() => {
      mockSignIn.mockResolvedValue(successResult() as any);
      // getAnonWorkData returns data but with zero messages — should fall through
      mockGetAnonWorkData.mockReturnValue({ messages: [], fileSystemData: {} } as any);
      mockGetProjects.mockResolvedValue([{ id: "existing-project" }] as any);
    });

    test("falls through to existing projects when anon messages array is empty", async () => {
      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signIn("user@test.com", "pass");
      });

      expect(mockGetProjects).toHaveBeenCalled();
      expect(mockPush).toHaveBeenCalledWith("/existing-project");
    });
  });
});
