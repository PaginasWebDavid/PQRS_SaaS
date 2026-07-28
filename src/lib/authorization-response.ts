import { NextResponse } from "next/server";
import { getAuthorizationFailure } from "@/lib/authorization-core";

export function getAuthorizationErrorResponse(error: unknown): NextResponse | null {
  const failure = getAuthorizationFailure(error);
  if (!failure) return null;
  return NextResponse.json(failure.body, { status: failure.status });
}
