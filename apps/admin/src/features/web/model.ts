export type WebStatus = "draft" | "published" | "hidden" | "archived";
export type WebPhoto = {
  id: string;
  mediaId?: string;
  referenceUrl?: string;
  alt: string;
  caption: string;
  kind: "actual" | "reference" | "illustration";
  x: number;
  y: number;
};
export type WebVehicleContent = {
  name: string;
  brand: string;
  category: string;
  tagline: string;
  description: string;
  year: string;
  bestSuited: string;
  passengers: string;
  chauffeur: string;
  order: number;
  coverId: string;
  photos: WebPhoto[];
};
export type WebVehicle = WebVehicleContent & {
  id: string;
  slug: string;
  status: WebStatus;
  version: number;
  updatedAt: string;
  publishedAt: string | null;
  publishedVersion: number | null;
};
export type WebAction = "publish" | "hide" | "archive" | "restore" | "delete";
export class WebError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export const blankVehicle: WebVehicleContent = {
  name: "",
  brand: "",
  category: "Executive SUV",
  tagline: "",
  description: "",
  year: "",
  bestSuited: "",
  passengers: "",
  chauffeur: "Arranged with your quote",
  order: 10,
  coverId: "",
  photos: [],
};
export function validId(value: string) {
  return /^[a-zA-Z0-9_-]{1,100}$/.test(value);
}
const text = (value: unknown, limit: number) => {
  if (typeof value !== "string" || value.length > limit)
    throw new WebError("Some vehicle details are missing or too long.");
  return value.trim();
};
export function validateContent(raw: unknown): WebVehicleContent {
  if (!raw || typeof raw !== "object")
    throw new WebError("Vehicle details are required.");
  const r = raw as Record<string, unknown>;
  const content = {
    name: text(r.name, 100),
    brand: text(r.brand, 60),
    category: text(r.category, 60),
    tagline: text(r.tagline, 160),
    description: text(r.description, 2500),
    year: text(r.year, 4),
    bestSuited: text(r.bestSuited ?? "", 200),
    passengers: text(r.passengers, 100),
    chauffeur: text(r.chauffeur, 200),
    coverId: text(r.coverId, 100),
    order: r.order,
  };
  if (
    !Number.isInteger(content.order) ||
    Number(content.order) < 0 ||
    Number(content.order) > 9999
  )
    throw new WebError("Display order must be a number from 0 to 9999.");
  if (content.year && !/^(19|20)\d{2}$/.test(content.year))
    throw new WebError("Enter a four-digit model year, or leave it blank.");
  if (!Array.isArray(r.photos) || r.photos.length > 10)
    throw new WebError("Use up to 10 photographs per vehicle.");
  const photos: WebPhoto[] = r.photos.map((photo: unknown) => {
    if (!photo || typeof photo !== "object")
      throw new WebError("Invalid photo.");
    const p = photo as Record<string, unknown>;
    const id = text(p.id, 100);
    if (!validId(id)) throw new WebError("Invalid photo identifier.");
    const mediaId = p.mediaId === undefined ? undefined : text(p.mediaId, 100);
    const referenceUrl =
      p.referenceUrl === undefined ? undefined : text(p.referenceUrl, 400);
    if (Boolean(mediaId) === Boolean(referenceUrl))
      throw new WebError("Each photo must have one source.");
    if (mediaId && !validId(mediaId))
      throw new WebError("Invalid uploaded photo.");
    if (
      referenceUrl &&
      !/^https:\/\/mmgconcierge\.com\/images\/[a-zA-Z0-9._-]+$/.test(
        referenceUrl,
      )
    )
      throw new WebError(
        "Use an uploaded photo or an existing MMG reference image.",
      );
    if (!["actual", "reference", "illustration"].includes(String(p.kind)))
      throw new WebError("Choose the photo type.");
    if (
      ![p.x, p.y].every(
        (n) =>
          typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 100,
      )
    )
      throw new WebError("Invalid image focal point.");
    return {
      id,
      ...(mediaId ? { mediaId } : { referenceUrl }),
      alt: text(p.alt, 200),
      caption: text(p.caption, 300),
      kind: p.kind as WebPhoto["kind"],
      x: p.x as number,
      y: p.y as number,
    };
  });
  if (new Set(photos.map((p) => p.id)).size !== photos.length)
    throw new WebError("A photo cannot appear twice.");
  if (content.coverId && !photos.some((p) => p.id === content.coverId))
    throw new WebError("Choose a cover from this vehicle’s photos.");
  return { ...content, order: content.order as number, photos };
}
export function requirePublishable(v: WebVehicleContent) {
  if (!v.name || !v.brand || !v.category || !v.tagline || !v.description)
    throw new WebError(
      "Add the vehicle name, brand, category and descriptions before publishing.",
    );
  if (!v.photos.length || !v.photos.some((p) => p.id === v.coverId))
    throw new WebError("Choose a cover photo before publishing.");
  if (v.photos.some((p) => !p.alt))
    throw new WebError(
      "Add a short description for every photo before publishing.",
    );
}
export function transition(status: WebStatus, action: WebAction): WebStatus {
  if (action === "delete")
    throw new WebError("Deletion must use the dedicated delete operation.");
  if (action === "restore") {
    if (status !== "archived")
      throw new WebError("Only archived vehicles can be restored.");
    return "hidden";
  }
  if (status === "archived")
    throw new WebError("Restore this vehicle before making changes.");
  return action === "publish"
    ? "published"
    : action === "hide"
      ? "hidden"
      : "archived";
}
export function photoUrl(photo: WebPhoto, base = "") {
  return photo.referenceUrl || `${base}/api/web/media/${photo.mediaId}`;
}
export function publicVehicle(v: WebVehicle, base: string) {
  const cover = v.photos.find((p) => p.id === v.coverId)!;
  return {
    id: v.slug,
    name: v.name,
    shortTitle: v.name,
    brand: v.brand,
    badge: v.category,
    tagline: v.tagline,
    description: v.description,
    image: photoUrl(cover, base),
    imagePosition: `${cover.x}% ${cover.y}%`,
    gallery: v.photos.map((p) => ({
      src: photoUrl(p, base),
      alt: p.alt,
      caption:
        p.caption ||
        (p.kind === "illustration"
          ? "Illustrative scene."
          : p.kind === "reference"
            ? "Reference photograph. Current photos are available on enquiry."
            : ""),
      position: `${p.x}% ${p.y}%`,
    })),
    specs: [
      ...(v.year ? [{ label: "Model year", value: v.year }] : []),
      { label: "Vehicle class", value: v.category },
      ...(v.bestSuited
        ? [{ label: "Best suited to", value: v.bestSuited }]
        : []),
      ...(v.passengers ? [{ label: "Passengers", value: v.passengers }] : []),
      ...(v.chauffeur ? [{ label: "Chauffeur", value: v.chauffeur }] : []),
    ],
  };
}
