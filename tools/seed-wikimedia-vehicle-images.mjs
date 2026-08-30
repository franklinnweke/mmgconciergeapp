#!/usr/bin/env node

/**
 * Seeds the eight non-production Lagos vehicle examples with real, licensed
 * Wikimedia Commons photography. It is deliberately idempotent: object paths
 * and image IDs are stable, and every rerun overwrites only this seed media.
 *
 * The script is an operator utility, not an owner upload path. It preserves the
 * production photo shape: private processed variants, approved public copies,
 * image-subcollection metadata, and renter-facing Firebase media URLs.
 */

import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import sharp from 'sharp';

const PROJECT_ID = 'mmg-concierge';
const BUCKET = 'mmg-concierge.firebasestorage.app';
const IMAGE_ID = 'seed-wikimedia-primary';
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const STORAGE_BASE = `https://storage.googleapis.com/storage/v1/b/${BUCKET}`;
const STORAGE_UPLOAD_BASE = `https://storage.googleapis.com/upload/storage/v1/b/${BUCKET}`;
const NOW = new Date().toISOString();

const vehicles = [
  {
    vehicleId: 'veh-lagos-lc300-vxr-vip',
    sourceUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/17/Toyota_Land_Cruiser_300_4x4_ZX_2025_%281%29.jpg/1280px-Toyota_Land_Cruiser_300_4x4_ZX_2025_%281%29.jpg',
    sourcePageUrl: 'https://commons.wikimedia.org/wiki/File:Toyota_Land_Cruiser_300_4x4_ZX_2025_(1).jpg',
    author: 'Captainmorlypogi1959',
    license: 'CC BY-SA 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    redactions: [{ x: 0.2, y: 0.62, width: 0.19, height: 0.15 }],
  },
  {
    vehicleId: 'veh-lagos-lexus-lx600-vip',
    sourceUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6c/Lexus_LX_600_%282022%29_%2852129300534%29.jpg/1280px-Lexus_LX_600_%282022%29_%2852129300534%29.jpg',
    sourcePageUrl: 'https://commons.wikimedia.org/wiki/File:Lexus_LX_600_(2022)_(52129300534).jpg',
    author: 'Charles from Port Chester, New York',
    license: 'CC BY 2.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/2.0/',
    redactions: [{ x: 0.5, y: 0.58, width: 0.25, height: 0.17 }],
  },
  {
    vehicleId: 'veh-lagos-mercedes-g63-amg',
    sourceUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/72/Mercedes-AMG_G_63_%28W463A%29.jpg/1280px-Mercedes-AMG_G_63_%28W463A%29.jpg',
    sourcePageUrl: 'https://commons.wikimedia.org/wiki/File:Mercedes-AMG_G_63_(W463A).jpg',
    author: 'Tokumeigakarinoaoshima',
    license: 'CC0',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    redactions: [
      { x: 0.31, y: 0.2, width: 0.22, height: 0.14 },
      { x: 0.84, y: 0.72, width: 0.13, height: 0.15 },
    ],
  },
  {
    vehicleId: 'veh-lagos-mercedes-s580-saloon',
    sourceUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a4/Mercedes-Benz_S-Klasse_%28W223%29_S_580_4MATIC_%282023%29_%2853491181527%29.jpg/1280px-Mercedes-Benz_S-Klasse_%28W223%29_S_580_4MATIC_%282023%29_%2853491181527%29.jpg',
    sourcePageUrl: 'https://commons.wikimedia.org/wiki/File:Mercedes-Benz_S-Klasse_(W223)_S_580_4MATIC_(2023)_(53491181527).jpg',
    author: 'Charles from Port Chester, New York',
    license: 'CC BY 2.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/2.0/',
    redactions: [{ x: 0.19, y: 0.49, width: 0.16, height: 0.13 }],
  },
  {
    vehicleId: 'veh-lagos-mercedes-vclass-jet',
    sourceUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8b/Mercedes-Benz_V-Class_%28W447%2C_2023%29_DSC_7977.jpg/1280px-Mercedes-Benz_V-Class_%28W447%2C_2023%29_DSC_7977.jpg',
    sourcePageUrl: 'https://commons.wikimedia.org/wiki/File:Mercedes-Benz_V-Class_(W447,_2023)_DSC_7977.jpg',
    author: 'Alexander Migl',
    license: 'CC BY-SA 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    redactions: [{ x: 0.82, y: 0.65, width: 0.11, height: 0.12 }],
  },
  {
    vehicleId: 'veh-lagos-prado-150-txl-graphite',
    sourceUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9e/2022_Toyota_Land_Cruiser_Prado_150_4.0_VX_V6_in_Gray_Metallic%2C_06-12-2024.jpg/1280px-2022_Toyota_Land_Cruiser_Prado_150_4.0_VX_V6_in_Gray_Metallic%2C_06-12-2024.jpg',
    sourcePageUrl: 'https://commons.wikimedia.org/wiki/File:2022_Toyota_Land_Cruiser_Prado_150_4.0_VX_V6_in_Gray_Metallic,_06-12-2024.jpg',
    author: 'Ethan Llamas',
    license: 'CC BY-SA 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    redactions: [{ x: 0.23, y: 0.58, width: 0.24, height: 0.14 }],
  },
  {
    vehicleId: 'veh-lagos-prado-150-vx-pearl',
    sourceUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/00/Toyota_Land_Cruiser_Prado_150.jpg/1280px-Toyota_Land_Cruiser_Prado_150.jpg',
    sourcePageUrl: 'https://commons.wikimedia.org/wiki/File:Toyota_Land_Cruiser_Prado_150.jpg',
    author: 'TTTNIS',
    license: 'CC0',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    redactions: [{ x: 0.61, y: 0.53, width: 0.13, height: 0.14 }],
  },
  {
    vehicleId: 'veh-lagos-prado-250-first-edition',
    sourceUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/da/Toyota_Land_Cruiser_Prado_TJA250_2.4_Turbo_White_Pearl_Mica.jpg/1280px-Toyota_Land_Cruiser_Prado_TJA250_2.4_Turbo_White_Pearl_Mica.jpg',
    sourcePageUrl: 'https://commons.wikimedia.org/wiki/File:Toyota_Land_Cruiser_Prado_TJA250_2.4_Turbo_White_Pearl_Mica.jpg',
    author: 'Ethan Llamas',
    license: 'CC BY-SA 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    redactions: [{ x: 0.65, y: 0.66, width: 0.16, height: 0.13 }],
  },
];

function firebaseToken() {
  const configPath = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json');
  return JSON.parse(readFileSync(configPath, 'utf8')).tokens.access_token;
}

function headers(extra = {}) {
  return { Authorization: `Bearer ${firebaseToken()}`, ...extra };
}

function firebaseMediaUrl(objectPath) {
  return `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(BUCKET)}/o/${encodeURIComponent(objectPath)}?alt=media`;
}

function asFirestore(value) {
  if (value === null) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'number') return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(asFirestore) } };
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, asFirestore(nested)])) } };
}

async function expectOk(response, operation) {
  if (response.ok) return response;
  throw new Error(`${operation} failed (${response.status}): ${await response.text()}`);
}

async function fetchVehicle(vehicleId) {
  const response = await expectOk(
    await fetch(`${FIRESTORE_BASE}/vehicles/${vehicleId}`, { headers: headers() }),
    `Read vehicle ${vehicleId}`,
  );
  const json = await response.json();
  const ownerId = json.fields?.ownerId?.stringValue;
  if (!ownerId) throw new Error(`Vehicle ${vehicleId} has no ownerId.`);
  return ownerId;
}

async function fetchSource(sourceUrl) {
  const response = await expectOk(
    await fetch(sourceUrl, { headers: { 'User-Agent': 'MMGConcierge/vehicle-image-seed' } }),
    `Download ${sourceUrl}`,
  );
  return Buffer.from(await response.arrayBuffer());
}

async function renderVariant(source, maxEdge, redactions) {
  let rendered = await sharp(source)
    .rotate()
    .resize({ width: maxEdge, height: maxEdge, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 82, progressive: true, mozjpeg: true })
    .toBuffer();

  const metadata = await sharp(rendered).metadata();
  const width = metadata.width;
  const height = metadata.height;
  if (!width || !height) throw new Error('Image processor returned no dimensions.');

  for (const redaction of redactions) {
    const left = Math.max(0, Math.min(width - 1, Math.floor(width * redaction.x)));
    const top = Math.max(0, Math.min(height - 1, Math.floor(height * redaction.y)));
    const regionWidth = Math.max(1, Math.min(width - left, Math.ceil(width * redaction.width)));
    const regionHeight = Math.max(1, Math.min(height - top, Math.ceil(height * redaction.height)));
    const blurred = await sharp(rendered)
      .extract({ left, top, width: regionWidth, height: regionHeight })
      .blur(22)
      .toBuffer();
    rendered = await sharp(rendered).composite([{ input: blurred, left, top }]).jpeg({ quality: 82, progressive: true, mozjpeg: true }).toBuffer();
  }

  const finalMetadata = await sharp(rendered).metadata();
  return { bytes: rendered, width: finalMetadata.width, height: finalMetadata.height };
}

async function uploadObject(objectPath, bytes, cacheControl) {
  const url = `${STORAGE_UPLOAD_BASE}/o?uploadType=media&name=${encodeURIComponent(objectPath)}`;
  await expectOk(
    await fetch(url, {
      method: 'POST',
      headers: headers({ 'Content-Type': 'image/jpeg', 'Cache-Control': cacheControl }),
      body: bytes,
    }),
    `Upload ${objectPath}`,
  );
}

async function writeDocument(documentPath, fields, updateMask = []) {
  const params = new URLSearchParams();
  for (const field of updateMask) params.append('updateMask.fieldPaths', field);
  const suffix = params.size ? `?${params}` : '';
  await expectOk(
    await fetch(`${FIRESTORE_BASE}/${documentPath}${suffix}`, {
      method: 'PATCH',
      headers: headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ fields: Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, asFirestore(value)])) }),
    }),
    `Write ${documentPath}`,
  );
}

async function seedVehicle(item) {
  const ownerId = await fetchVehicle(item.vehicleId);
  const source = await fetchSource(item.sourceUrl);
  const sourceMetadata = await sharp(source).metadata();
  const processedAt = new Date();
  const variants = {};
  const privateVariantPaths = {};
  const publicVariantPaths = {};

  for (const [variant, maxEdge] of Object.entries({ thumb: 320, card: 800, detail: 1600 })) {
    const output = await renderVariant(source, maxEdge, item.redactions);
    const privatePath = `private/vehicle-uploads/${ownerId}/${item.vehicleId}/${IMAGE_ID}/variants/${variant}`;
    const publicPath = `public/vehicles/${item.vehicleId}/approved/${IMAGE_ID}/${variant}`;
    await uploadObject(privatePath, output.bytes, 'private, max-age=0, no-transform');
    await uploadObject(publicPath, output.bytes, 'public, max-age=31536000, immutable');
    variants[variant] = {
      path: privatePath,
      width: output.width,
      height: output.height,
      byteSize: output.bytes.length,
      contentType: 'image/jpeg',
    };
    privateVariantPaths[variant] = privatePath;
    publicVariantPaths[variant] = publicPath;
  }

  const imageRecord = {
    imageId: IMAGE_ID,
    vehicleId: item.vehicleId,
    ownerId,
    order: 0,
    status: 'approved',
    width: sourceMetadata.width ?? 0,
    height: sourceMetadata.height ?? 0,
    originalUploadId: `seed-wikimedia-${item.vehicleId}`,
    variantPaths: privateVariantPaths,
    publicVariantPaths,
    processing: {
      sourceFormat: sourceMetadata.format === 'png' || sourceMetadata.format === 'webp' ? sourceMetadata.format : 'jpeg',
      sourceByteSize: source.length,
      sourceHadExif: Boolean(sourceMetadata.exif?.length),
      sourceGps: sourceMetadata.exif?.length ? 'unknown' : 'absent',
      metadataStripped: true,
      variants,
    },
    promotedAt: processedAt,
    createdAt: processedAt,
    updatedAt: processedAt,
  };

  await writeDocument(`vehicles/${item.vehicleId}/images/${IMAGE_ID}`, imageRecord);
  const primaryImageUrl = firebaseMediaUrl(publicVariantPaths.card);
  await writeDocument(
    `vehicles/${item.vehicleId}`,
    { imageUrls: [primaryImageUrl], primaryImageUrl, updatedAt: processedAt },
    ['imageUrls', 'primaryImageUrl', 'updatedAt'],
  );
  await writeDocument(`vehicleMediaSources/${item.vehicleId}`, {
    vehicleId: item.vehicleId,
    imageId: IMAGE_ID,
    importedAt: processedAt,
    source: {
      provider: 'Wikimedia Commons',
      sourceUrl: item.sourceUrl,
      sourcePageUrl: item.sourcePageUrl,
      author: item.author,
      license: item.license,
      licenseUrl: item.licenseUrl,
      derivedImageMetadataStripped: true,
      licensePlateRegionsRedacted: item.redactions.length,
    },
  });
  console.log(`Seeded ${item.vehicleId} → ${primaryImageUrl}`);
}

const requestedVehicleIds = process.argv.slice(2);
const selectedVehicles = requestedVehicleIds.length === 0
  ? vehicles
  : vehicles.filter((vehicle) => requestedVehicleIds.includes(vehicle.vehicleId));

if (selectedVehicles.length !== (requestedVehicleIds.length || vehicles.length)) {
  throw new Error(`Unknown seed vehicle ID: ${requestedVehicleIds.join(', ')}`);
}

for (const vehicle of selectedVehicles) {
  await seedVehicle(vehicle);
}
