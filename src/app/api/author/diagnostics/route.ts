import { NextResponse } from "next/server";
import { buildContentDiagnostics } from "@/lib/server/content-diagnostics";
import { assertDevLocal } from "../_guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const denied = assertDevLocal(request);
  if (denied) return denied;

  try {
    return NextResponse.json(buildContentDiagnostics(process.cwd()));
  } catch {
    return NextResponse.json(
      { error: "content diagnostics unavailable" },
      { status: 500 },
    );
  }
}
