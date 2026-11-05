import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { deleteApp, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { blankVehicle, validateContent } from "../model";

vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("../../auth/server/firebase-admin", () => ({
  getAdminFirestore: () => state.db,
}));
vi.mock("./access", () => ({ isWebFixture: () => false }));
import { listWebVehicles, mutateWebVehicle } from "./repository";

const integration = process.env.FIRESTORE_EMULATOR_HOST
  ? describe
  : describe.skip;
integration("website fleet positions in local Firestore", () => {
  const prefix = `ordering-${randomUUID()}`;
  const ids = [`${prefix}-first`, `${prefix}-second`, `${prefix}-third`];
  let app: ReturnType<typeof initializeApp>;
  let db: ReturnType<typeof getFirestore>;

  beforeAll(() => {
    if (
      !/^(127\.0\.0\.1|localhost):\d+$/.test(
        process.env.FIRESTORE_EMULATOR_HOST || "",
      )
    )
      throw new Error("Local emulator required");
    app = initializeApp({ projectId: "demo-mmg-ordering" }, prefix);
    db = getFirestore(app);
    state.db = db;
  });
  afterAll(async () => {
    for (const id of ids) {
      await db.collection("websiteVehicles").doc(id).delete();
      await db.collection("websitePublishedVehicles").doc(id).delete();
      const audits = await db
        .collection("websiteAdminAudit")
        .where("vehicleId", "==", id)
        .get();
      await Promise.all(audits.docs.map((doc) => doc.ref.delete()));
    }
    await deleteApp(app);
  });

  it("serializes additions and preserves positions after edits and publishing", async () => {
    const content = {
      ...blankVehicle,
      name: "Prado",
      brand: "Toyota",
      tagline: "For your day.",
      description: "Local ordering test.",
      coverId: "photo",
      photos: [
        {
          id: "photo",
          referenceUrl: "https://mmgconcierge.com/images/prado.webp",
          alt: "Prado",
          caption: "",
          kind: "reference" as const,
          x: 50,
          y: 50,
        },
      ],
    };
    const first = await mutateWebVehicle({
      id: ids[0],
      content,
      expectedVersion: 0,
      actor: "test",
    });
    const additions = await Promise.all(
      ids
        .slice(1)
        .map((id) =>
          mutateWebVehicle({ id, content, expectedVersion: 0, actor: "test" }),
        ),
    );
    expect(
      new Set([first, ...additions].map((vehicle) => vehicle.order)).size,
    ).toBe(3);
    expect(additions.every((vehicle) => vehicle.order < first.order)).toBe(
      true,
    );
    const original = (await listWebVehicles())
      .filter((v) => ids.includes(v.id))
      .map((v) => v.id);
    const edited = await mutateWebVehicle({
      id: first.id,
      content: validateContent({
        ...first,
        name: "Renamed Prado",
        photos: [{ ...content.photos[0], y: 70 }],
      }),
      expectedVersion: first.version,
      actor: "test",
    });
    for (const vehicle of [edited, ...additions]) {
      await mutateWebVehicle({
        id: vehicle.id,
        action: "publish",
        expectedVersion: vehicle.version,
        actor: "test",
      });
    }
    for (const published of [false, true]) {
      expect(
        (await listWebVehicles(published))
          .filter((v) => ids.includes(v.id))
          .map((v) => v.id),
      ).toEqual(original);
    }
  }, 30000);
});
