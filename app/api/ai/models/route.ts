import { auth } from "@clerk/nextjs/server";
import { listModelAvailability } from "@/lib/ai/model-registry";

export const dynamic = "force-dynamic";

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return Response.json(
      { code: "UNAUTHORIZED", message: "Sign in to view available AI models." },
      { status: 401, headers: { "Cache-Control": "private, no-store" } },
    );
  }
  return Response.json(
    { models: listModelAvailability() },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
