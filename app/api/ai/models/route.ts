import { listModelAvailability } from "@/lib/ai/model-registry";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(
    { models: listModelAvailability() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
