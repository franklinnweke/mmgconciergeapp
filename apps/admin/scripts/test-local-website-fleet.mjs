import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
const admin = process.env.MMG_LOCAL_ADMIN_URL || "http://127.0.0.1:3100";
const site = process.env.MMG_LOCAL_WEBSITE_URL || "http://127.0.0.1:3000";
for (const base of [admin, site]) {
  const url = new URL(base);
  assert.equal(url.protocol, "http:");
  assert.equal(url.hostname, "127.0.0.1", "End-to-end writes are local only.");
}
const seed = JSON.parse(
  await readFile(
    new URL("../src/features/web/seed.json", import.meta.url),
    "utf8",
  ),
);
const report = { testedAt: new Date().toISOString(), admin, site, checks: [] };
function pass(check) {
  report.checks.push(check);
  console.log(`PASS ${check}`);
}
async function request(path, body, method = "POST", expected = 200) {
  const response = await fetch(`${admin}/api/web/${path}`, {
    method,
    headers: { Origin: admin, "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  assert.equal(response.status, expected, JSON.stringify(data));
  return data;
}
const get = (id) => request(`vehicles/${id}`, undefined, "GET");
const catalogue = async () =>
  (await request("catalogue", undefined, "GET")).vehicles;
const save = async (v, content) =>
  (
    await request(
      `vehicles/${v.id}`,
      { content, expectedVersion: v.version },
      "PUT",
    )
  ).vehicle;
const publish = async (v) =>
  (await request(`vehicles/${v.id}/publish`, { expectedVersion: v.version }))
    .vehicle;
const html = async (path) => {
  const response = await fetch(site + path, { cache: "no-store" });
  return { status: response.status, text: await response.text() };
};
const original = (await get("website-toyota-prado")).vehicle;
const addedId = `local-test-${randomUUID()}`;
let added;
let uploaded;
try {
  const fleet = await catalogue();
  assert.deepEqual(
    fleet.map((v) => v.id).sort(),
    seed.map((v) => v.slug).sort(),
  );
  for (const expected of seed) {
    const v = fleet.find((v) => v.id === expected.slug);
    for (const key of ["name", "brand", "tagline", "description"])
      assert.equal(v[key], expected[key]);
    assert.equal(v.badge, expected.category);
    assert.equal(
      v.specs.find((s) => s.label === "Best suited to").value,
      expected.bestSuited,
    );
    assert.ok(v.image.startsWith(admin + "/api/web/media/"));
  }
  pass(
    "All nine current website vehicles match the shared admin catalogue, with locally managed photos and original details.",
  );
  const image = await sharp({
    create: { width: 128, height: 80, channels: 3, background: "#244b3c" },
  })
    .jpeg()
    .toBuffer();
  const form = new FormData();
  form.set(
    "file",
    new File([new Uint8Array(image)], "local-verification.jpg", {
      type: "image/jpeg",
    }),
  );
  const uploadResponse = await fetch(admin + "/api/web/media", {
    method: "POST",
    headers: { Origin: admin },
    body: form,
  });
  assert.equal(uploadResponse.status, 200);
  uploaded = (await uploadResponse.json()).photo;
  const changed = {
    ...original,
    name: "Prado local verification",
    brand: "Toyota verified",
    category: "Signature SUV",
    year: "2022",
    tagline: "Local edit visible on the website.",
    description: "Locally verified description, edited from the website admin.",
    bestSuited: "Airport transfers and private occasions",
    passengers: "5 guests",
    chauffeur: "Private chauffeur confirmed",
    order: 1,
    photos: [
      {
        ...uploaded,
        alt: "Local photo upload verification",
        caption: "Local test image",
        kind: "illustration",
        x: 34,
        y: 61,
      },
      ...original.photos.slice(0, 2),
    ],
    coverId: uploaded.id,
  };
  const edited = await save(original, changed);
  assert.equal(
    (await catalogue()).find((v) => v.id === original.slug).name,
    original.name,
  );
  pass(
    "Saving edited details and photos keeps the live version unchanged until publishing.",
  );
  await publish(edited);
  let live = (await catalogue()).find((v) => v.id === original.slug);
  assert.equal(live.name, changed.name);
  assert.equal(live.image, admin + `/api/web/media/${uploaded.mediaId}`);
  assert.equal(live.gallery.length, 3);
  assert.equal(live.gallery[0].caption, "Local test image");
  assert.equal(live.imagePosition, "34% 61%");
  for (const path of ["/", "/fleet", `/fleet/${original.slug}`, "/book"])
    assert.ok(
      (await html(path)).text.includes(changed.name),
      `${path} must use updated catalogue`,
    );
  const detail = (await html(`/fleet/${original.slug}`)).text;
  for (const value of [
    changed.description,
    changed.bestSuited,
    changed.passengers,
    changed.chauffeur,
    "2022",
  ])
    assert.ok(detail.includes(value), `Missing updated detail: ${value}`);
  const photo = await fetch(live.image);
  assert.equal(photo.status, 200);
  assert.equal(photo.headers.get("content-type"), "image/webp");
  assert.equal(
    (await sharp(Buffer.from(await photo.arrayBuffer())).metadata()).format,
    "webp",
  );
  const optimized = await fetch(
    `${site}/_next/image?url=${encodeURIComponent(live.image)}&w=640&q=75`,
  );
  assert.equal(optimized.status, 200, await optimized.text());
  pass(
    "Published edits update home, fleet, detail page and booking choices; uploaded cover, gallery order, captions, focal point and optimized image load correctly.",
  );
  const content = {
    ...changed,
    name: "Local added vehicle verification",
    photos: [changed.photos[0]],
    coverId: uploaded.id,
  };
  added = (
    await request("vehicles", { id: addedId, expectedVersion: 0, content })
  ).vehicle;
  assert.ok(!(await catalogue()).some((v) => v.id === added.slug));
  added = await publish(added);
  for (const path of ["/", "/fleet", `/fleet/${added.slug}`, "/book"])
    assert.ok(
      (await html(path)).text.includes(content.name),
      `New vehicle missing from ${path}`,
    );
  assert.ok(
    (await html("/book")).text.includes(
      `<option value="${content.name}">${content.name}</option>`,
    ),
  );
  pass(
    "Adding and publishing a new vehicle creates its public detail route and booking option without a rebuild.",
  );
  await request(
    `vehicles/${added.id}/delete`,
    { expectedVersion: added.version - 1 },
    "POST",
    409,
  );
  assert.ok((await catalogue()).some((v) => v.id === added.slug));
  pass("A stale delete is rejected without removing the current vehicle.");
  await request(`vehicles/${added.id}/delete`, {
    expectedVersion: added.version,
  });
  await request(`vehicles/${added.id}`, undefined, "GET", 404);
  assert.ok(!(await catalogue()).some((v) => v.id === added.slug));
  for (const path of ["/", "/fleet", "/book"])
    assert.ok(
      !(await html(path)).text.includes(content.name),
      `Deleted vehicle remained on ${path}`,
    );
  const removed = await html(`/fleet/${added.slug}`);
  assert.ok(
    removed.status === 404 ||
      removed.text.includes("NEXT_HTTP_ERROR_FALLBACK;404") ||
      removed.text.includes("This page could not be found"),
  );
  added = undefined;
  pass(
    "Permanent deletion removes the record, public listing, detail route and booking choice.",
  );
} finally {
  const current = (await get(original.id)).vehicle;
  await publish(await save(current, original));
  if (added) {
    const currentAdded = await get(added.id);
    await request(`vehicles/${added.id}/delete`, {
      expectedVersion: currentAdded.vehicle.version,
    });
  }
}
const final = await catalogue();
assert.deepEqual(final.map((v) => v.id).sort(), seed.map((v) => v.slug).sort());
for (const v of final) {
  const expected = seed.find((s) => s.slug === v.id);
  assert.equal(v.name, expected.name);
  assert.equal(v.description, expected.description);
  assert.equal(v.gallery.length, expected.photos.length);
}
pass(
  "Test changes removed; all nine original vehicles and their original details/photos are restored and connected.",
);
if (process.env.MMG_WEB_TEST_REPORT)
  await writeFile(
    process.env.MMG_WEB_TEST_REPORT,
    JSON.stringify(report, null, 2) + "\n",
  );
