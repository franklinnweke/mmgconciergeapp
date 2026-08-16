import { beforeAll, describe, expect, it } from 'vitest';

import { findJpegMetadataMarkers, variantSpecFor } from './image-processing.js';
import { SharpImageProcessor } from './sharp-image-processor.js';

/**
 * Adapter tests for the real decoder. These are the exit-gate evidence that
 * EXIF/GPS removal and true-dimension reporting actually happen — every other
 * suite in the vehicle folder injects a fake processor and so proves nothing
 * about libvips.
 *
 * Fixtures are generated with sharp itself rather than committed as binaries, so
 * the suite has no opaque test data and stays readable.
 */

const processor = new SharpImageProcessor();

/** Little-endian TIFF/EXIF block carrying a populated GPS IFD. */
function exifWithGps(): Buffer {
  const buffer = Buffer.alloc(256);
  buffer.write('II', 0, 'ascii');
  buffer.writeUInt16LE(42, 2);
  buffer.writeUInt32LE(8, 4);

  // IFD0: Make, plus a GPSInfo pointer at offset 120.
  buffer.writeUInt16LE(2, 8);
  buffer.writeUInt16LE(0x01_0f, 10); // Make
  buffer.writeUInt16LE(2, 12); // ASCII
  buffer.writeUInt32LE(6, 14);
  buffer.writeUInt32LE(90, 18);
  buffer.writeUInt16LE(0x88_25, 22); // GPSInfo
  buffer.writeUInt16LE(4, 24); // LONG
  buffer.writeUInt32LE(1, 26);
  buffer.writeUInt32LE(120, 30);
  buffer.writeUInt32LE(0, 34); // no next IFD
  buffer.write('Apple\0', 90, 'ascii');

  // GPS IFD: one tag (GPSLatitudeRef = 'N').
  buffer.writeUInt16LE(1, 120);
  buffer.writeUInt16LE(0x00_01, 122);
  buffer.writeUInt16LE(2, 124);
  buffer.writeUInt32LE(2, 126);
  buffer.write('N\0', 130, 'ascii');
  buffer.writeUInt32LE(0, 134);

  return buffer;
}

let sharp: typeof import('sharp').default;

beforeAll(async () => {
  ({ default: sharp } = await import('sharp'));
});

/** A plain landscape JPEG with no metadata beyond what the encoder needs. */
async function plainJpeg(width = 4000, height = 3000): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 12, g: 40, b: 80 } },
  })
    .jpeg()
    .toBuffer();
}

describe('SharpImageProcessor.inspect', () => {
  it('reports the true decoded dimensions and format', async () => {
    const inspected = await processor.inspect(await plainJpeg(2400, 1350));
    expect(inspected).toMatchObject({ format: 'jpeg', width: 2400, height: 1350 });
  });

  it('recognises PNG and WebP sources', async () => {
    const png = await sharp({
      create: { width: 1600, height: 900, channels: 3, background: '#123456' },
    })
      .png()
      .toBuffer();
    expect(await processor.inspect(png)).toMatchObject({ format: 'png', width: 1600, height: 900 });

    const webp = await sharp({
      create: { width: 1600, height: 900, channels: 3, background: '#123456' },
    })
      .webp()
      .toBuffer();
    expect(await processor.inspect(webp)).toMatchObject({
      format: 'webp',
      width: 1600,
      height: 900,
    });
  });

  it('reports orientation-corrected dimensions for a rotated photo', async () => {
    // A portrait phone photo is commonly stored as landscape pixels plus an
    // orientation tag. sharp's metadata() reports the stored dimensions, so
    // recording those unswapped would put this in the database as 4000×3000.
    const rotated = await sharp({
      create: { width: 4000, height: 3000, channels: 3, background: '#222' },
    })
      // `withMetadata({ orientation })` is the API that actually writes the
      // tag — `withExifMerge({ IFD0: { Orientation } })` is normalised to 1.
      .withMetadata({ orientation: 6 })
      .jpeg()
      .toBuffer();

    const inspected = await processor.inspect(rotated);
    expect(inspected.width).toBe(3000);
    expect(inspected.height).toBe(4000);
  });

  it('detects GPS coordinates in the source', async () => {
    const withGps = await sharp({
      create: { width: 1600, height: 900, channels: 3, background: '#333' },
    })
      .withMetadata({ exif: {} })
      .jpeg()
      .toBuffer();

    // Splice a real GPS-bearing EXIF block in as an APP1 segment, since sharp's
    // own EXIF writer does not emit a GPS IFD.
    const exif = Buffer.concat([Buffer.from('Exif\0\0', 'ascii'), exifWithGps()]);
    const app1 = Buffer.alloc(4);
    app1.writeUInt8(0xff, 0);
    app1.writeUInt8(0xe1, 1);
    app1.writeUInt16BE(exif.length + 2, 2);
    const spliced = Buffer.concat([
      withGps.subarray(0, 2),
      app1,
      exif,
      withGps.subarray(2),
    ]);

    const inspected = await processor.inspect(spliced);
    expect(inspected.hasExif).toBe(true);
    expect(inspected.gps).toBe('present');
  });

  it('reports no GPS for an image that carries none', async () => {
    expect((await processor.inspect(await plainJpeg(1600, 900))).gps).toBe('absent');
  });

  it('rejects a non-image with a client-safe reason and no decoder internals', async () => {
    await expect(processor.inspect(Buffer.from('this is not an image'))).rejects.toMatchObject({
      code: 'INVALID_ARGUMENT',
      safeDetails: { reason: 'upload_invalid' },
    });

    // The libvips message must not reach the client via safeDetails.
    const error = await processor.inspect(Buffer.from('nope')).catch((caught: unknown) => caught);
    expect(Object.keys((error as { safeDetails: object }).safeDetails)).toEqual(['reason']);
  });

  it('rejects an SVG, which the MIME allowlist excludes', async () => {
    // SVG is XML and can carry script and external references. libvips will
    // happily rasterise it, so the format allowlist is the only thing stopping
    // it from becoming a listing photo.
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="2000" height="1200"><rect width="100%" height="100%" fill="red"/></svg>',
    );
    await expect(processor.inspect(svg)).rejects.toMatchObject({
      code: 'INVALID_ARGUMENT',
      safeDetails: { reason: 'upload_invalid' },
    });
  });
});

describe('SharpImageProcessor.render', () => {
  it('produces a JPEG at the variant ceiling with the aspect ratio preserved', async () => {
    const source = await plainJpeg(4000, 3000);

    const card = await processor.render(source, variantSpecFor('card'));
    expect(card).toMatchObject({ variant: 'card', contentType: 'image/jpeg', width: 800, height: 600 });
    expect(card.byteSize).toBe(card.bytes.byteLength);
    expect(card.byteSize).toBeGreaterThan(0);

    const thumb = await processor.render(source, variantSpecFor('thumb'));
    expect(thumb).toMatchObject({ width: 320, height: 240 });
    expect(thumb.byteSize).toBeLessThan(card.byteSize);
  });

  it('strips every metadata segment from the output', async () => {
    // The strip is achieved by *not* calling sharp's withMetadata(). This asserts
    // the result independently of that implementation detail: a bare JPEG with no
    // APPn and no COM segments.
    const withMetadata = await sharp({
      create: { width: 3000, height: 2000, channels: 3, background: '#654321' },
    })
      .withExifMerge({ IFD0: { Make: 'Apple', Model: 'iPhone 15 Pro' } })
      .withMetadata({ density: 300 })
      .jpeg()
      .toBuffer();

    expect(findJpegMetadataMarkers(withMetadata).length).toBeGreaterThan(0);
    expect((await processor.inspect(withMetadata)).hasExif).toBe(true);

    for (const variant of ['thumb', 'card', 'detail'] as const) {
      const rendered = await processor.render(withMetadata, variantSpecFor(variant));
      expect(findJpegMetadataMarkers(rendered.bytes), `${variant} retained metadata`).toEqual([]);
      // Belt and braces: the decoder must also see no EXIF on re-read.
      expect((await processor.inspect(rendered.bytes)).hasExif, `${variant} retained EXIF`).toBe(
        false,
      );
    }
  });

  it('removes GPS coordinates from the output', async () => {
    const base = await plainJpeg(2000, 1500);
    const exif = Buffer.concat([Buffer.from('Exif\0\0', 'ascii'), exifWithGps()]);
    const app1 = Buffer.alloc(4);
    app1.writeUInt8(0xff, 0);
    app1.writeUInt8(0xe1, 1);
    app1.writeUInt16BE(exif.length + 2, 2);
    const located = Buffer.concat([base.subarray(0, 2), app1, exif, base.subarray(2)]);

    expect((await processor.inspect(located)).gps).toBe('present');

    const rendered = await processor.render(located, variantSpecFor('detail'));
    expect(findJpegMetadataMarkers(rendered.bytes)).toEqual([]);
    expect((await processor.inspect(rendered.bytes)).gps).toBe('absent');
  });

  it('bakes EXIF orientation into the pixels rather than losing it with the tag', async () => {
    // Discarding metadata discards the orientation tag too. Without .rotate()
    // the variant would render sideways for every phone photo.
    const rotated = await sharp({
      create: { width: 4000, height: 2000, channels: 3, background: '#0a0a0a' },
    })
      .withMetadata({ orientation: 6 })
      .jpeg()
      .toBuffer();

    const rendered = await processor.render(rotated, variantSpecFor('card'));
    // Source presents as 2000×4000 once oriented, so `card` caps the long edge.
    expect(rendered.height).toBe(800);
    expect(rendered.width).toBe(400);
    expect(findJpegMetadataMarkers(rendered.bytes)).toEqual([]);
  });

  it('converts PNG and WebP sources to JPEG variants', async () => {
    for (const encode of ['png', 'webp'] as const) {
      const source = await sharp({
        create: { width: 2000, height: 1200, channels: 3, background: '#abcdef' },
      })
        [encode]()
        .toBuffer();

      const rendered = await processor.render(source, variantSpecFor('card'));
      expect(rendered.contentType).toBe('image/jpeg');
      expect((await processor.inspect(rendered.bytes)).format).toBe('jpeg');
      expect(rendered).toMatchObject({ width: 800, height: 480 });
    }
  });

  it('does not enlarge a source smaller than the variant ceiling', async () => {
    const small = await plainJpeg(1280, 720);
    const detail = await processor.render(small, variantSpecFor('detail'));
    expect(detail).toMatchObject({ width: 1280, height: 720 });
  });
});
