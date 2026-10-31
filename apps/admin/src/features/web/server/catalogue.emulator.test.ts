import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, it, expect, vi } from "vitest";
import sharp from "sharp";
vi.mock("server-only", () => ({}));
import {
  getAdminFirestore,
  getAdminStorage,
  getAdminApp,
} from "../../auth/server/firebase-admin";
import { deleteApp } from "firebase-admin/app";
import { mutateWebVehicle, deleteWebVehicle } from "./repository";
import { uploadWebPhoto, readWebPhoto } from "./media";
import { blankVehicle } from "../model";
const integration =
  process.env.FIRESTORE_EMULATOR_HOST &&
  process.env.FIREBASE_STORAGE_EMULATOR_HOST
    ? describe
    : describe.skip;
integration("website catalogue against local Firestore and Storage", () => {
  const id = `web-test-${randomUUID()}`;
  let mediaId = "";
  beforeAll(() => {
    for (const key of [
      "FIRESTORE_EMULATOR_HOST",
      "FIREBASE_STORAGE_EMULATOR_HOST",
    ])
      if (!/^(127\.0\.0\.1|localhost):\d+$/.test(process.env[key] || ""))
        throw new Error("Local emulators only");
    vi.stubEnv("FIREBASE_PROJECT_ID", "mmg-concierge-dev");
    vi.stubEnv(
      "FIREBASE_STORAGE_BUCKET",
      "mmg-concierge-dev.firebasestorage.app",
    );
    vi.stubEnv("MMG_FIREBASE_ENV", "development");
    vi.stubEnv("MMG_ADMIN_FIXTURES", "0");
  });
  afterAll(async () => {
    const db = getAdminFirestore();
    await db.collection("websiteVehicles").doc(id).delete();
    await db.collection("websiteDeletedVehicles").doc(id).delete();
    await db.collection("websitePublishedVehicles").doc(id).delete();
    const audits = await db
      .collection("websiteAdminAudit")
      .where("vehicleId", "==", id)
      .get();
    await Promise.all(audits.docs.map((d) => d.ref.delete()));
    if (mediaId) {
      await db.collection("websiteMedia").doc(mediaId).delete();
      await getAdminStorage()
        .bucket()
        .file(`private/website-media/${mediaId}.webp`)
        .delete({ ignoreNotFound: true });
    }
    await deleteApp(getAdminApp());
    vi.unstubAllEnvs();
  });
  it("protects draft media, rejects concurrent stale edits, and publishes a separate snapshot", async () => {
    const image = await sharp({
      create: { width: 20, height: 10, channels: 3, background: "#2c4938" },
    })
      .png()
      .toBuffer();
    const form = new FormData();
    form.set(
      "file",
      new File([new Uint8Array(image)], "test.png", { type: "image/png" }),
    );
    const uploaded = await uploadWebPhoto(
      new Request("http://localhost/api/web/media", {
        method: "POST",
        body: form,
      }),
      "web-emulator-test",
    );
    mediaId = uploaded.mediaId;
    expect(await readWebPhoto(mediaId, false)).toBeNull();
    expect(await readWebPhoto(mediaId, true)).not.toBeNull();
    const content = {
      ...blankVehicle,
      name: "Emulator Prado",
      brand: "Toyota",
      tagline: "Arrive well.",
      description: "Website-only integration test.",
      photos: [
        { ...uploaded, kind: "actual" as const, alt: "Prado test image" },
      ],
      coverId: uploaded.id,
    };
    const draft = await mutateWebVehicle({
      id,
      content,
      expectedVersion: 0,
      actor: "web-emulator-test",
    });
    const results = await Promise.allSettled([
      mutateWebVehicle({
        id,
        content: { ...content, name: "First edit" },
        expectedVersion: draft.version,
        actor: "staff-one",
      }),
      mutateWebVehicle({
        id,
        content: { ...content, name: "Second edit" },
        expectedVersion: draft.version,
        actor: "staff-two",
      }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    const current = (
      await getAdminFirestore().collection("websiteVehicles").doc(id).get()
    ).data()!;
    const live = await mutateWebVehicle({
      id,
      action: "publish",
      expectedVersion: current.version,
      actor: "web-emulator-test",
    });
    expect(await readWebPhoto(mediaId, false)).not.toBeNull();
    const edited = await mutateWebVehicle({
      id,
      content: { ...content, name: "Private draft edit" },
      expectedVersion: live.version,
      actor: "web-emulator-test",
    });
    expect(
      (
        await getAdminFirestore()
          .collection("websitePublishedVehicles")
          .doc(id)
          .get()
      ).data()?.name,
    ).toBe(live.name);
    await mutateWebVehicle({
      id,
      action: "archive",
      expectedVersion: edited.version,
      actor: "web-emulator-test",
    });
    expect(await readWebPhoto(mediaId, false)).toBeNull();
    expect(
      (await getAdminFirestore().collection("vehicles").doc(id).get()).exists,
    ).toBe(false);
    const version = (
      await getAdminFirestore().collection("websiteVehicles").doc(id).get()
    ).data()!.version;
    await expect(
      deleteWebVehicle(id, version - 1, "staff"),
    ).rejects.toMatchObject({ status: 409 });
    await deleteWebVehicle(id, version, "staff");
    expect(
      (await getAdminFirestore().collection("websiteVehicles").doc(id).get())
        .exists,
    ).toBe(false);
    expect(
      (
        await getAdminFirestore()
          .collection("websitePublishedVehicles")
          .doc(id)
          .get()
      ).exists,
    ).toBe(false);
    expect(
      (
        await getAdminFirestore()
          .collection("websiteDeletedVehicles")
          .doc(id)
          .get()
      ).exists,
    ).toBe(true);
  }, 30000);
});
