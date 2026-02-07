import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const body = await req.json();

  // Example: just echo back for now (to test the 500 fix)
  return NextResponse.json({
    ok: true,
    received: body,
  });
}
