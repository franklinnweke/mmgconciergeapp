import { beforeEach, describe, it, expect, vi } from "vitest";
import { blankVehicle, type WebVehicle } from "../model";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({
  docs: new Map<string, unknown>(),
  writes: [] as string[],
  retries: false,
  db: {} as unknown,
}));
vi.mock("../../auth/server/firebase-admin", () => ({
  getAdminFirestore: () => state.db,
}));
vi.mock("./access", () => ({ isWebFixture: () => false }));
import {
  mutateWebVehicle,
  importWebSeed,
  deleteWebVehicle,
} from "./repository";
const content = {
  ...blankVehicle,
  name: "Prado",
  brand: "Toyota",
  tagline: "Arrive well.",
  description: "A personal service.",
  coverId: "photo",
  photos: [
    {
      id: "photo",
      mediaId: "upload",
      alt: "Prado exterior",
      caption: "",
      kind: "actual" as const,
      x: 50,
      y: 50,
    },
  ],
};
function ref(path: string) {
  return {
    path,
    doc: (id: string) => {
      if (!id) throw new Error("Transaction-generated ID");
      return ref(`${path}/${id}`);
    },
  };
}
beforeEach(() => {
  state.docs.clear();
  state.writes = [];
  state.docs.set("websiteMedia/upload", {});
  state.db = {
    collection: (name: string) => ref(name),
    runTransaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      const pending: Array<() => void> = [];
      let written = false;
      const tx = {
        get: async (r: { path: string }) => {
          if (written) throw new Error("Read after write");
          return {
            exists: state.docs.has(r.path),
            data: () => state.docs.get(r.path),
          };
        },
        set: (r: { path: string }, v: unknown) => {
          written = true;
          pending.push(() => {
            state.docs.set(r.path, v);
            state.writes.push(r.path);
          });
        },
        create: (r: { path: string }, v: unknown) => {
          written = true;
          pending.push(() => {
            state.docs.set(r.path, v);
            state.writes.push(r.path);
          });
        },
        delete: (r: { path: string }) => {
          written = true;
          pending.push(() => {
            state.docs.delete(r.path);
            state.writes.push(r.path);
          });
        },
      };
      const result = await fn(tx);
      pending.forEach((f) => f());
      return result;
    },
  };
});
describe("separate website catalogue transactions", () => {
  it("keeps saved edits private until explicitly published; hiding removes the snapshot", async () => {
    const create = await mutateWebVehicle({
      id: "prado",
      content,
      expectedVersion: 0,
      actor: "staff",
    });
    expect(state.docs.has("websitePublishedVehicles/prado")).toBe(false);
    const published = await mutateWebVehicle({
      id: "prado",
      action: "publish",
      expectedVersion: create.version,
      actor: "staff",
    });
    expect(
      (state.docs.get("websitePublishedVehicles/prado") as WebVehicle).name,
    ).toBe("Prado");
    const edited = await mutateWebVehicle({
      id: "prado",
      content: { ...content, name: "Prado updated" },
      expectedVersion: published.version,
      actor: "staff",
    });
    expect(edited.name).toBe("Prado updated");
    expect(
      (state.docs.get("websitePublishedVehicles/prado") as WebVehicle).name,
    ).toBe("Prado");
    await mutateWebVehicle({
      id: "prado",
      action: "hide",
      expectedVersion: edited.version,
      actor: "staff",
    });
    expect(state.docs.has("websitePublishedVehicles/prado")).toBe(false);
    expect(
      state.writes.every((p) =>
        /^website(Vehicles|PublishedVehicles|AdminAudit)\//.test(p),
      ),
    ).toBe(true);
  });
  it("rejects stale saves without overwriting current data or writing an audit", async () => {
    await mutateWebVehicle({
      id: "prado",
      content,
      expectedVersion: 0,
      actor: "staff",
    });
    const writes = state.writes.length;
    await expect(
      mutateWebVehicle({
        id: "prado",
        content: { ...content, name: "Stale" },
        expectedVersion: 0,
        actor: "staff",
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(state.writes.length).toBe(writes);
    expect((state.docs.get("websiteVehicles/prado") as WebVehicle).name).toBe(
      "Prado",
    );
  });
  it("rejects missing media before any database writes", async () => {
    state.docs.delete("websiteMedia/upload");
    await expect(
      mutateWebVehicle({
        id: "prado",
        content,
        expectedVersion: 0,
        actor: "staff",
      }),
    ).rejects.toThrow(/photo/);
    expect(state.writes).toEqual([]);
  });
  it("imports create-only drafts and does not replace existing editorial work", async () => {
    await importWebSeed("staff");
    const key = "websiteVehicles/website-toyota-prado";
    const original = state.docs.get(key) as WebVehicle;
    state.docs.set(key, { ...original, name: "Edited by client" });
    await importWebSeed("staff");
    expect((state.docs.get(key) as WebVehicle).name).toBe("Edited by client");
    expect(
      [...state.docs.keys()].filter((k) =>
        k.startsWith("websitePublishedVehicles/"),
      ),
    ).toEqual([]);
  });
});

describe("website deletion", () => {
  it("deletes both copies, preserves an audit and prevents seed re-import from resurrecting the listing", async () => {
    await importWebSeed("staff");
    const id = "website-toyota-prado";
    await deleteWebVehicle(id, 1, "staff");
    expect(state.docs.has(`websiteVehicles/${id}`)).toBe(false);
    expect(state.docs.has(`websitePublishedVehicles/${id}`)).toBe(false);
    expect(state.docs.has(`websiteDeletedVehicles/${id}`)).toBe(true);
    expect([...state.docs.values()]).toContainEqual(
      expect.objectContaining({
        vehicleId: id,
        action: "delete",
        actor: "staff",
      }),
    );
    await importWebSeed("staff");
    expect(state.docs.has(`websiteVehicles/${id}`)).toBe(false);
  });
  it("rejects stale deletion without altering the listing", async () => {
    await mutateWebVehicle({
      id: "prado",
      content,
      expectedVersion: 0,
      actor: "staff",
    });
    const before = state.writes.length;
    await expect(deleteWebVehicle("prado", 9, "staff")).rejects.toMatchObject({
      status: 409,
    });
    expect(state.writes.length).toBe(before);
    expect(state.docs.has("websiteVehicles/prado")).toBe(true);
  });
});
