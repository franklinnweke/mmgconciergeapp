import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ auth: vi.fn(), collect: vi.fn() }));
vi.mock("../../../../features/web/server/newsletter", () => ({
  authorizeNewsletterGateway: mocks.auth,
  collectSubscriber: mocks.collect,
}));
import { POST } from "./route";
import { WebError } from "../../../../features/web/model";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockReturnValue("secret");
});
it("requires gateway authentication before parsing or writing signups", async () => {
  mocks.auth.mockImplementation(() => {
    throw new WebError("Unauthorized", 401);
  });
  expect(
    (
      await POST(
        new Request("https://admin.test/api/web/newsletter", {
          method: "POST",
          body: "{broken",
        }),
      )
    ).status,
  ).toBe(401);
  expect(mocks.collect).not.toHaveBeenCalled();
});
it("bounds the body, rejects invalid JSON, and never reports database failure as success", async () => {
  const req = (body: string) =>
    new Request("https://admin.test/api/web/newsletter", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
  expect((await POST(req("x".repeat(2500)))).status).toBe(413);
  expect((await POST(req("{broken"))).status).toBe(400);
  mocks.collect.mockRejectedValue(new Error("db"));
  expect((await POST(req("{}"))).status).toBe(503);
});
