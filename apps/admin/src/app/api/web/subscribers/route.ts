import { NextResponse } from "next/server";
import { checkSameOrigin } from "../../../../features/auth/server/same-origin";
import { WebError } from "../../../../features/web/model";
import {
  CSV_HEADER,
  readNewsletterBody,
  subscriberCsv,
} from "../../../../features/web/newsletter";
import {
  listSubscribers,
  newsletterStaffSession,
  removeSubscriber,
} from "../../../../features/web/server/newsletter";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const reply = (body: unknown, status = 200) =>
  NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
function failure(error: unknown) {
  if (error instanceof WebError)
    return reply({ error: error.message }, error.status);
  if (error instanceof SyntaxError)
    return reply({ error: "Invalid request." }, 400);
  return reply(
    { error: "The subscriber list is temporarily unavailable." },
    503,
  );
}
export async function GET(request: Request) {
  try {
    await newsletterStaffSession();
    const url = new URL(request.url);
    return reply(
      await listSubscribers(
        url.searchParams.get("cursor") || "",
        url.searchParams.get("email") || "",
      ),
    );
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: Request) {
  try {
    const staff = await newsletterStaffSession();
    if (!checkSameOrigin(request.headers).allowed)
      throw new WebError("Request origin could not be verified.", 403);
    const body = await readNewsletterBody(request);
    if (body.action === "remove") {
      await removeSubscriber(body.id, staff.uid);
      return reply({ success: true });
    }
    if (body.action !== "export")
      throw new WebError("Invalid subscriber action.");
    // Fetch all batches before responding: an incomplete export must never appear successful.
    const parts = [CSV_HEADER];
    let cursor = "";
    let count = 0;
    do {
      const page = await listSubscribers(cursor, "", 500);
      count += page.items.length;
      if (count > 10000)
        throw new WebError(
          "This list is too large for a single export. Contact your website administrator.",
          413,
        );
      parts.push(subscriberCsv(page.items));
      cursor = page.nextCursor || "";
    } while (cursor);
    return new Response("\uFEFF" + parts.join(""), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition":
          'attachment; filename="mmg-newsletter-subscribers.csv"',
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return failure(error);
  }
}
