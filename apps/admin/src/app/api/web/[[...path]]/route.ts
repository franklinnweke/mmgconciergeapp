import { NextResponse } from "next/server";
import { checkSameOrigin } from "../../../../features/auth/server/same-origin";
import {
  isWebFixture,
  webApiSession,
} from "../../../../features/web/server/access";
import {
  getWebVehicle,
  deleteWebVehicle,
  importWebSeed,
  listWebVehicles,
  mutateWebVehicle,
} from "../../../../features/web/server/repository";
import {
  readWebPhoto,
  uploadWebPhoto,
} from "../../../../features/web/server/media";
import {
  WebError,
  publicVehicle,
  validId,
  validateContent,
  type WebAction,
} from "../../../../features/web/model";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ path?: string[] }> };
const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
async function handle(request: Request, context: Context) {
  try {
    const path = (await context.params).path || [];
    if (path.some((p) => !validId(p)))
      return json({ error: "Not found." }, 404);
    const method = request.method;
    if (method === "GET" && path.join("/") === "catalogue") {
      const base = process.env.MMG_WEB_MEDIA_BASE_URL?.replace(/\/$/, "");
      if (!base)
        throw new WebError("The website catalogue is not configured.", 503);
      const mediaUrl = new URL(base);
      if (
        mediaUrl.origin !== base ||
        (mediaUrl.protocol !== "https:" &&
          !(isWebFixture() && mediaUrl.hostname === "127.0.0.1"))
      )
        throw new WebError(
          "The website catalogue requires a configured HTTPS origin.",
          503,
        );
      return json({
        vehicles: (await listWebVehicles(true)).map((v) =>
          publicVehicle(v, base),
        ),
      });
    }
    if (method === "GET" && path[0] === "media" && path.length === 2) {
      let staff = false;
      try {
        await webApiSession();
        staff = true;
      } catch {
        /* Public reads are limited to published vehicle photos. */
      }
      const buffer = await readWebPhoto(path[1], staff);
      if (!buffer) return json({ error: "Photo not found." }, 404);
      return new Response(new Uint8Array(buffer), {
        headers: {
          "Content-Type": "image/webp",
          "Cache-Control": staff ? "private,no-store" : "public,max-age=60",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
    const session = await webApiSession();
    if (method !== "GET" && !checkSameOrigin(request.headers).allowed)
      throw new WebError("Request origin could not be verified.", 403);
    if (method === "GET" && path.join("/") === "vehicles")
      return json({ vehicles: await listWebVehicles() });
    if (method === "GET" && path[0] === "vehicles" && path.length === 2) {
      const vehicle = await getWebVehicle(path[1]);
      return vehicle
        ? json({ vehicle })
        : json({ error: "Vehicle not found." }, 404);
    }
    if (method === "POST" && path.join("/") === "import") {
      await importWebSeed(session.uid);
      return json({ success: true });
    }
    if (method === "POST" && path.join("/") === "media")
      return json({ photo: await uploadWebPhoto(request, session.uid) });
    if (
      (method === "PUT" && path[0] === "vehicles" && path.length === 2) ||
      (method === "POST" && path.join("/") === "vehicles")
    ) {
      const body = await request.json();
      const id = method === "POST" ? body.id : path[1];
      if (
        typeof id !== "string" ||
        !validId(id) ||
        !Number.isInteger(body.expectedVersion) ||
        body.expectedVersion < 0
      )
        throw new WebError("Invalid vehicle request.");
      if (method === "POST" && body.expectedVersion !== 0)
        throw new WebError("A new vehicle must start as a draft.");
      const content = validateContent(body.content);
      return json({
        vehicle: await mutateWebVehicle({
          id,
          content,
          expectedVersion: body.expectedVersion,
          actor: session.uid,
        }),
      });
    }
    if (
      method === "POST" &&
      path[0] === "vehicles" &&
      path.length === 3 &&
      ["publish", "hide", "archive", "restore", "delete"].includes(path[2])
    ) {
      const body = await request.json();
      if (!Number.isInteger(body.expectedVersion) || body.expectedVersion < 1)
        throw new WebError("Refresh this vehicle before continuing.");
      if (path[2] === "delete") {
        await deleteWebVehicle(path[1], body.expectedVersion, session.uid);
        return json({ deleted: true });
      }
      return json({
        vehicle: await mutateWebVehicle({
          id: path[1],
          action: path[2] as WebAction,
          expectedVersion: body.expectedVersion,
          actor: session.uid,
        }),
      });
    }
    return json({ error: "Not found." }, 404);
  } catch (error) {
    if (error instanceof WebError)
      return json({ error: error.message }, error.status);
    if (error instanceof SyntaxError)
      return json({ error: "Invalid request." }, 400);
    return json(
      {
        error:
          "The website workspace is temporarily unavailable. Your changes have not been confirmed. Try again.",
      },
      500,
    );
  }
}
export const GET = handle;
export const POST = handle;
export const PUT = handle;
