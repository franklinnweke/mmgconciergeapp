import "server-only";
import { cookies } from "next/headers";
import {
  verifyStaffSessionCookie,
  requireLiveStaffSession,
  staffSessionHasCapability,
  type StaffSession,
} from "../../auth/server/session";
import { WebError } from "../model";
export function isWebFixture() {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.MMG_ADMIN_FIXTURES === "1"
  );
}
export async function webApiSession(): Promise<StaffSession> {
  const session = isWebFixture()
    ? await requireLiveStaffSession()
    : await verifyStaffSessionCookie(
        (await cookies()).get("__session")?.value || "",
      );
  if (!session) throw new WebError("Please sign in to continue.", 401);
  if (!staffSessionHasCapability(session, "web.manage"))
    throw new WebError("Your staff account cannot manage the website.", 403);
  return session;
}
