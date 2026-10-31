import { WebVehicleEditor } from "@/features/web/components/web-vehicle-editor";
export default async function EditWebVehicle({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <WebVehicleEditor id={(await params).id} />;
}
