import "server-only";
import { randomUUID } from "node:crypto";
import { writeFile, readFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import sharp from "sharp";
import {
  getAdminFirestore,
  getAdminStorage,
} from "../../auth/server/firebase-admin";
import { isWebFixture } from "./access";
import { listWebVehicles } from "./repository";
import { WebError } from "../model";
const MAX_UPLOAD = 10 * 1024 * 1024;
export async function uploadWebPhoto(request: Request, actor: string) {
  const reader = request.body?.getReader();
  if (!reader) throw new WebError("Choose a photograph.");
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.byteLength;
    if (size > MAX_UPLOAD + 100 * 1024) {
      await reader.cancel();
      throw new WebError("Each photo must be under 10 MB.", 413);
    }
    chunks.push(part.value);
  }
  const data = await new Request(request.url, {
    method: "POST",
    headers: request.headers,
    body: Buffer.concat(chunks),
  }).formData();
  const file = data.get("file");
  if (
    !(file instanceof File) ||
    !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
    file.size > MAX_UPLOAD
  )
    throw new WebError("Use a JPEG, PNG or WebP photo under 10 MB.");
  let output: Buffer;
  try {
    const image = sharp(Buffer.from(await file.arrayBuffer()), {
      limitInputPixels: 40000000,
    });
    const metadata = await image.metadata();
    if (!metadata.format || !["jpeg", "png", "webp"].includes(metadata.format))
      throw new Error("Unsupported image.");
    output = await image
      .rotate()
      .resize({
        width: 2200,
        height: 2200,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 86 })
      .toBuffer();
  } catch {
    throw new WebError(
      "This image could not be processed. Choose another JPEG, PNG or WebP.",
    );
  }
  const id = randomUUID();
  const storagePath = `private/website-media/${id}.webp`;
  if (isWebFixture()) {
    await mkdir(join(tmpdir(), "mmg-website-admin-preview"), {
      recursive: true,
    });
    await writeFile(
      join(tmpdir(), "mmg-website-admin-preview", `${id}.webp`),
      output,
    );
  } else {
    const file = getAdminStorage().bucket().file(storagePath);
    await file.save(output, {
      resumable: false,
      contentType: "image/webp",
      metadata: { cacheControl: "private,no-store" },
    });
    try {
      await getAdminFirestore().collection("websiteMedia").doc(id).create({
        storagePath,
        actor,
        bytes: output.length,
        createdAt: new Date().toISOString(),
      });
    } catch (error) {
      await file.delete().catch(() => undefined);
      throw error;
    }
  }
  return {
    id,
    mediaId: id,
    alt: "",
    caption: "",
    kind: "actual",
    x: 50,
    y: 50,
  };
}
export async function readWebPhoto(
  id: string,
  staff: boolean,
): Promise<Buffer | null> {
  if (isWebFixture()) {
    if (
      !staff &&
      !(await listWebVehicles(true)).some((v) =>
        v.photos.some((p) => p.mediaId === id),
      )
    )
      return null;
    try {
      return await readFile(
        join(tmpdir(), "mmg-website-admin-preview", `${id}.webp`),
      );
    } catch {
      return null;
    }
  }
  const db = getAdminFirestore();
  if (
    !staff &&
    (
      await db
        .collection("websitePublishedVehicles")
        .where("mediaIds", "array-contains", id)
        .limit(1)
        .get()
    ).empty
  )
    return null;
  const media = (await db.collection("websiteMedia").doc(id).get()).data();
  if (!media) return null;
  const [buffer] = await getAdminStorage()
    .bucket()
    .file(`private/website-media/${id}.webp`)
    .download();
  return buffer;
}
