import { describe, it, expect } from "vitest";
import {
  blankVehicle,
  validateContent,
  requirePublishable,
  transition,
  publicVehicle,
  type WebVehicle,
} from "./model";
const photo = {
  id: "photo-1",
  mediaId: "media-1",
  alt: "Actual Prado exterior",
  caption: "",
  kind: "actual" as const,
  x: 50,
  y: 50,
};
const content = {
  ...blankVehicle,
  name: "Toyota Prado",
  brand: "Toyota",
  tagline: "Your day, personally arranged.",
  description: "A comfortable SUV for your itinerary.",
  photos: [photo],
  coverId: photo.id,
};
describe("website editorial safety", () => {
  it("accepts an incomplete draft but refuses to publish it", () => {
    expect(validateContent(blankVehicle)).toEqual(blankVehicle);
    expect(() => requirePublishable(blankVehicle)).toThrow(/before publishing/);
  });
  it("rejects untrusted image sources and duplicate photos", () => {
    expect(() =>
      validateContent({
        ...content,
        photos: [
          {
            ...photo,
            mediaId: undefined,
            referenceUrl: "https://example.com/private.jpg",
          },
        ],
      }),
    ).toThrow(/uploaded photo/);
    expect(() =>
      validateContent({ ...content, photos: [photo, photo] }),
    ).toThrow(/twice/);
  });
  it("requires a valid cover and accessible photo descriptions", () => {
    expect(() => validateContent({ ...content, coverId: "missing" })).toThrow(
      /cover/,
    );
    expect(() =>
      requirePublishable({ ...content, photos: [{ ...photo, alt: "" }] }),
    ).toThrow(/description/);
    expect(() => requirePublishable(content)).not.toThrow();
  });
  it("restores archived vehicles without publishing them", () => {
    expect(transition("archived", "restore")).toBe("hidden");
    expect(() => transition("archived", "publish")).toThrow(/Restore/);
    expect(() => transition("published", "restore")).toThrow(/Only archived/);
  });
  it("exposes only marketing fields, with ordered gallery and cover selection", () => {
    const v = {
      ...content,
      id: "private-id",
      slug: "toyota-prado",
      status: "published",
      version: 3,
      publishedVersion: 3,
      updatedAt: "now",
      publishedAt: "now",
      actor: "private-staff",
      photos: [photo, { ...photo, id: "second", mediaId: "media-2" }],
      coverId: "second",
    } as WebVehicle;
    const output = publicVehicle(v, "https://admin.mmgconcierge.com");
    expect(output.id).toBe("toyota-prado");
    expect(output.image).toBe(
      "https://admin.mmgconcierge.com/api/web/media/media-2",
    );
    expect(output.gallery.map((p) => p.src)).toEqual([
      "https://admin.mmgconcierge.com/api/web/media/media-1",
      "https://admin.mmgconcierge.com/api/web/media/media-2",
    ]);
    expect(output).not.toHaveProperty("version");
    expect(output).not.toHaveProperty("actor");
    expect(output).not.toHaveProperty("status");
  });
});
