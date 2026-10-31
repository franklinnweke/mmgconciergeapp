// Explicit local bootstrap: migrates the current curated website fleet and all
// its photos through the same admin API that the dashboard uses. No cloud writes.
import { readFile } from "node:fs/promises";
import { resolve, basename } from "node:path";
const base = process.env.MMG_LOCAL_ADMIN_URL || "http://127.0.0.1:3100";
const origin = new URL(base);
if (
  origin.protocol !== "http:" ||
  origin.hostname !== "127.0.0.1" ||
  process.argv[2] !== "--replace-local"
)
  throw new Error(
    "Use --replace-local with a loopback HTTP admin only. This replaces local preview listings.",
  );
const seed = JSON.parse(
  await readFile(
    new URL("../src/features/web/seed.json", import.meta.url),
    "utf8",
  ),
);
const imageDirectory = process.argv[3];
async function api(path, body, method = "POST") {
  const response = await fetch(`${base}/api/web/${path}`, {
    method,
    headers: {
      Origin: base,
      ...(body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
    },
    ...(body
      ? { body: body instanceof FormData ? body : JSON.stringify(body) }
      : {}),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(`${path}: ${result.error}`);
  return result;
}
await api("import", {});
const media = new Map();
for (const item of seed) {
  const current = (await api(`vehicles/${item.id}`, undefined, "GET")).vehicle;
  const photos = [];
  for (const original of item.photos) {
    let uploaded = media.get(original.referenceUrl);
    if (!uploaded) {
      const filename = basename(new URL(original.referenceUrl).pathname);
      let bytes;
      if (imageDirectory)
        bytes = await readFile(resolve(imageDirectory, filename));
      else {
        const response = await fetch(original.referenceUrl, {
          signal: AbortSignal.timeout(15000),
        });
        if (!response.ok) throw new Error(`Image unavailable: ${filename}`);
        bytes = await response.arrayBuffer();
      }
      const form = new FormData();
      form.set(
        "file",
        new File([bytes], filename, {
          type: filename.endsWith(".png")
            ? "image/png"
            : filename.endsWith(".webp")
              ? "image/webp"
              : "image/jpeg",
        }),
      );
      uploaded = (await api("media", form)).photo;
      media.set(original.referenceUrl, uploaded);
    }
    const details = { ...original };
    delete details.referenceUrl;
    photos.push({ ...details, mediaId: uploaded.mediaId });
  }
  const content = { ...item, photos };
  const saved = (
    await api(
      `vehicles/${item.id}`,
      { content, expectedVersion: current.version },
      "PUT",
    )
  ).vehicle;
  await api(`vehicles/${item.id}/publish`, { expectedVersion: saved.version });
  console.log(`Connected: ${item.name} (${photos.length} photos)`);
}
const published = await api("catalogue", undefined, "GET");
if (published.vehicles.length !== seed.length)
  throw new Error(
    "Unexpected local catalogue size. Review extra local listings.",
  );
console.log(
  `Ready: ${published.vehicles.length} published vehicles; ${media.size} photos stored in the local admin.`,
);
