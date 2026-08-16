import {
  CommandError,
  MAX_IMAGE_EDGE,
  MIN_IMAGE_HEIGHT,
  MIN_IMAGE_WIDTH,
  VEHICLE_IMAGE_VARIANTS,
  type VehicleImageVariant,
} from '@mmg/contracts';

/**
 * Vehicle listing image processing — the trusted boundary.
 *
 * Storage rules are the first gate (path shape, owner match, declared MIME,
 * size). This module is the authoritative one: it decodes the bytes, reports
 * the true dimensions, strips EXIF, and produces the display variants. Nothing
 * downstream may claim an image is processed unless this has run.
 *
 * The `ImageProcessor` port exists so services stay injectable unit tests.
 * `sharp-image-processor.ts` is the only production implementation.
 */

export type SupportedImageFormat = 'jpeg' | 'png' | 'webp';

/** Measured facts about a source upload. Never derived from client input. */
export type InspectedImage = {
  format: SupportedImageFormat;
  /** Orientation-corrected pixel width — what a viewer actually sees. */
  width: number;
  /** Orientation-corrected pixel height. */
  height: number;
  /** True when the source carried any EXIF/IFD block. */
  hasExif: boolean;
  /**
   * Whether the source carried GPS coordinates.
   *
   * Tri-state on purpose. Reporting `absent` for an EXIF block we failed to
   * parse would be a false all-clear in an audit record, and the whole point of
   * the field is the privacy trail.
   */
  gps: GpsPresence;
};

export type GpsPresence = 'present' | 'absent' | 'unknown';

export type VariantSpec = {
  variant: VehicleImageVariant;
  /** Longest-edge ceiling. Smaller sources are never enlarged. */
  maxEdge: number;
};

export type RenderedVariant = {
  variant: VehicleImageVariant;
  bytes: Buffer;
  width: number;
  height: number;
  byteSize: number;
  contentType: 'image/jpeg';
};

export interface ImageProcessor {
  /** Decodes enough of the image to report its true, orientation-corrected size. */
  inspect(bytes: Buffer): Promise<InspectedImage>;
  /** Re-encodes to the variant size with all metadata discarded. */
  render(bytes: Buffer, spec: VariantSpec): Promise<RenderedVariant>;
}

/**
 * Variant ladder. `detail` is the largest thing a renter ever receives, so it
 * doubles as the privacy ceiling: no original bytes are ever served.
 */
export const VEHICLE_VARIANT_SPECS: readonly VariantSpec[] = [
  { variant: 'thumb', maxEdge: 320 },
  { variant: 'card', maxEdge: 800 },
  { variant: 'detail', maxEdge: 1600 },
];

/** The variant a card/list surface should show, and the vehicle's primary path. */
export const PRIMARY_IMAGE_VARIANT: VehicleImageVariant = 'card';

export function variantSpecFor(variant: VehicleImageVariant): VariantSpec {
  const spec = VEHICLE_VARIANT_SPECS.find((candidate) => candidate.variant === variant);
  if (!spec) {
    throw new Error(`No variant spec defined for '${variant}'.`);
  }
  return spec;
}

/**
 * Target size for a variant, preserving aspect ratio and never upscaling.
 * Pure, so the expected output can be asserted without decoding anything.
 */
export function fitWithin(
  width: number,
  height: number,
  maxEdge: number,
): { width: number; height: number } {
  if (width <= 0 || height <= 0) {
    throw new TypeError('Image dimensions must be positive.');
  }
  const longest = Math.max(width, height);
  if (longest <= maxEdge) {
    return { width, height };
  }
  const scale = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * Rejects a source image that cannot make an honest listing photo.
 *
 * Undersized images are the common case — a screenshot or a WhatsApp-compressed
 * forward — and the owner can fix it by re-shooting, so the reason is distinct
 * from a corrupt upload.
 */
export function assertUsableSourceImage(inspected: InspectedImage): void {
  if (inspected.width < MIN_IMAGE_WIDTH || inspected.height < MIN_IMAGE_HEIGHT) {
    throw new CommandError(
      'INVALID_ARGUMENT',
      `Listing photos must be at least ${MIN_IMAGE_WIDTH}×${MIN_IMAGE_HEIGHT} pixels. This one is ${inspected.width}×${inspected.height}.`,
      { reason: 'image_dimensions' },
    );
  }

  if (inspected.width > MAX_IMAGE_EDGE || inspected.height > MAX_IMAGE_EDGE) {
    throw new CommandError(
      'INVALID_ARGUMENT',
      `Listing photos must be no larger than ${MAX_IMAGE_EDGE} pixels on any edge.`,
      { reason: 'image_dimensions' },
    );
  }
}

// ── Storage path builders ──
//
// Centralised so finalize and public promotion cannot drift. The private shapes
// deliberately sit deeper than the client-writable rule in `storage.rules`
// (`private/vehicle-uploads/{ownerId}/{vehicleId}/{uploadId}`), so a client
// cannot write or overwrite a processed variant — those paths fall through to
// the catch-all deny.

export function sourceUploadPath(ownerId: string, vehicleId: string, uploadId: string): string {
  return `private/vehicle-uploads/${ownerId}/${vehicleId}/${uploadId}`;
}

export function privateVariantPath(
  ownerId: string,
  vehicleId: string,
  imageId: string,
  variant: VehicleImageVariant,
): string {
  return `private/vehicle-uploads/${ownerId}/${vehicleId}/${imageId}/variants/${variant}`;
}

/**
 * Public destination. Must match the `public/vehicles/{vehicleId}/approved/{imageId}/{variant}`
 * rule in `storage.rules` exactly — that rule is the only world-readable prefix
 * in the bucket, and only approved images are ever copied into it.
 */
export function publicVariantPath(
  vehicleId: string,
  imageId: string,
  variant: VehicleImageVariant,
): string {
  return `public/vehicles/${vehicleId}/approved/${imageId}/${variant}`;
}

export function privateVariantPaths(
  ownerId: string,
  vehicleId: string,
  imageId: string,
): Record<VehicleImageVariant, string> {
  return Object.fromEntries(
    VEHICLE_IMAGE_VARIANTS.map((variant) => [
      variant,
      privateVariantPath(ownerId, vehicleId, imageId, variant),
    ]),
  ) as Record<VehicleImageVariant, string>;
}

export function publicVariantPaths(
  vehicleId: string,
  imageId: string,
): Record<VehicleImageVariant, string> {
  return Object.fromEntries(
    VEHICLE_IMAGE_VARIANTS.map((variant) => [
      variant,
      publicVariantPath(vehicleId, imageId, variant),
    ]),
  ) as Record<VehicleImageVariant, string>;
}

// ── EXIF / GPS detection ──
//
// Pure TIFF and JPEG walkers. They exist so the privacy claim is *verifiable*:
// `detectGpsInExif` tells the audit trail what the owner's upload actually
// carried, and `findJpegMetadataMarkers` proves the bytes we publish carry
// nothing — without either fact being taken on the encoder's word.

const TIFF_GPS_IFD_POINTER_TAG = 0x88_25;
const TIFF_MAGIC = 42;

/**
 * Looks for a populated GPS IFD inside a raw EXIF block.
 *
 * Returns `'unknown'` rather than `'absent'` whenever the block is truncated or
 * malformed. A camera that writes coordinates and a parser that gives up look
 * identical from the outside, and only one of them is safe to record as clean.
 */
export function detectGpsInExif(exif: Buffer | undefined): GpsPresence {
  if (!exif || exif.length === 0) {
    return 'absent';
  }

  // sharp hands back the TIFF header directly, but some producers keep the
  // JPEG APP1 `Exif\0\0` prefix. Accept both.
  const tiff = exif.subarray(
    exif.length >= 6 && exif.toString('ascii', 0, 4) === 'Exif' ? 6 : 0,
  );
  if (tiff.length < 8) {
    return 'unknown';
  }

  const byteOrder = tiff.toString('ascii', 0, 2);
  const littleEndian = byteOrder === 'II';
  if (!littleEndian && byteOrder !== 'MM') {
    return 'unknown';
  }

  const readU16 = (offset: number): number =>
    littleEndian ? tiff.readUInt16LE(offset) : tiff.readUInt16BE(offset);
  const readU32 = (offset: number): number =>
    littleEndian ? tiff.readUInt32LE(offset) : tiff.readUInt32BE(offset);

  try {
    if (readU16(2) !== TIFF_MAGIC) {
      return 'unknown';
    }

    const ifd0Offset = readU32(4);
    if (ifd0Offset + 2 > tiff.length) {
      return 'unknown';
    }

    const entryCount = readU16(ifd0Offset);
    const entriesEnd = ifd0Offset + 2 + entryCount * 12;
    if (entriesEnd > tiff.length) {
      return 'unknown';
    }

    for (let index = 0; index < entryCount; index += 1) {
      const entry = ifd0Offset + 2 + index * 12;
      if (readU16(entry) !== TIFF_GPS_IFD_POINTER_TAG) {
        continue;
      }

      // A pointer alone is not coordinates — some encoders leave an empty GPS
      // IFD behind. Follow it and require at least one tag.
      const gpsOffset = readU32(entry + 8);
      if (gpsOffset + 2 > tiff.length) {
        return 'unknown';
      }
      return readU16(gpsOffset) > 0 ? 'present' : 'absent';
    }

    return 'absent';
  } catch {
    // Any out-of-range read means the block is not what it claims to be.
    return 'unknown';
  }
}

/**
 * Every metadata-bearing marker in a JPEG: `APPn` (EXIF, XMP, ICC, Photoshop/IPTC)
 * and `COM`. An empty result is the proof that a rendered variant carries no
 * embedded location, device, or comment data.
 *
 * Walks only the header segments and stops at `SOS`, since entropy-coded scan
 * data is not marker-structured and would produce false positives.
 */
export function findJpegMetadataMarkers(bytes: Buffer): readonly string[] {
  if (bytes.length < 4 || bytes.readUInt16BE(0) !== 0xff_d8) {
    throw new TypeError('Not a JPEG: missing SOI marker.');
  }

  const markers: string[] = [];
  let offset = 2;

  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) {
      break;
    }

    const marker = bytes[offset + 1]!;
    // SOS begins scan data; EOI ends the file. Standalone markers carry no length.
    if (marker === 0xda || marker === 0xd9) {
      break;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }

    const segmentLength = bytes.readUInt16BE(offset + 2);
    if (segmentLength < 2) {
      break;
    }

    if (marker >= 0xe0 && marker <= 0xef) {
      markers.push(`APP${marker - 0xe0}`);
    } else if (marker === 0xfe) {
      markers.push('COM');
    }

    offset += 2 + segmentLength;
  }

  return markers;
}

// ── Deterministic primary ordering ──

export type OrderedImage = {
  imageId: string;
  order: number;
  variantPaths: Record<string, string>;
};

/**
 * Picks the vehicle's primary image: lowest `order`, then lowest `imageId`.
 *
 * The tiebreak matters. `order` is client-supplied and two images can claim the
 * same slot, so without it the primary would depend on Firestore's document
 * iteration and could silently change between reads. Returns null when no
 * candidate has a usable path, so the caller records "no primary" rather than a
 * path to an object that was never written.
 */
export function resolvePrimaryImagePath(images: readonly OrderedImage[]): string | null {
  const candidates = images
    .filter((image) => typeof image.variantPaths[PRIMARY_IMAGE_VARIANT] === 'string')
    .sort((a, b) => (a.order - b.order) || a.imageId.localeCompare(b.imageId));

  return candidates[0]?.variantPaths[PRIMARY_IMAGE_VARIANT] ?? null;
}
