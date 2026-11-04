import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  db: {} as unknown,
  fixture: false,
}));
vi.mock("./access", () => ({
  webApiSession: mocks.session,
  isWebFixture: () => mocks.fixture,
}));
vi.mock("../../auth/server/firebase-admin", () => ({
  getAdminFirestore: () => mocks.db,
}));
import {
  authorizeNewsletterGateway,
  collectSubscriber,
  newsletterStaffSession,
  listSubscribers,
  removeSubscriber,
  SUBSCRIBERS,
} from "./newsletter";
import { normalizeEmail, subscriberCsv, CONSENT_TEXT } from "../newsletter";
const secret = "test-only-secret-over-32-characters";
const docs = new Map<string, unknown>();
const ref = (path: string) => ({
  path,
  doc: (id: string) => ref(`${path}/${id}`),
  get: async () => ({ data: () => docs.get(path) }),
});
beforeEach(() => {
  docs.clear();
  mocks.fixture = false;
  vi.unstubAllEnvs();
  mocks.session.mockResolvedValue({ uid: "staff", roles: ["super_admin"] });
  mocks.db = {
    collection: (name: string) => ref(name),
    runTransaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      const writes: (() => void)[] = [];
      let written = false;
      const result = await fn({
        get: async (r: { path: string }) => {
          if (written) throw new Error("Read after write");
          return { exists: docs.has(r.path), data: () => docs.get(r.path) };
        },
        create: (r: { path: string }, value: unknown) => {
          written = true;
          writes.push(() => {
            if (docs.has(r.path)) throw new Error("duplicate");
            docs.set(r.path, value);
          });
        },
        set: (r: { path: string }, value: unknown) => {
          written = true;
          writes.push(() => docs.set(r.path, value));
        },
        delete: (r: { path: string }) => {
          written = true;
          writes.push(() => docs.delete(r.path));
        },
      });
      writes.forEach((write) => write());
      return result;
    },
  };
});
describe("newsletter storage and privacy", () => {
  it("deduplicates case-insensitively without replacing original consent or timestamp", async () => {
    await collectSubscriber(
      { email: "Person@Example.com", consent: true, client: "local" },
      secret,
    );
    const entry = [...docs.entries()].find(([key]) =>
      key.startsWith(SUBSCRIBERS),
    )!;
    const original = entry[1];
    await collectSubscriber(
      { email: " person@example.com ", consent: true, client: "local" },
      secret,
    );
    expect(
      [...docs.keys()].filter((key) => key.startsWith(SUBSCRIBERS)),
    ).toHaveLength(1);
    expect(docs.get(entry[0])).toEqual(original);
    expect(original).toMatchObject({
      email: "person@example.com",
      consentText: CONSENT_TEXT,
      emailVerified: false,
    });
    expect(JSON.stringify([...docs.values()])).not.toContain("local");
  });
  it("fails before writes without consent, for malformed bodies and for honeypots", async () => {
    await expect(
      collectSubscriber({ email: "a@example.com", consent: false }, secret),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      collectSubscriber(null as never, secret),
    ).rejects.toMatchObject({ status: 400 });
    await collectSubscriber({ website: "bot" }, secret);
    expect(docs.size).toBe(0);
  });
  it("enforces a persistent network rate limit and resets after its window", async () => {
    for (let i = 0; i < 10; i++)
      await collectSubscriber(
        { email: `a${i}@example.com`, consent: true, client: "same-ip" },
        secret,
      );
    await expect(
      collectSubscriber(
        { email: "blocked@example.com", consent: true, client: "same-ip" },
        secret,
      ),
    ).rejects.toMatchObject({ status: 429 });
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 3600001);
    await collectSubscriber(
      { email: "later@example.com", consent: true, client: "same-ip" },
      secret,
    );
    vi.restoreAllMocks();
  });
  it("requires a configured gateway secret and super-admin subscriber capability", async () => {
    const req = (authorization: string) =>
      new Request("https://admin.test/api/web/newsletter", {
        headers: { authorization },
      });
    expect(() => authorizeNewsletterGateway(req(""))).toThrow();
    vi.stubEnv("MMG_NEWSLETTER_SECRET", secret);
    expect(() => authorizeNewsletterGateway(req("Bearer wrong"))).toThrow();
    expect(authorizeNewsletterGateway(req(`Bearer ${secret}`))).toBe(secret);
    mocks.session.mockResolvedValue({
      uid: "vehicle",
      roles: ["vehicle_admin"],
    });
    await expect(newsletterStaffSession()).rejects.toMatchObject({
      status: 403,
    });
    mocks.session.mockResolvedValue({ uid: "super", roles: ["super_admin"] });
    await expect(newsletterStaffSession()).resolves.toMatchObject({
      uid: "super",
    });
  });
  it("removes private data and retains only a hashed audit reference", async () => {
    await collectSubscriber(
      { email: "remove@example.com", consent: true },
      secret,
    );
    const key = [...docs.keys()].find((key) => key.startsWith(SUBSCRIBERS))!;
    await removeSubscriber(key.split("/")[1], "staff");
    expect(docs.has(key)).toBe(false);
    expect(JSON.stringify([...docs.values()])).not.toContain(
      "remove@example.com",
    );
    expect([...docs.values()]).toContainEqual(
      expect.objectContaining({ action: "remove-subscriber", actor: "staff" }),
    );
  });
  it("paginates the isolated local list and protects CSV cells from formula execution", async () => {
    mocks.fixture = true;
    const global = globalThis as typeof globalThis & {
      mmgNewsletterFixture?: Map<string, unknown>;
      mmgNewsletterRates?: Map<string, unknown>;
    };
    global.mmgNewsletterFixture = new Map();
    global.mmgNewsletterRates = new Map();
    for (let i = 0; i < 53; i++)
      await collectSubscriber(
        {
          email: `person${i}@example.com`,
          consent: true,
          client: `local-${i}`,
        },
        secret,
      );
    const first = await listSubscribers();
    const last = await listSubscribers(first.nextCursor!);
    expect(first.items).toHaveLength(50);
    expect(last.items).toHaveLength(3);
    expect(last.nextCursor).toBeNull();
    expect(
      new Set([...first.items, ...last.items].map((item) => item.id)).size,
    ).toBe(53);
    expect(
      (await listSubscribers("", "Person1@example.com")).items,
    ).toHaveLength(1);
    expect(
      subscriberCsv([{ ...first.items[0], email: "=cmd@example.com" }]),
    ).toMatch(/^"'=cmd@example.com"/);
    expect(() => normalizeEmail("broken")).toThrow();
    global.mmgNewsletterFixture = new Map();
    global.mmgNewsletterRates = new Map();
  });
});
