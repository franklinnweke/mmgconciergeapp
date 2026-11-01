import { NextResponse } from "next/server";
import { WebError } from "../../../../features/web/model";
import { readNewsletterBody } from "../../../../features/web/newsletter";
import {
  authorizeNewsletterGateway,
  collectSubscriber,
} from "../../../../features/web/server/newsletter";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const reply = (body: unknown, status = 200) =>
    NextResponse.json(body, {
      status,
      headers: { "Cache-Control": "no-store" },
    });
  try {
    const secret = authorizeNewsletterGateway(request);
    await collectSubscriber(await readNewsletterBody(request), secret);
    return reply({ success: true });
  } catch (error) {
    if (error instanceof WebError)
      return reply({ error: error.message }, error.status);
    if (error instanceof SyntaxError)
      return reply({ error: "Invalid request." }, 400);
    return reply({ error: "Signups are temporarily unavailable." }, 503);
  }
}
