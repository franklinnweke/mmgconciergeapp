import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  staff: vi.fn(),
  list: vi.fn(),
  remove: vi.fn(),
}));
vi.mock("../../../../features/web/server/newsletter", () => ({
  newsletterStaffSession: mocks.staff,
  listSubscribers: mocks.list,
  removeSubscriber: mocks.remove,
}));
import { GET, POST } from "./route";
import { WebError } from "../../../../features/web/model";
const request = (body: unknown, origin = "https://admin.test") =>
  new Request("https://admin.test/api/web/subscribers", {
    method: "POST",
    headers: { "content-type": "application/json", host: "admin.test", origin },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.staff.mockResolvedValue({ uid: "super" });
  mocks.list.mockResolvedValue({ items: [], nextCursor: null });
});
it("denies anonymous listing and exports before reading private data", async () => {
  mocks.staff.mockRejectedValue(new WebError("Sign in", 401));
  expect(
    (await GET(new Request("https://admin.test/api/web/subscribers"))).status,
  ).toBe(401);
  expect((await POST(request({ action: "export" }))).status).toBe(401);
  expect(mocks.list).not.toHaveBeenCalled();
});
it("blocks cross-origin export and deletion", async () => {
  for (const action of ["remove", "export"])
    expect((await POST(request({ action }, "https://evil.test"))).status).toBe(
      403,
    );
  expect(mocks.remove).not.toHaveBeenCalled();
  expect(mocks.list).not.toHaveBeenCalled();
});
it("exports every cursor batch without caching subscriber data", async () => {
  const item = {
    email: "person@example.com",
    createdAt: "2026-11-01T12:00:00Z",
    source: "website-footer",
    consentVersion: "v1",
    consentText: "Consent",
  };
  mocks.list
    .mockResolvedValueOnce({ items: [item], nextCursor: "next" })
    .mockResolvedValueOnce({
      items: [{ ...item, email: "next@example.com" }],
      nextCursor: null,
    });
  const result = await POST(request({ action: "export" }));
  expect(result.status).toBe(200);
  expect(result.headers.get("cache-control")).toContain("no-store");
  expect(result.headers.get("content-disposition")).toContain("attachment");
  const csv = await result.text();
  expect(csv).toContain("person@example.com");
  expect(csv).toContain("next@example.com");
  expect(mocks.list).toHaveBeenNthCalledWith(2, "next", "", 500);
});
it("does not return a partial export on a later database failure", async () => {
  mocks.list
    .mockResolvedValueOnce({ items: [], nextCursor: "next" })
    .mockRejectedValueOnce(new Error("db"));
  expect((await POST(request({ action: "export" }))).status).toBe(503);
});
it("removes only using the signed-in staff identity", async () => {
  expect((await POST(request({ action: "remove", id: "id" }))).status).toBe(
    200,
  );
  expect(mocks.remove).toHaveBeenCalledWith("id", "super");
});
