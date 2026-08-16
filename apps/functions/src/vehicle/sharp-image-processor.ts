import { CommandError, MAX_IMAGE_EDGE } from '@mmg/contracts';
import sharp, { type Metadata, type OutputInfo, type Sharp } from 'sharp';

import {
  detectGpsInExif,
  fitWithin,
  type ImageProcessor,
  type InspectedImage,
  type RenderedVariant,
  type SupportedImageFormat,
  type VariantSpec,
} from './image-processing.js';

/**
 * The production `ImageProcessor`. The only place in the codebase that decodes
 * owner-supplied image bytes.
 *
 * Two guarantees the rest of the pipeline depends on:
 *
 * - **Reported dimensions are measured, orientation-corrected pixels.** sharp's
 *   `metadata()` reports stored dimensions, which are transposed relative to
 *   what a viewer sees whenever EXIF orientation is 5–8. Recording those
 *   unswapped would put a portrait photo in the database as landscape.
 * - **Rendered variants carry no metadata.** sharp drops all metadata unless
 *   `withMetadata()` is called, so the strip is achieved by *not* calling it.
 *   That is an easy line to add back by accident, which is why
 *   `findJpegMetadataMarkers` asserts the output independently in the tests.
 */

/** JPEG quality for rendered variants. */
const VARIANT_JPEG_QUALITY = 82;

/**
 * Hard decode ceiling. Without this, a small file declaring an enormous canvas
 * (a decompression bomb) is allocated before any dimension check can reject it.
 * Set from the contract's edge limit, so the decoder refuses anything the
 * validator would refuse anyway.
 */
const MAX_INPUT_PIXELS = MAX_IMAGE_EDGE * MAX_IMAGE_EDGE;

/**
 * One libvips worker thread per invocation. Cloud Functions instances are
 * memory-capped and sharp's default thread pool sizes itself to the host's CPU
 * count, which multiplies peak usage on a machine we do not control.
 */
sharp.concurrency(1);

/** MIME allowlist mirrored from `storage.rules`. Notably excludes SVG. */
const SUPPORTED_FORMATS: Readonly<Record<string, SupportedImageFormat>> = {
  jpeg: 'jpeg',
  jpg: 'jpeg',
  png: 'png',
  webp: 'webp',
};

function openImage(bytes: Buffer): Sharp {
  return sharp(bytes, {
    limitInputPixels: MAX_INPUT_PIXELS,
    sequentialRead: true,
    // sharp's default (`'warning'`) rejects images that merely warn. Phone
    // cameras produce those routinely, and refusing an otherwise-valid photo is
    // a worse outcome than tolerating a recoverable one.
    failOn: 'error',
  });
}

function rejectUndecodable(cause: unknown): never {
  const error = new CommandError(
    'INVALID_ARGUMENT',
    'That image could not be read. Re-export it as a JPEG or PNG and try again.',
    { reason: 'upload_invalid' },
  );
  // Native `cause`, deliberately not `safeDetails` — `index.ts` spreads
  // `safeDetails` into the HttpsError sent to the client, and libvips error
  // strings carry internal paths and decoder internals.
  error.cause = cause;
  throw error;
}

export class SharpImageProcessor implements ImageProcessor {
  async inspect(bytes: Buffer): Promise<InspectedImage> {
    let metadata: Metadata;
    try {
      metadata = await openImage(bytes).metadata();
    } catch (cause) {
      rejectUndecodable(cause);
    }

    const format = metadata.format ? SUPPORTED_FORMATS[metadata.format] : undefined;
    if (!format) {
      throw new CommandError(
        'INVALID_ARGUMENT',
        'Listing photos must be JPEG, PNG, or WebP.',
        { reason: 'upload_invalid' },
      );
    }

    if (
      typeof metadata.width !== 'number' ||
      typeof metadata.height !== 'number' ||
      metadata.width <= 0 ||
      metadata.height <= 0
    ) {
      rejectUndecodable(new Error('Decoder reported no usable dimensions.'));
    }

    // EXIF orientation 5–8 are the transposing ones (90°/270° rotations).
    const transposed = typeof metadata.orientation === 'number' && metadata.orientation >= 5;

    return {
      format,
      width: transposed ? metadata.height : metadata.width,
      height: transposed ? metadata.width : metadata.height,
      hasExif: Boolean(metadata.exif && metadata.exif.length > 0),
      gps: detectGpsInExif(metadata.exif),
    };
  }

  async render(bytes: Buffer, spec: VariantSpec): Promise<RenderedVariant> {
    const inspected = await this.inspect(bytes);
    const target = fitWithin(inspected.width, inspected.height, spec.maxEdge);

    let output: { data: Buffer; info: OutputInfo };
    try {
      output = await openImage(bytes)
        // Bakes EXIF orientation into the pixels. Required, because the
        // orientation tag itself is discarded along with the rest of the
        // metadata — without this, sideways photos would ship sideways.
        .rotate()
        .resize({
          width: target.width,
          height: target.height,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .jpeg({ quality: VARIANT_JPEG_QUALITY, progressive: true, mozjpeg: true })
        // No `withMetadata()`. That omission is the EXIF/GPS strip.
        .toBuffer({ resolveWithObject: true });
    } catch (cause) {
      rejectUndecodable(cause);
    }

    return {
      variant: spec.variant,
      bytes: output.data,
      // From the encoder, not the request: these are the dimensions of the
      // bytes actually written.
      width: output.info.width,
      height: output.info.height,
      byteSize: output.data.byteLength,
      contentType: 'image/jpeg',
    };
  }
}
