import "server-only";
import {
  createHash,
  createHmac,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { FieldPath, Timestamp } from "firebase-admin/firestore";
import { getAdminFirestore } from "../../auth/server/firebase-admin";
import { staffSessionHasCapability } from "../../auth/server/session";
import { webApiSession, isWebFixture } from "./access";
import { WebError } from "../model";
import {
  CONSENT_TEXT,
  CONSENT_VERSION,
  normalizeEmail,
  requireSubscriberId,
  type Subscriber,
} from "../newsletter";
export const SUBSCRIBERS = "websiteNewsletterSubscribers";
const RATE = "websiteNewsletterRateLimits";
const HOUR = 60 * 60 * 1000;
export function authorizeNewsletterGateway(request: Request) {
  const secret = process.env.MMG_NEWSLETTER_SECRET || "";
  if (secret.length < 32)
    throw new WebError("Newsletter is not configured.", 503);
  const actual = Buffer.from(request.headers.get("authorization") || "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
    throw new WebError("Not authorised.", 401);
  return secret;
}
export async function newsletterStaffSession() {
  const session = await webApiSession();
  if (!staffSessionHasCapability(session, "web.subscribers"))
    throw new WebError("Your staff account cannot manage subscribers.", 403);
  return session;
}
// Shared only within the development process; never used in production.
const fixture = globalThis as typeof globalThis & {
  mmgNewsletterFixture?: Map<string, Subscriber>;
  mmgNewsletterRates?: Map<string, { start: number; count: number }>;
};
const fixtureItems = () => (fixture.mmgNewsletterFixture ??= new Map());
const fixtureRates = () => (fixture.mmgNewsletterRates ??= new Map());
export async function collectSubscriber(
  body: Record<string, unknown>,
  secret: string,
) {
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new WebError("Invalid signup.");
  if (typeof body.website === "string" && body.website) return;
  const email = normalizeEmail(body.email);
  if (body.consent !== true) throw new WebError("Consent is required.");
  const now = Date.now();
  const id = createHash("sha256").update(email).digest("hex");
  const client =
    typeof body.client === "string" && body.client.length <= 128
      ? body.client
      : "unknown";
  const rateId = createHmac("sha256", secret).update(client).digest("hex");
  const item: Subscriber = {
    id,
    email,
    createdAt: new Date(now).toISOString(),
    source: "website-footer",
    consentVersion: CONSENT_VERSION,
    consentText: CONSENT_TEXT,
    emailVerified: false,
  };
  const nextRate = (
    old: { start: number; count: number } | undefined,
    limit: number,
  ) => {
    const current =
      old && now - old.start < HOUR ? old : { start: now, count: 0 };
    if (current.count >= limit)
      throw new WebError("Too many attempts. Try again later.", 429);
    return { start: current.start, count: current.count + 1 };
  };
  if (isWebFixture()) {
    const ip = nextRate(fixtureRates().get(rateId), 10);
    const total = nextRate(fixtureRates().get("global"), 1000);
    fixtureRates().set(rateId, ip);
    fixtureRates().set("global", total);
    if (!fixtureItems().has(id)) fixtureItems().set(id, item);
    return;
  }
  const db = getAdminFirestore();
  const ref = db.collection(SUBSCRIBERS).doc(id);
  const ipRef = db.collection(RATE).doc(rateId);
  const totalRef = db.collection(RATE).doc("global");
  await db.runTransaction(async (tx) => {
    const [old, ip, total] = await Promise.all([
      tx.get(ref),
      tx.get(ipRef),
      tx.get(totalRef),
    ]);
    const nextIp = nextRate(
      ip.data() as { start: number; count: number } | undefined,
      10,
    );
    const nextTotal = nextRate(
      total.data() as { start: number; count: number } | undefined,
      1000,
    );
    const expiresAt = Timestamp.fromMillis(now + 2 * HOUR);
    tx.set(ipRef, { ...nextIp, expiresAt });
    tx.set(totalRef, { ...nextTotal, expiresAt });
    if (!old.exists) tx.create(ref, item);
  });
}
export async function listSubscribers(
  cursor = "",
  search = "",
  size = 50,
): Promise<{ items: Subscriber[]; nextCursor: string | null }> {
  if (cursor) requireSubscriberId(cursor);
  if (search) {
    const id = createHash("sha256")
      .update(normalizeEmail(search))
      .digest("hex");
    const item = isWebFixture()
      ? fixtureItems().get(id)
      : ((
          await getAdminFirestore().collection(SUBSCRIBERS).doc(id).get()
        ).data() as Subscriber | undefined);
    return { items: item ? [item] : [], nextCursor: null };
  }
  let items: Subscriber[];
  if (isWebFixture())
    items = [...fixtureItems().values()]
      .sort((a, b) => a.id.localeCompare(b.id))
      .filter((item) => item.id > cursor)
      .slice(0, size + 1);
  else {
    let query = getAdminFirestore()
      .collection(SUBSCRIBERS)
      .orderBy(FieldPath.documentId())
      .limit(size + 1);
    if (cursor) query = query.startAfter(cursor);
    items = (await query.get()).docs.map((doc) => doc.data() as Subscriber);
  }
  return {
    items: items.slice(0, size),
    nextCursor: items.length > size ? items[size - 1].id : null,
  };
}
export async function removeSubscriber(id: unknown, actor: string) {
  requireSubscriberId(id);
  if (isWebFixture()) {
    fixtureItems().delete(id);
    return;
  }
  const auditId = randomUUID();
  const db = getAdminFirestore();
  await db.runTransaction(async (tx) => {
    tx.delete(db.collection(SUBSCRIBERS).doc(id));
    tx.create(db.collection("websiteAdminAudit").doc(auditId), {
      action: "remove-subscriber",
      subscriberId: id,
      actor,
      at: new Date().toISOString(),
    });
  });
}
