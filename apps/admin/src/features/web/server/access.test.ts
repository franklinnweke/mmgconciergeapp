import { beforeEach, describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
const auth = vi.hoisted(() => ({
  verify: vi.fn(),
  fixture: vi.fn(),
  cookies: vi.fn(),
}));
vi.mock("next/headers", () => ({ cookies: auth.cookies }));
vi.mock("../../auth/server/session", async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  return {
    ...original,
    verifyStaffSessionCookie: auth.verify,
    requireLiveStaffSession: auth.fixture,
  };
});
import { isWebFixture, webApiSession } from "./access";
beforeEach(() => {
  vi.unstubAllEnvs();
  auth.cookies.mockResolvedValue({ get: () => ({ value: "session-cookie" }) });
  auth.verify.mockReset();
  auth.fixture.mockReset();
});
describe("website staff permissions", () => {
  it("requires a live staff session", async () => {
    auth.verify.mockResolvedValue(null);
    await expect(webApiSession()).rejects.toMatchObject({ status: 401 });
  });
  it.each(["support", "verification_admin", "finance_admin", "privacy_admin"])(
    "denies %s access to website management",
    async (role) => {
      auth.verify.mockResolvedValue({ uid: "staff", roles: [role] });
      await expect(webApiSession()).rejects.toMatchObject({ status: 403 });
    },
  );
  it.each(["vehicle_admin", "super_admin"])(
    "allows %s to manage website vehicles",
    async (role) => {
      auth.verify.mockResolvedValue({ uid: "staff", roles: [role] });
      await expect(webApiSession()).resolves.toMatchObject({ uid: "staff" });
    },
  );
  it("never enables fixture access in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("MMG_ADMIN_FIXTURES", "1");
    expect(isWebFixture()).toBe(false);
  });
});
