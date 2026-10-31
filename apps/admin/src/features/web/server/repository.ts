import "server-only";
import { randomUUID } from "node:crypto";
import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getAdminFirestore } from "../../auth/server/firebase-admin";
import { isWebFixture } from "./access";
import {
  WebError,
  requirePublishable,
  transition,
  type WebAction,
  type WebVehicle,
  type WebVehicleContent,
} from "../model";
import seed from "../seed.json";
const DRAFTS = "websiteVehicles";
const PUBLIC = "websitePublishedVehicles";
const fixtureFile = join(
  tmpdir(),
  "mmg-website-admin-preview",
  "vehicles.json",
);
type FixtureState = {
  drafts: WebVehicle[];
  published: WebVehicle[];
  deletedIds?: string[];
};
async function fixtureState(): Promise<FixtureState> {
  try {
    return JSON.parse(await readFile(fixtureFile, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    const drafts = (seed as WebVehicle[]).map((v) => ({
      ...v,
      status: "published" as const,
      publishedVersion: v.version,
      publishedAt: v.updatedAt,
    }));
    const state = { drafts, published: drafts, deletedIds: [] };
    await saveFixture(state);
    return state;
  }
}
async function saveFixture(state: FixtureState) {
  await mkdir(join(tmpdir(), "mmg-website-admin-preview"), { recursive: true });
  const temporary = `${fixtureFile}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(state));
  await rename(temporary, fixtureFile);
}
export async function listWebVehicles(
  published = false,
): Promise<WebVehicle[]> {
  const items = isWebFixture()
    ? (await fixtureState())[published ? "published" : "drafts"]
    : (
        await getAdminFirestore()
          .collection(published ? PUBLIC : DRAFTS)
          .get()
      ).docs.map((d) => d.data() as WebVehicle);
  return items.sort(
    (a, b) => a.order - b.order || a.name.localeCompare(b.name),
  );
}
export async function getWebVehicle(id: string): Promise<WebVehicle | null> {
  if (isWebFixture())
    return (await fixtureState()).drafts.find((v) => v.id === id) || null;
  return (
    ((
      await getAdminFirestore().collection(DRAFTS).doc(id).get()
    ).data() as WebVehicle) || null
  );
}
export async function mutateWebVehicle({
  id,
  content,
  action,
  expectedVersion,
  actor,
}: {
  id: string;
  content?: WebVehicleContent;
  action?: WebAction;
  expectedVersion: number;
  actor: string;
}): Promise<WebVehicle> {
  const updatedAt = new Date().toISOString();
  const auditId = randomUUID();
  if (action === "delete")
    throw new WebError("Use the dedicated delete operation.");
  const apply = (existing: WebVehicle | null) => {
    if ((existing?.version || 0) !== expectedVersion)
      throw new WebError(
        "This vehicle changed in another session. Refresh before saving again.",
        409,
      );
    if (!existing && (!content || action))
      throw new WebError("Vehicle not found.", 404);
    if (existing?.status === "archived" && content)
      throw new WebError("Restore this vehicle before editing.");
    const status = action
      ? transition(existing!.status, action)
      : existing?.status || "draft";
    const next: WebVehicle = {
      ...(content || existing!),
      id,
      slug:
        existing?.slug ||
        `${
          content!.name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "") || "vehicle"
        }-${id.slice(0, 8)}`,
      status,
      version: expectedVersion + 1,
      updatedAt,
      publishedAt:
        action === "publish" ? updatedAt : existing?.publishedAt || null,
      publishedVersion:
        action === "publish"
          ? expectedVersion + 1
          : existing?.publishedVersion || null,
    };
    if (action === "publish") requirePublishable(next);
    return next;
  };
  if (isWebFixture()) {
    const state = await fixtureState();
    const index = state.drafts.findIndex((v) => v.id === id);
    const next = apply(index < 0 ? null : state.drafts[index]);
    state.drafts = [...state.drafts.filter((v) => v.id !== id), next];
    if (action === "publish")
      state.published = [...state.published.filter((v) => v.id !== id), next];
    else if (action)
      state.published = state.published.filter((v) => v.id !== id);
    await saveFixture(state);
    return next;
  }
  const db = getAdminFirestore();
  const ref = db.collection(DRAFTS).doc(id);
  return db.runTransaction(async (tx) => {
    const old = await tx.get(ref);
    const next = apply(old.exists ? (old.data() as WebVehicle) : null);
    if (content || action === "publish") {
      const mediaIds = [
        ...new Set(next.photos.flatMap((p) => (p.mediaId ? [p.mediaId] : []))),
      ];
      for (const mediaId of mediaIds) {
        if (!(await tx.get(db.collection("websiteMedia").doc(mediaId))).exists)
          throw new WebError(
            "One of these photos is unavailable. Upload it again.",
          );
      }
    }
    tx.set(ref, next);
    if (action === "publish")
      tx.set(db.collection(PUBLIC).doc(id), {
        ...next,
        mediaIds: next.photos.flatMap((p) => (p.mediaId ? [p.mediaId] : [])),
      });
    else if (action) tx.delete(db.collection(PUBLIC).doc(id));
    tx.create(db.collection("websiteAdminAudit").doc(auditId), {
      vehicleId: id,
      actor,
      action: action || (old.exists ? "save" : "create"),
      version: next.version,
      at: updatedAt,
    });
    return next;
  });
}
export async function importWebSeed(actor: string) {
  if (isWebFixture()) {
    const state = await fixtureState();
    for (const v of seed as WebVehicle[])
      if (
        !state.drafts.some((d) => d.id === v.id) &&
        !state.deletedIds?.includes(v.id)
      )
        state.drafts.push(v);
    await saveFixture(state);
    return;
  }
  const db = getAdminFirestore();
  // Idempotent create-only migration: existing editorial changes are never overwritten.
  for (const item of seed as WebVehicle[]) {
    const ref = db.collection(DRAFTS).doc(item.id);
    const auditId = randomUUID();
    const at = new Date().toISOString();
    await db.runTransaction(async (tx) => {
      const existing = await tx.get(ref);
      const deleted = await tx.get(
        db.collection("websiteDeletedVehicles").doc(item.id),
      );
      if (!existing.exists && !deleted.exists) {
        tx.create(ref, item);
        tx.create(db.collection("websiteAdminAudit").doc(auditId), {
          vehicleId: item.id,
          actor,
          action: "import",
          at,
        });
      }
    });
  }
}

export async function deleteWebVehicle(
  id: string,
  expectedVersion: number,
  actor: string,
) {
  const at = new Date().toISOString();
  const auditId = randomUUID();
  const verify = (existing: WebVehicle | null) => {
    if (!existing) throw new WebError("Vehicle not found.", 404);
    if (existing.version !== expectedVersion)
      throw new WebError(
        "This vehicle changed in another session. Refresh before deleting.",
        409,
      );
  };
  if (isWebFixture()) {
    const state = await fixtureState();
    verify(state.drafts.find((v) => v.id === id) || null);
    state.drafts = state.drafts.filter((v) => v.id !== id);
    state.published = state.published.filter((v) => v.id !== id);
    state.deletedIds = [...new Set([...(state.deletedIds || []), id])];
    await saveFixture(state);
    return;
  }
  const db = getAdminFirestore();
  const ref = db.collection(DRAFTS).doc(id);
  await db.runTransaction(async (tx) => {
    const old = await tx.get(ref);
    verify(old.exists ? (old.data() as WebVehicle) : null);
    tx.delete(ref);
    tx.delete(db.collection(PUBLIC).doc(id));
    tx.set(db.collection("websiteDeletedVehicles").doc(id), { id, at, actor });
    tx.create(db.collection("websiteAdminAudit").doc(auditId), {
      vehicleId: id,
      actor,
      action: "delete",
      version: expectedVersion,
      at,
    });
  });
}
