import type { ReactNode } from "react";
import { requireStaffCapability } from "@/features/auth/server/session";
import { isWebFixture } from "@/features/web/server/access";
import { WebShell } from "@/features/web/components/web-shell";
import "./web.css";
export const metadata = {
  title: "MMG · Website workspace",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";
export default async function WebLayout({ children }: { children: ReactNode }) {
  const session = await requireStaffCapability("web.read");
  return (
    <WebShell email={session.email} fixture={isWebFixture()}>
      {children}
    </WebShell>
  );
}
