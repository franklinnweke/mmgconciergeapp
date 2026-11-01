import { WebError } from "./model";
export const CONSENT_VERSION = "website-newsletter-v1";
export const CONSENT_TEXT =
  "I’d like occasional emails about new vehicles and MMG Concierge services.";
export type Subscriber = {
  id: string;
  email: string;
  source: "website-footer";
  consentVersion: string;
  consentText: string;
  createdAt: string;
  emailVerified: false;
};
export function normalizeEmail(value: unknown): string {
  const email = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (
    email.length > 254 ||
    !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(
      email,
    ) ||
    email.split("@")[0].length > 64
  )
    throw new WebError("Enter a valid email address.");
  return email;
}
export function subscriberCsv(items: Subscriber[]) {
  const cell = (value: string) =>
    `"${(/^[=+\-@\t\r]/.test(value) ? "'" : "") + value.replaceAll('"', '""')}"`;
  return items
    .map(
      (item) =>
        [
          item.email,
          item.createdAt,
          item.source,
          item.consentVersion,
          item.consentText,
          "No",
        ]
          .map(cell)
          .join(",") + "\r\n",
    )
    .join("");
}
export const CSV_HEADER =
  "Email,Signup time (UTC),Source,Consent version,Consent wording,Email verified\r\n";
export function requireSubscriberId(id: unknown): asserts id is string {
  if (typeof id !== "string" || !/^[a-f0-9]{64}$/.test(id))
    throw new WebError("Refresh the subscriber list before continuing.");
}
export async function readNewsletterBody(request: Request) {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new WebError("Invalid request.", 415);
  const reader = request.body?.getReader();
  if (!reader) throw new WebError("Invalid request.");
  const pieces: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 2048) {
      await reader.cancel();
      throw new WebError("Request too large.", 413);
    }
    pieces.push(value);
  }
  return JSON.parse(Buffer.concat(pieces).toString("utf8")) as Record<
    string,
    unknown
  >;
}
