#!/usr/bin/env node

/**
 * MMG Concierge — Development Sample Fleet Seeding Script
 *
 * Seeds four deterministic demo vehicles in mmg-concierge-dev:
 *  - demo-toyota-prado-1 (Toyota Land Cruiser Prado - Ikoyi)
 *  - demo-toyota-prado-2 (Toyota Land Cruiser Prado - Victoria Island)
 *  - demo-toyota-prado-3 (Toyota Land Cruiser Prado - Lekki Phase 1)
 *  - demo-mercedes-amg-suv (Mercedes-AMG SUV - Ikoyi)
 *
 * SAFETY INVARIANT: Strictly locked to mmg-concierge-dev. Never touches production.
 */

import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';

const PROJECT_ID = 'mmg-concierge-dev';
const BUCKET = 'mmg-concierge-dev.firebasestorage.app';

if (PROJECT_ID !== 'mmg-concierge-dev' || BUCKET !== 'mmg-concierge-dev.firebasestorage.app') {
  throw new Error('FATAL: This script is only permitted to run against mmg-concierge-dev.');
}

const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const STORAGE_UPLOAD_BASE = `https://storage.googleapis.com/upload/storage/v1/b/${BUCKET}`;
const SEED_TIMESTAMP = new Date();
const SEED_TIMESTAMP_ISO = SEED_TIMESTAMP.toISOString();

function getFirebaseToken() {
  const configPath = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json');
  return JSON.parse(readFileSync(configPath, 'utf8')).tokens.access_token;
}

function headers(extra = {}) {
  return {
    Authorization: `Bearer ${getFirebaseToken()}`,
    ...extra,
  };
}

function firebaseMediaUrl(objectPath) {
  return `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(BUCKET)}/o/${encodeURIComponent(objectPath)}?alt=media`;
}

function asFirestore(value) {
  if (value === null) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'number') {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (typeof value === 'boolean') return { booleanValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(asFirestore) } };
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  return {
    mapValue: {
      fields: Object.fromEntries(
        Object.entries(value).map(([key, nested]) => [key, asFirestore(nested)]),
      ),
    },
  };
}

async function expectOk(response, operation) {
  if (response.ok) return response;
  const text = await response.text();
  throw new Error(`${operation} failed (${response.status}): ${text}`);
}

async function writeDocument(documentPath, fields, updateMask = []) {
  const params = new URLSearchParams();
  for (const field of updateMask) params.append('updateMask.fieldPaths', field);
  const suffix = params.size ? `?${params}` : '';
  await expectOk(
    await fetch(`${FIRESTORE_BASE}/${documentPath}${suffix}`, {
      method: 'PATCH',
      headers: headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        fields: Object.fromEntries(
          Object.entries(fields).map(([key, value]) => [key, asFirestore(value)]),
        ),
      }),
    }),
    `Write ${documentPath}`,
  );
}

async function fetchSource(sourceUrl) {
  await new Promise((resolve) => setTimeout(resolve, 1000));
  const response = await expectOk(
    await fetch(sourceUrl, {
      headers: {
        'User-Agent': 'MMGConciergeSeed/1.0 (https://mmgconcierge.com; dev@mmgconcierge.com)',
      },
    }),
    `Download ${sourceUrl}`,
  );
  return Buffer.from(await response.arrayBuffer());
}

async function renderVariant(source, maxEdge, redactions = []) {
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
    rendered = await sharp(rendered)
      .composite([{ input: blurred, left, top }])
      .jpeg({ quality: 82, progressive: true, mozjpeg: true })
      .toBuffer();
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

// ── Target vehicles definition ──

const VEHICLES = [
  {
    vehicleId: 'demo-toyota-prado-1',
    displayName: '2024 Toyota Land Cruiser Prado 250 TX-L',
    make: 'Toyota',
    model: 'Land Cruiser Prado',
    year: 2024,
    colour: 'Attitude Black Mica',
    category: 'executive_suv',
    seats: 7,
    transmission: 'automatic',
    fuelType: 'petrol',
    mileageKm: 14200,
    description:
      'A commanding 2024 Land Cruiser Prado 250 in deep Attitude Black Mica, delivering modern luxury, quiet road presence, and three-row comfort across Lagos. Chauffeur and vehicle delivery are included with every MMG booking.',
    features: ['leather', 'apple_carplay', 'android_auto', 'climate_control', 'third_row', 'privacy_glass'],
    ownerDailyRateKobo: 19500000,
    areaLabel: 'Ikoyi',
    approxLatitude: 6.4549,
    approxLongitude: 3.4340,
    images: [
      {
        imageId: 'front',
        order: 0,
        sourceUrl:
          'https://upload.wikimedia.org/wikipedia/commons/8/88/Toyota_Land_Cruiser_Prado_TJA250_2.4_Turbo_Black_Mica_-_front.jpg',
        sourcePageUrl:
          'https://commons.wikimedia.org/wiki/File:Toyota_Land_Cruiser_Prado_TJA250_2.4_Turbo_Black_Mica_-_front.jpg',
        author: 'Tokumeigakarinoaoshima',
        license: 'CC0',
        redactions: [{ x: 0.65, y: 0.65, width: 0.16, height: 0.14 }],
      },
      {
        imageId: 'interior',
        order: 1,
        sourceUrl:
          'https://upload.wikimedia.org/wikipedia/commons/2/2a/The_interior_of_Toyota_LAND_CRUISER_PRADO_DIESEL_TX_L_Package_5-Seater_%283DA-GDJ150W-GGTEY%29.jpg',
        sourcePageUrl:
          'https://commons.wikimedia.org/wiki/File:The_interior_of_Toyota_LAND_CRUISER_PRADO_DIESEL_TX_L_Package_5-Seater_(3DA-GDJ150W-GGTEY).jpg',
        author: 'Tokumeigakarinoaoshima',
        license: 'CC0',
        redactions: [],
      },
      {
        imageId: 'rear',
        order: 2,
        sourceUrl:
          'https://upload.wikimedia.org/wikipedia/commons/2/22/Toyota_Land_Cruiser_Prado_TJA250_2.4_Turbo_Black_Mica_01.jpg',
        sourcePageUrl:
          'https://commons.wikimedia.org/wiki/File:Toyota_Land_Cruiser_Prado_TJA250_2.4_Turbo_Black_Mica_01.jpg',
        author: 'Tokumeigakarinoaoshima',
        license: 'CC0',
        redactions: [{ x: 0.64, y: 0.64, width: 0.17, height: 0.14 }],
      },
    ],
  },
  {
    vehicleId: 'demo-toyota-prado-2',
    displayName: '2023 Toyota Land Cruiser Prado 150 VX',
    make: 'Toyota',
    model: 'Land Cruiser Prado',
    year: 2023,
    colour: 'White Pearl Crystal Shine',
    category: 'executive_suv',
    seats: 7,
    transmission: 'automatic',
    fuelType: 'petrol',
    mileageKm: 26800,
    description:
      'An immaculate White Pearl Land Cruiser Prado 150 VX offering elevated ride height, generous cabin refinement, and effortless executive travel across Victoria Island and the islands. Chauffeur and delivery are included.',
    features: ['leather', 'panoramic_roof', 'apple_carplay', 'climate_control', 'third_row', 'privacy_glass'],
    ownerDailyRateKobo: 18000000,
    areaLabel: 'Victoria Island',
    approxLatitude: 6.4281,
    approxLongitude: 3.4219,
    images: [
      {
        imageId: 'front',
        order: 0,
        sourceUrl: 'https://upload.wikimedia.org/wikipedia/commons/0/00/Toyota_Land_Cruiser_Prado_150.jpg',
        sourcePageUrl: 'https://commons.wikimedia.org/wiki/File:Toyota_Land_Cruiser_Prado_150.jpg',
        author: 'TTTNIS',
        license: 'CC0',
        redactions: [{ x: 0.61, y: 0.53, width: 0.13, height: 0.14 }],
      },
      {
        imageId: 'interior',
        order: 1,
        sourceUrl:
          'https://upload.wikimedia.org/wikipedia/commons/3/38/Toyota_Land_Cruiser_Prado_150_interior.jpg',
        sourcePageUrl: 'https://commons.wikimedia.org/wiki/File:Toyota_Land_Cruiser_Prado_150_interior.jpg',
        author: 'Tokumeigakarinoaoshima',
        license: 'CC0',
        redactions: [],
      },
      {
        imageId: 'rear',
        order: 2,
        sourceUrl:
          'https://upload.wikimedia.org/wikipedia/commons/a/a5/Toyota_LAND_CRUISER_PRADO_TX_%28CBA-TRJ150W-GKTEK%29_rear.jpg',
        sourcePageUrl:
          'https://commons.wikimedia.org/wiki/File:Toyota_LAND_CRUISER_PRADO_TX_(CBA-TRJ150W-GKTEK)_rear.jpg',
        author: 'Tokumeigakarinoaoshima',
        license: 'CC0',
        redactions: [{ x: 0.5, y: 0.6, width: 0.16, height: 0.14 }],
      },
    ],
  },
  {
    vehicleId: 'demo-toyota-prado-3',
    displayName: '2022 Toyota Land Cruiser Prado 150 4.0 VX V6',
    make: 'Toyota',
    model: 'Land Cruiser Prado',
    year: 2022,
    colour: 'Graphite Metallic',
    category: 'executive_suv',
    seats: 7,
    transmission: 'automatic',
    fuelType: 'petrol',
    mileageKm: 38500,
    description:
      'A refined V6 executive Prado in sleek Graphite Metallic, combining robust Lagos all-terrain readiness with premium interior quietude and versatile seating. Dedicated chauffeur and vehicle delivery are included.',
    features: ['leather', 'climate_control', 'third_row', 'privacy_glass', 'apple_carplay'],
    ownerDailyRateKobo: 16500000,
    areaLabel: 'Lekki Phase 1',
    approxLatitude: 6.4478,
    approxLongitude: 3.4723,
    images: [
      {
        imageId: 'front',
        order: 0,
        sourceUrl:
          'https://upload.wikimedia.org/wikipedia/commons/9/9e/2022_Toyota_Land_Cruiser_Prado_150_4.0_VX_V6_in_Gray_Metallic%2C_06-12-2024.jpg',
        sourcePageUrl:
          'https://commons.wikimedia.org/wiki/File:2022_Toyota_Land_Cruiser_Prado_150_4.0_VX_V6_in_Gray_Metallic,_06-12-2024.jpg',
        author: 'Ethan Llamas',
        license: 'CC BY-SA 4.0',
        redactions: [{ x: 0.23, y: 0.58, width: 0.24, height: 0.14 }],
      },
      {
        imageId: 'interior',
        order: 1,
        sourceUrl:
          'https://upload.wikimedia.org/wikipedia/commons/d/d1/Toyota_LAND_CRUISER_PRADO_TX%22L_Package%22_%28LDA-GDJ150W-GKTEY%29_interior.jpg',
        sourcePageUrl:
          'https://commons.wikimedia.org/wiki/File:Toyota_LAND_CRUISER_PRADO_TX%22L_Package%22_(LDA-GDJ150W-GKTEY)_interior.jpg',
        author: 'Tokumeigakarinoaoshima',
        license: 'CC0',
        redactions: [],
      },
      {
        imageId: 'rear',
        order: 2,
        sourceUrl:
          'https://upload.wikimedia.org/wikipedia/commons/5/58/Toyota_land_cruiser_prado_2017_rear.jpg',
        sourcePageUrl: 'https://commons.wikimedia.org/wiki/File:Toyota_land_cruiser_prado_2017_rear.jpg',
        author: 'Charles from Port Chester',
        license: 'CC BY 2.0',
        redactions: [{ x: 0.44, y: 0.65, width: 0.18, height: 0.14 }],
      },
    ],
  },
  {
    vehicleId: 'demo-mercedes-amg-suv',
    displayName: '2023 Mercedes-AMG G 63',
    make: 'Mercedes-AMG',
    model: 'G 63',
    year: 2023,
    colour: 'Obsidian Black Metallic',
    category: 'executive_suv',
    seats: 5,
    transmission: 'automatic',
    fuelType: 'petrol',
    mileageKm: 19800,
    description:
      'The iconic Mercedes-AMG G 63 flagship SUV, combining hand-crafted AMG performance, prestigious road authority, and handcrafted leather appointments for high-level Lagos executive movement. Chauffeur and delivery are included.',
    features: ['leather', 'panoramic_roof', 'apple_carplay', 'climate_control', 'privacy_glass', 'wifi'],
    ownerDailyRateKobo: 42000000,
    areaLabel: 'Ikoyi',
    approxLatitude: 6.4549,
    approxLongitude: 3.4340,
    images: [
      {
        imageId: 'front',
        order: 0,
        sourceUrl:
          'https://upload.wikimedia.org/wikipedia/commons/7/72/Mercedes-AMG_G_63_%28W463A%29.jpg',
        sourcePageUrl: 'https://commons.wikimedia.org/wiki/File:Mercedes-AMG_G_63_(W463A).jpg',
        author: 'Tokumeigakarinoaoshima',
        license: 'CC0',
        redactions: [
          { x: 0.31, y: 0.2, width: 0.22, height: 0.14 },
          { x: 0.84, y: 0.72, width: 0.13, height: 0.15 },
        ],
      },
      {
        imageId: 'interior',
        order: 1,
        sourceUrl:
          'https://upload.wikimedia.org/wikipedia/commons/3/36/Mercedes-AMG_G_63_%28W463A%29_interior.jpg',
        sourcePageUrl:
          'https://commons.wikimedia.org/wiki/File:Mercedes-AMG_G_63_(W463A)_interior.jpg',
        author: 'Tokumeigakarinoaoshima',
        license: 'CC0',
        redactions: [],
      },
      {
        imageId: 'rear',
        order: 2,
        sourceUrl:
          'https://upload.wikimedia.org/wikipedia/commons/b/b6/Mercedes-AMG_G_63_%28W463A%29_rear.jpg',
        sourcePageUrl: 'https://commons.wikimedia.org/wiki/File:Mercedes-AMG_G_63_(W463A)_rear.jpg',
        author: 'Tokumeigakarinoaoshima',
        license: 'CC0',
        redactions: [{ x: 0.45, y: 0.65, width: 0.16, height: 0.14 }],
      },
    ],
  },
];

async function main() {
  console.log('=== MMG CONCIERGE DEVELOPMENT FLEET SEED ===');
  console.log('Target Project:', PROJECT_ID);
  console.log('Target Storage Bucket:', BUCKET);

  // 1. Resolve owner UID
  const usersRes = await expectOk(
    await fetch(`${FIRESTORE_BASE}/users?pageSize=50`, { headers: headers() }),
    'Read users collection',
  );
  const usersData = await usersRes.json();
  const ownerDoc = usersData.documents?.find(
    (doc) => doc.fields?.accountType?.stringValue === 'owner',
  );

  if (!ownerDoc) {
    throw new Error('No existing owner user found in users collection in mmg-concierge-dev.');
  }

  const ownerId = ownerDoc.name.split('/').pop();
  const ownerName = ownerDoc.fields.displayName?.stringValue || 'Franklin Nweke';
  console.log(`Resolved approved owner UID: ${ownerId} (${ownerName})`);

  // 2. Ensure ownerProfile exists and is approved
  const profileRecord = {
    ownerId,
    legalName: ownerName,
    displayName: ownerName,
    address: {
      line1: '16A Bourdillon Road, Ikoyi',
      city: 'Lagos',
      country: 'NG',
      areaLabel: 'Ikoyi',
    },
    verificationStatus: 'approved',
    verificationUpdatedAt: SEED_TIMESTAMP_ISO,
    lastDecisionReason: null,
    ownerTermsVersion: '2026.1',
    commissionTermsVersion: '2026.1',
    privacyNoticeVersion: '2026.1',
    termsAcceptedAt: SEED_TIMESTAMP_ISO,
    governmentId: null,
    createdAt: ownerDoc.fields.createdAt?.timestampValue || SEED_TIMESTAMP_ISO,
    updatedAt: SEED_TIMESTAMP_ISO,
    version: 1,
  };

  await writeDocument(`ownerProfiles/${ownerId}`, profileRecord);
  console.log(`Verified ownerProfiles/${ownerId} in approved state.`);

  // 3. Clean up any legacy demo vehicle records
  const legacyIds = [
    'demo-range-rover-vogue',
    'demo-mercedes-gle450',
    'demo-lexus-lx570',
    'demo-mercedes-s580',
  ];

  for (const legacyId of legacyIds) {
    const checkRes = await fetch(`${FIRESTORE_BASE}/vehicles/${legacyId}`, { headers: headers() });
    if (checkRes.ok) {
      await writeDocument(
        `vehicles/${legacyId}`,
        {
          discoverable: false,
          visibility: 'archived',
          moderationStatus: 'rejected',
          updatedAt: SEED_TIMESTAMP_ISO,
        },
        ['discoverable', 'visibility', 'moderationStatus', 'updatedAt'],
      );
      console.log(`Cleaned up legacy vehicle: ${legacyId} (set discoverable=false, archived).`);
    }
  }

  // 4. Seed the four deterministic vehicles
  for (const item of VEHICLES) {
    console.log(`\n--- Seeding vehicle: ${item.vehicleId} (${item.displayName}) ---`);
    const imageUrls = [];
    const publicImagePaths = [];

    for (const img of item.images) {
      console.log(`  Downloading image [${img.imageId}] from ${img.sourceUrl}...`);
      const sourceBytes = await fetchSource(img.sourceUrl);
      const sourceMetadata = await sharp(sourceBytes).metadata();

      const variants = {};
      const privateVariantPaths = {};
      const publicVariantPaths = {};

      for (const [variant, maxEdge] of Object.entries({ thumb: 320, card: 800, detail: 1600 })) {
        const output = await renderVariant(sourceBytes, maxEdge, img.redactions);
        const privatePath = `private/vehicle-uploads/${ownerId}/${item.vehicleId}/${img.imageId}/variants/${variant}`;
        const publicPath = `public/vehicles/${item.vehicleId}/approved/${img.imageId}/${variant}`;

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
        imageId: img.imageId,
        vehicleId: item.vehicleId,
        ownerId,
        order: img.order,
        status: 'approved',
        width: variants.detail.width,
        height: variants.detail.height,
        originalUploadId: `seed-${item.vehicleId}-${img.imageId}`,
        variantPaths: privateVariantPaths,
        publicVariantPaths,
        processing: {
          sourceFormat:
            sourceMetadata.format === 'png' || sourceMetadata.format === 'webp'
              ? sourceMetadata.format
              : 'jpeg',
          sourceByteSize: sourceBytes.length,
          sourceHadExif: Boolean(sourceMetadata.exif?.length),
          sourceGps: sourceMetadata.exif?.length ? 'unknown' : 'absent',
          metadataStripped: true,
          variants,
        },
        promotedAt: SEED_TIMESTAMP_ISO,
        createdAt: SEED_TIMESTAMP_ISO,
        updatedAt: SEED_TIMESTAMP_ISO,
      };

      await writeDocument(`vehicles/${item.vehicleId}/images/${img.imageId}`, imageRecord);
      const cardMediaUrl = firebaseMediaUrl(publicVariantPaths.card);
      imageUrls.push(cardMediaUrl);
      publicImagePaths.push(publicVariantPaths.card);

      await writeDocument(`vehicleMediaSources/${item.vehicleId}-${img.imageId}`, {
        vehicleId: item.vehicleId,
        imageId: img.imageId,
        importedAt: SEED_TIMESTAMP_ISO,
        source: {
          provider: 'Wikimedia Commons',
          sourceUrl: img.sourceUrl,
          sourcePageUrl: img.sourcePageUrl,
          author: img.author,
          license: img.license,
          derivedImageMetadataStripped: true,
          licensePlateRegionsRedacted: img.redactions.length,
        },
      });

      console.log(`    Uploaded and recorded [${img.imageId}] -> ${publicVariantPaths.card}`);
    }

    const primaryImageUrl = imageUrls[0];
    const vehicleRecord = {
      vehicleId: item.vehicleId,
      ownerId,
      displayName: item.displayName,
      make: item.make,
      model: item.model,
      year: item.year,
      colour: item.colour,
      category: item.category,
      seats: item.seats,
      transmission: item.transmission,
      fuelType: item.fuelType,
      mileageKm: item.mileageKm,
      description: item.description,
      features: item.features,
      ownerDailyRateKobo: item.ownerDailyRateKobo,
      chauffeurPolicy: 'included',
      deliveryPolicy: 'included',
      areaLabel: item.areaLabel,
      approxLatitude: item.approxLatitude,
      approxLongitude: item.approxLongitude,
      moderationStatus: 'approved',
      visibility: 'active',
      discoverable: true,
      lastDecisionReason: null,
      pendingRevisionId: null,
      imageCount: item.images.length,
      primaryImagePath: publicImagePaths[0],
      imageUrls,
      primaryImageUrl,
      createdAt: SEED_TIMESTAMP_ISO,
      updatedAt: SEED_TIMESTAMP_ISO,
      version: 1,
    };

    await writeDocument(`vehicles/${item.vehicleId}`, vehicleRecord);
    console.log(`  Successfully seeded vehicle document: vehicles/${item.vehicleId}`);
  }

  console.log('\n=== SEEDING COMPLETE ===');
}

main().catch((err) => {
  console.error('Fatal error during seed:', err);
  process.exit(1);
});
