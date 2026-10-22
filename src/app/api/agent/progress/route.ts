import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { rows } from "@/lib/db";
export async function GET(request: Request) {
  const user = await currentUser();
  if (!user)
    return NextResponse.json({ code: "UNAUTHORIZED" }, { status: 401 });
  const id = new URL(request.url).searchParams.get("runId");
  if (!id || id.length > 64)
    return NextResponse.json({ code: "VALIDATION_ERROR" }, { status: 400 });
  const [run] = await rows<{ status: string }>(
    "SELECT status FROM agent_runs WHERE id=? AND user_id=?",
    [id, user.id],
  );
  if (!run) return NextResponse.json({ code: "NOT_FOUND" }, { status: 404 });
  const steps = await rows<{ name: string; status: string }>(
    "SELECT name,status FROM agent_tool_calls WHERE run_id=? ORDER BY created_at,id",
    [id],
  );
  return NextResponse.json(
    { status: run.status, steps },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
