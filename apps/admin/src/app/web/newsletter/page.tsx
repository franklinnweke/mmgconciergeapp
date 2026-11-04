import { requireStaffCapability } from "@/features/auth/server/session";
import { WebSubscribers } from "@/features/web/components/web-subscribers";
export default async function NewsletterPage() {
  await requireStaffCapability("web.subscribers");
  return <WebSubscribers />;
}
