import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import {
  initializeTestEnvironment,
  assertFails,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc } from "firebase/firestore";
vi.mock("server-only", () => ({}));
import {
  collectSubscriber,
  listSubscribers,
  removeSubscriber,
  SUBSCRIBERS,
} from "./newsletter";
import {
  getAdminFirestore,
  getAdminApp,
} from "../../auth/server/firebase-admin";
import { deleteApp } from "firebase-admin/app";
const enabled = /^(127\.0\.0\.1|localhost):\d+$/.test(
  process.env.FIRESTORE_EMULATOR_HOST || "",
);
const test = enabled ? it : it.skip;
let rules: RulesTestEnvironment;
const prefix = randomUUID();
beforeAll(async () => {
  if (!enabled) return;
  vi.stubEnv("FIREBASE_PROJECT_ID", "mmg-concierge-dev");
  vi.stubEnv(
    "FIREBASE_STORAGE_BUCKET",
    "mmg-concierge-dev.firebasestorage.app",
  );
  vi.stubEnv("MMG_FIREBASE_ENV", "development");
  vi.stubEnv("MMG_ADMIN_FIXTURES", "0");
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST!.split(":");
  rules = await initializeTestEnvironment({
    projectId: "mmg-concierge-dev",
    firestore: {
      host,
      port: Number(port),
      rules: await readFile("../../firebase/firestore.rules", "utf8"),
    },
  });
});
afterAll(async () => {
  if (!enabled) return;
  const db = getAdminFirestore();
  for (const collection of [
    SUBSCRIBERS,
    "websiteNewsletterRateLimits",
    "websiteAdminAudit",
  ]) {
    const all = await db.collection(collection).get();
    await Promise.all(all.docs.map((item) => item.ref.delete()));
  }
  await rules.cleanup();
  await deleteApp(getAdminApp());
  vi.unstubAllEnvs();
});
test("real local Firestore deduplication, concurrency, cursor pagination, removal and client-denied records", async () => {
  const body = {
    email: `${prefix}@example.com`,
    consent: true,
    client: "same-test-network",
  };
  await Promise.all(
    Array.from({ length: 4 }, () => collectSubscriber(body, "test-secret")),
  );
  expect((await getAdminFirestore().collection(SUBSCRIBERS).get()).size).toBe(
    1,
  );
  for (let index = 0; index < 52; index++)
    await collectSubscriber(
      {
        email: `${prefix}-${index}@example.com`,
        consent: true,
        client: `test-network-${index}`,
      },
      "test-secret",
    );
  const first = await listSubscribers();
  const second = await listSubscribers(first.nextCursor!);
  expect(first.items).toHaveLength(50);
  expect(second.items).toHaveLength(3);
  expect(
    new Set([...first.items, ...second.items].map((item) => item.id)).size,
  ).toBe(53);
  const found = await listSubscribers("", body.email);
  const id = found.items[0].id;
  for (const context of [
    rules.unauthenticatedContext(),
    rules.authenticatedContext("test-client", { super_admin: true }),
  ]) {
    const record = doc(context.firestore(), SUBSCRIBERS, id);
    await assertFails(getDoc(record));
    await assertFails(setDoc(record, { email: "tampered@example.com" }));
  }
  await removeSubscriber(id, "local-test-super-admin");
  expect((await listSubscribers("", body.email)).items).toEqual([]);
}, 30000);
