import { beforeEach, describe, it, expect, vi } from "vitest";
import sharp from "sharp";
vi.mock("server-only", () => ({}));
const mock = vi.hoisted(() => ({
  published: false,
  save: vi.fn(),
  metadata: vi.fn(),
  download: vi.fn(),
  file: vi.fn(),
  db: {} as unknown,
}));
vi.mock("../../auth/server/firebase-admin", () => ({
  getAdminFirestore: () => mock.db,
  getAdminStorage: () => ({ bucket: () => ({ file: mock.file }) }),
}));
vi.mock("./access", () => ({ isWebFixture: () => false }));
vi.mock("./repository", () => ({ listWebVehicles: vi.fn() }));
import { uploadWebPhoto, readWebPhoto } from "./media";
beforeEach(() => {
  vi.clearAllMocks();
  mock.published = false;
  mock.save.mockResolvedValue(undefined);
  mock.metadata.mockResolvedValue(undefined);
  mock.download.mockResolvedValue([Buffer.from("webp")]);
  mock.file.mockReturnValue({
    save: mock.save,
    download: mock.download,
    delete: vi.fn(),
  });
  mock.db = {
    collection: (name: string) => ({
      doc: () => ({
        create: mock.metadata,
        get: async () => ({
          data: () => ({ storagePath: "private/owner-verification/secret" }),
        }),
      }),
      where: (key: string, op: string, id: string) => {
        expect(name).toBe("websitePublishedVehicles");
        expect([key, op, id]).toEqual([
          "mediaIds",
          "array-contains",
          "photo-id",
        ]);
        return {
          limit: () => ({ get: async () => ({ empty: !mock.published }) }),
        };
      },
    }),
  };
});
const upload = (file: File) => {
  const form = new FormData();
  form.set("file", file);
  return uploadWebPhoto(
    new Request("https://admin.test/api/web/media", {
      method: "POST",
      body: form,
    }),
    "staff",
  );
};
describe("website photograph processing and access", () => {
  it("transcodes actual image bytes, strips metadata and stores only in the website namespace", async () => {
    const png = await sharp({
      create: { width: 12, height: 8, channels: 3, background: "#224433" },
    })
      .withMetadata()
      .png()
      .toBuffer();
    const photo = await upload(
      new File([new Uint8Array(png)], "photo.png", { type: "image/png" }),
    );
    expect(photo.mediaId).toBe(photo.id);
    expect(mock.file).toHaveBeenCalledWith(
      `private/website-media/${photo.id}.webp`,
    );
    const processed = await sharp(mock.save.mock.calls[0][0]).metadata();
    expect(processed.format).toBe("webp");
    expect(processed.exif).toBeUndefined();
    expect(mock.metadata).toHaveBeenCalledWith(
      expect.objectContaining({ actor: "staff" }),
    );
  });
  it("rejects corrupt files regardless of the claimed JPEG MIME type", async () => {
    await expect(
      upload(
        new File(["not a photograph"], "fake.jpg", { type: "image/jpeg" }),
      ),
    ).rejects.toThrow(/could not be processed/);
    expect(mock.file).not.toHaveBeenCalled();
  });
  it("refuses public reads of draft-only photos", async () => {
    expect(await readWebPhoto("photo-id", false)).toBeNull();
    expect(mock.file).not.toHaveBeenCalled();
  });
  it("serves published images from a derived website path, never a stored app-private path", async () => {
    mock.published = true;
    expect(await readWebPhoto("photo-id", false)).toEqual(Buffer.from("webp"));
    expect(mock.file).toHaveBeenCalledWith(
      "private/website-media/photo-id.webp",
    );
  });
  it("caps the request body before parsing multipart data", async () => {
    const body = new Uint8Array(11 * 1024 * 1024);
    await expect(
      uploadWebPhoto(
        new Request("https://admin.test/api/web/media", {
          method: "POST",
          body,
        }),
        "staff",
      ),
    ).rejects.toMatchObject({ status: 413 });
    expect(mock.save).not.toHaveBeenCalled();
  });
});
