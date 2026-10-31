import { beforeEach, describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  list: vi.fn(),
  mutate: vi.fn(),
  remove: vi.fn(),
  upload: vi.fn(),
  read: vi.fn(),
}));
vi.mock("../../../../features/web/server/access", () => ({
  webApiSession: mocks.session,
  isWebFixture: () => false,
}));
vi.mock("../../../../features/web/server/repository", () => ({
  listWebVehicles: mocks.list,
  mutateWebVehicle: mocks.mutate,
  deleteWebVehicle: mocks.remove,
  getWebVehicle: vi.fn(),
  importWebSeed: vi.fn(),
}));
vi.mock("../../../../features/web/server/media", () => ({
  uploadWebPhoto: mocks.upload,
  readWebPhoto: mocks.read,
}));
import { GET, POST } from "./route";
import { WebError } from "../../../../features/web/model";
const context = (...path: string[]) => ({ params: Promise.resolve({ path }) });
beforeEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  mocks.session.mockResolvedValue({ uid: "staff", roles: ["vehicle_admin"] });
  mocks.list.mockResolvedValue([]);
});
describe("website API boundary", () => {
  it("rejects unauthenticated mutations before any repository or upload call", async () => {
    mocks.session.mockRejectedValue(new WebError("Sign in", 401));
    const response = await POST(
      new Request("https://admin.test/api/web/media", { method: "POST" }),
      context("media"),
    );
    expect(response.status).toBe(401);
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.mutate).not.toHaveBeenCalled();
  });
  it("rejects cross-origin requests before mutations", async () => {
    const response = await POST(
      new Request("https://admin.test/api/web/media", {
        method: "POST",
        headers: { origin: "https://evil.test", host: "admin.test" },
      }),
      context("media"),
    );
    expect(response.status).toBe(403);
    expect(mocks.upload).not.toHaveBeenCalled();
  });
  it("requires explicit public catalogue configuration", async () => {
    const response = await GET(
      new Request("https://admin.test/api/web/catalogue"),
      context("catalogue"),
    );
    expect(response.status).toBe(503);
    expect(mocks.list).not.toHaveBeenCalled();
  });
  it("public reads request only published snapshots, never editor records", async () => {
    vi.stubEnv("MMG_WEB_MEDIA_BASE_URL", "https://admin.test");
    const response = await GET(
      new Request("https://admin.test/api/web/catalogue"),
      context("catalogue"),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ vehicles: [] });
    expect(mocks.list).toHaveBeenCalledWith(true);
    expect(mocks.session).not.toHaveBeenCalled();
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it("checks public photo access even when the staff session is missing", async () => {
    mocks.session.mockRejectedValue(new WebError("Sign in", 401));
    mocks.read.mockResolvedValue(null);
    const response = await GET(
      new Request("https://admin.test/api/web/media/private-photo"),
      context("media", "private-photo"),
    );
    expect(response.status).toBe(404);
    expect(mocks.read).toHaveBeenCalledWith("private-photo", false);
  });
});

it("deletes only through the staff-checked same-origin versioned endpoint", async () => {
  const response = await POST(
    new Request("https://admin.test/api/web/vehicles/prado/delete", {
      method: "POST",
      headers: {
        origin: "https://admin.test",
        host: "admin.test",
        "content-type": "application/json",
      },
      body: JSON.stringify({ expectedVersion: 4 }),
    }),
    context("vehicles", "prado", "delete"),
  );
  expect(response.status).toBe(200);
  expect(mocks.remove).toHaveBeenCalledWith("prado", 4, "staff");
});
