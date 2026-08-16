import { MAX_IMAGE_EDGE, MIN_IMAGE_HEIGHT, MIN_IMAGE_WIDTH, VEHICLE_IMAGE_VARIANTS } from '@mmg/contracts';
import { describe, expect, it } from 'vitest';

import {
  assertUsableSourceImage,
  detectGpsInExif,
  findJpegMetadataMarkers,
  fitWithin,
  PRIMARY_IMAGE_VARIANT,
  privateVariantPath,
  privateVariantPaths,
  publicVariantPath,
  resolvePrimaryImagePath,
  sourceUploadPath,
  VEHICLE_VARIANT_SPECS,
  variantSpecFor,
  type InspectedImage,
} from './image-processing.js';

const clean: InspectedImage = {
  format: 'jpeg',
  width: 4000,
  height: 3000,
  hasExif: false,
  gps: 'absent',
};

describe('fitWithin', () => {
  it('scales the longest edge down to the ceiling and preserves aspect ratio', () => {
    expect(fitWithin(4000, 3000, 800)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(3000, 4000, 800)).toEqual({ width: 600, height: 800 });
  });

  it('never enlarges a source smaller than the ceiling', () => {
    // A 1280×720 upload must stay 1280×720 in the `detail` variant, not be
    // stretched to 1600 and lose sharpness for no reason.
    expect(fitWithin(1280, 720, 1600)).toEqual({ width: 1280, height: 720 });
  });

  it('keeps an extreme aspect ratio at least one pixel tall', () => {
    // 10000×3 at a 320 ceiling rounds the short edge to 0 without the clamp,
    // and a zero-height resize is a decoder error rather than a small image.
    expect(fitWithin(10_000, 3, 320)).toEqual({ width: 320, height: 1 });
  });

  it('rejects non-positive dimensions instead of producing NaN', () => {
    expect(() => fitWithin(0, 100, 320)).toThrow(TypeError);
    expect(() => fitWithin(100, -1, 320)).toThrow(TypeError);
  });
});

describe('VEHICLE_VARIANT_SPECS', () => {
  it('covers exactly the contract variant ladder', () => {
    expect(VEHICLE_VARIANT_SPECS.map((spec) => spec.variant)).toEqual([...VEHICLE_IMAGE_VARIANTS]);
  });

  it('increases monotonically so no variant is larger than a later one', () => {
    const edges = VEHICLE_VARIANT_SPECS.map((spec) => spec.maxEdge);
    expect([...edges].sort((a, b) => a - b)).toEqual(edges);
  });

  it('never upscales, even for the smallest source the contract accepts', () => {
    // `detail`'s 1600px ceiling is larger than the 1280px minimum source width
    // on purpose — it is a ceiling for big uploads, not a target. The guarantee
    // that matters is that a variant is never larger than the image it came
    // from, which `fitWithin` provides rather than the ceiling itself.
    for (const spec of VEHICLE_VARIANT_SPECS) {
      const fitted = fitWithin(MIN_IMAGE_WIDTH, MIN_IMAGE_HEIGHT, spec.maxEdge);
      expect(fitted.width, `${spec.variant} upscales width`).toBeLessThanOrEqual(MIN_IMAGE_WIDTH);
      expect(fitted.height, `${spec.variant} upscales height`).toBeLessThanOrEqual(MIN_IMAGE_HEIGHT);
    }
  });

  it('keeps the largest variant well below the maximum accepted edge', () => {
    // No original bytes are ever served: the biggest thing a renter receives is
    // `detail`, which must be a genuine downscale of a large upload.
    const largest = Math.max(...VEHICLE_VARIANT_SPECS.map((spec) => spec.maxEdge));
    expect(largest).toBeLessThan(MAX_IMAGE_EDGE);
  });

  it('resolves a spec by name and fails loudly for an unknown variant', () => {
    expect(variantSpecFor(PRIMARY_IMAGE_VARIANT).variant).toBe('card');
    expect(() => variantSpecFor('poster' as never)).toThrow('No variant spec');
  });
});

describe('assertUsableSourceImage', () => {
  it('accepts an image inside both bounds', () => {
    expect(() => assertUsableSourceImage(clean)).not.toThrow();
    expect(() =>
      assertUsableSourceImage({ ...clean, width: MIN_IMAGE_WIDTH, height: MIN_IMAGE_HEIGHT }),
    ).not.toThrow();
  });

  it('rejects an undersized image with a reason the owner can act on', () => {
    expect(() =>
      assertUsableSourceImage({ ...clean, width: MIN_IMAGE_WIDTH - 1, height: MIN_IMAGE_HEIGHT }),
    ).toThrowError(expect.objectContaining({
      code: 'INVALID_ARGUMENT',
      safeDetails: { reason: 'image_dimensions' },
    }));
  });

  it('rejects an oversized edge', () => {
    expect(() =>
      assertUsableSourceImage({ ...clean, width: MAX_IMAGE_EDGE + 1, height: 3000 }),
    ).toThrowError(expect.objectContaining({
      safeDetails: { reason: 'image_dimensions' },
    }));
  });

  it('names the actual dimensions so the owner knows what to fix', () => {
    let message = '';
    try {
      assertUsableSourceImage({ ...clean, width: 640, height: 480 });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain('640×480');
    expect(message).toContain(`${MIN_IMAGE_WIDTH}×${MIN_IMAGE_HEIGHT}`);
  });
});

describe('storage path builders', () => {
  it('builds the source path the client-writable storage rule allows', () => {
    // Must match `private/vehicle-uploads/{ownerId}/{vehicleId}/{uploadId}` in
    // firebase/storage.rules exactly, or the owner's upload lands where nothing
    // can read it.
    expect(sourceUploadPath('owner-1', 'veh-01', 'up-9')).toBe(
      'private/vehicle-uploads/owner-1/veh-01/up-9',
    );
  });

  it('nests processed variants deeper than any client-writable rule', () => {
    const path = privateVariantPath('owner-1', 'veh-01', 'img-9', 'card');
    expect(path).toBe('private/vehicle-uploads/owner-1/veh-01/img-9/variants/card');

    // Five segments past the prefix. The storage rule matches a single
    // {uploadId} segment, so this depth falls through to the catch-all deny and
    // a client cannot overwrite a processed variant.
    const relative = path.replace('private/vehicle-uploads/', '').split('/');
    expect(relative).toHaveLength(5);
  });

  it('builds the only world-readable path shape in the bucket', () => {
    expect(publicVariantPath('veh-01', 'img-9', 'thumb')).toBe(
      'public/vehicles/veh-01/approved/img-9/thumb',
    );
  });

  it('produces a path for every variant with no collisions', () => {
    const paths = privateVariantPaths('owner-1', 'veh-01', 'img-9');
    expect(Object.keys(paths).sort()).toEqual([...VEHICLE_IMAGE_VARIANTS].sort());
    expect(new Set(Object.values(paths)).size).toBe(VEHICLE_IMAGE_VARIANTS.length);
  });
});

describe('resolvePrimaryImagePath', () => {
  const withOrder = (imageId: string, order: number) => ({
    imageId,
    order,
    variantPaths: { card: `card/${imageId}` },
  });

  it('picks the lowest order', () => {
    expect(
      resolvePrimaryImagePath([withOrder('b', 2), withOrder('a', 0), withOrder('c', 1)]),
    ).toBe('card/a');
  });

  it('breaks an order tie deterministically by imageId', () => {
    // `order` is client-supplied and two images can claim slot 0. Without the
    // tiebreak the primary would follow Firestore's iteration order and could
    // change between reads of the same data.
    const forward = resolvePrimaryImagePath([withOrder('zeta', 0), withOrder('alpha', 0)]);
    const reversed = resolvePrimaryImagePath([withOrder('alpha', 0), withOrder('zeta', 0)]);
    expect(forward).toBe('card/alpha');
    expect(reversed).toBe(forward);
  });

  it('ignores images with no primary-variant path', () => {
    expect(
      resolvePrimaryImagePath([
        { imageId: 'broken', order: 0, variantPaths: { thumb: 'thumb/broken' } },
        withOrder('good', 5),
      ]),
    ).toBe('card/good');
  });

  it('returns null rather than a path to nothing', () => {
    expect(resolvePrimaryImagePath([])).toBeNull();
    expect(
      resolvePrimaryImagePath([{ imageId: 'x', order: 0, variantPaths: {} }]),
    ).toBeNull();
  });
});

// ── EXIF / GPS ──

/**
 * Builds a little-endian TIFF block with the given IFD0 tags. Lets the GPS
 * detector be tested against real byte layouts instead of a mock.
 */
function tiffBlock(options: {
  tags: Array<{ tag: number; valueOrOffset: number }>;
  gpsIfdEntryCount?: number;
  gpsIfdOffset?: number;
}): Buffer {
  const { tags, gpsIfdEntryCount, gpsIfdOffset = 200 } = options;
  const buffer = Buffer.alloc(300);
  buffer.write('II', 0, 'ascii');
  buffer.writeUInt16LE(42, 2);
  buffer.writeUInt32LE(8, 4); // IFD0 at offset 8

  buffer.writeUInt16LE(tags.length, 8);
  tags.forEach((entry, index) => {
    const at = 8 + 2 + index * 12;
    buffer.writeUInt16LE(entry.tag, at);
    buffer.writeUInt16LE(4, at + 2); // type LONG
    buffer.writeUInt32LE(1, at + 4); // count
    buffer.writeUInt32LE(entry.valueOrOffset, at + 8);
  });

  if (gpsIfdEntryCount !== undefined) {
    buffer.writeUInt16LE(gpsIfdEntryCount, gpsIfdOffset);
  }

  return buffer;
}

describe('detectGpsInExif', () => {
  it('reports absent when there is no EXIF block at all', () => {
    expect(detectGpsInExif(undefined)).toBe('absent');
    expect(detectGpsInExif(Buffer.alloc(0))).toBe('absent');
  });

  it('reports present for a populated GPS IFD', () => {
    const exif = tiffBlock({
      tags: [{ tag: 0x88_25, valueOrOffset: 200 }],
      gpsIfdEntryCount: 4,
    });
    expect(detectGpsInExif(exif)).toBe('present');
  });

  it('reports absent for EXIF with no GPS pointer', () => {
    // Tag 0x010f is Make — ordinary camera metadata, no location.
    expect(detectGpsInExif(tiffBlock({ tags: [{ tag: 0x01_0f, valueOrOffset: 100 }] }))).toBe(
      'absent',
    );
  });

  it('reports absent for a GPS pointer to an empty IFD', () => {
    // Some encoders leave the pointer behind after stripping the coordinates.
    const exif = tiffBlock({
      tags: [{ tag: 0x88_25, valueOrOffset: 200 }],
      gpsIfdEntryCount: 0,
    });
    expect(detectGpsInExif(exif)).toBe('absent');
  });

  it('accepts the JPEG APP1 "Exif\\0\\0" prefix as well as a bare TIFF header', () => {
    const tiff = tiffBlock({ tags: [{ tag: 0x88_25, valueOrOffset: 200 }], gpsIfdEntryCount: 2 });
    const prefixed = Buffer.concat([Buffer.from('Exif\0\0', 'ascii'), tiff]);
    expect(detectGpsInExif(prefixed)).toBe('present');
  });

  it('parses big-endian ("MM") blocks', () => {
    const buffer = Buffer.alloc(300);
    buffer.write('MM', 0, 'ascii');
    buffer.writeUInt16BE(42, 2);
    buffer.writeUInt32BE(8, 4);
    buffer.writeUInt16BE(1, 8);
    buffer.writeUInt16BE(0x88_25, 10);
    buffer.writeUInt16BE(4, 12);
    buffer.writeUInt32BE(1, 14);
    buffer.writeUInt32BE(200, 18);
    buffer.writeUInt16BE(3, 200);
    expect(detectGpsInExif(buffer)).toBe('present');
  });

  it('reports unknown — never absent — for a block it cannot parse', () => {
    // This is the important case. A false `absent` would record "no location
    // data" in the audit trail for a photo that may well carry coordinates.
    expect(detectGpsInExif(Buffer.from('not exif at all'))).toBe('unknown');
    expect(detectGpsInExif(Buffer.from([0x49, 0x49]))).toBe('unknown');

    const badMagic = tiffBlock({ tags: [] });
    badMagic.writeUInt16LE(43, 2);
    expect(detectGpsInExif(badMagic)).toBe('unknown');
  });

  it('reports unknown when the IFD is truncated past the end of the block', () => {
    const truncated = tiffBlock({ tags: [{ tag: 0x88_25, valueOrOffset: 200 }] }).subarray(0, 40);
    truncated.writeUInt16LE(500, 8); // claims 500 entries in 40 bytes
    expect(detectGpsInExif(truncated)).toBe('unknown');
  });

  it('reports unknown when the GPS pointer targets memory outside the block', () => {
    const exif = tiffBlock({ tags: [{ tag: 0x88_25, valueOrOffset: 999_999 }] });
    expect(detectGpsInExif(exif)).toBe('unknown');
  });
});

describe('findJpegMetadataMarkers', () => {
  /** Assembles a JPEG header from marker/payload pairs, then SOS + EOI. */
  function jpeg(segments: Array<{ marker: number; payload: Buffer }>): Buffer {
    const parts: Buffer[] = [Buffer.from([0xff, 0xd8])];
    for (const segment of segments) {
      const header = Buffer.alloc(4);
      header.writeUInt8(0xff, 0);
      header.writeUInt8(segment.marker, 1);
      header.writeUInt16BE(segment.payload.length + 2, 2);
      parts.push(header, segment.payload);
    }
    parts.push(Buffer.from([0xff, 0xda, 0x00, 0x02]), Buffer.from([0xff, 0xd9]));
    return Buffer.concat(parts);
  }

  it('finds nothing in a JPEG carrying only a quantisation table', () => {
    expect(findJpegMetadataMarkers(jpeg([{ marker: 0xdb, payload: Buffer.alloc(64) }]))).toEqual([]);
  });

  it('finds an EXIF APP1 segment', () => {
    const exif = jpeg([{ marker: 0xe1, payload: Buffer.from('Exif\0\0II*\0', 'ascii') }]);
    expect(findJpegMetadataMarkers(exif)).toEqual(['APP1']);
  });

  it('finds JFIF, ICC, and comment segments alongside EXIF', () => {
    const markers = findJpegMetadataMarkers(
      jpeg([
        { marker: 0xe0, payload: Buffer.from('JFIF\0', 'ascii') },
        { marker: 0xe1, payload: Buffer.from('Exif\0\0', 'ascii') },
        { marker: 0xe2, payload: Buffer.from('ICC_PROFILE\0', 'ascii') },
        { marker: 0xfe, payload: Buffer.from('shot at home', 'ascii') },
      ]),
    );
    expect(markers).toEqual(['APP0', 'APP1', 'APP2', 'COM']);
  });

  it('stops at SOS so entropy-coded scan data cannot fake a marker', () => {
    // 0xFFE1 appearing inside compressed pixel data is a coincidence, not an
    // EXIF segment. Scanning past SOS would report it as one.
    const base = jpeg([{ marker: 0xdb, payload: Buffer.alloc(4) }]);
    const withScanData = Buffer.concat([
      base.subarray(0, base.length - 2),
      Buffer.from([0xff, 0xe1, 0x00, 0x10, 0x45, 0x78]),
      Buffer.from([0xff, 0xd9]),
    ]);
    expect(findJpegMetadataMarkers(withScanData)).toEqual([]);
  });

  it('rejects bytes that are not a JPEG', () => {
    expect(() => findJpegMetadataMarkers(Buffer.from([0x89, 0x50, 0x4e, 0x47]))).toThrow(TypeError);
    expect(() => findJpegMetadataMarkers(Buffer.alloc(2))).toThrow(TypeError);
  });
});
