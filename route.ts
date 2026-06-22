// app/api/parse/route.ts
import { NextRequest, NextResponse } from "next/server";
import { callClaude } from "@/lib/claude";
import { sanitizeInput } from "@/lib/sanitize";
import { repairJson } from "@/lib/repairJson";
import { PARSER_SYSTEM_PROMPT } from "@/lib/prompts";
import type { ParsedRecipe, ApiResponse } from "@/types";

export async function POST(req: NextRequest) {
  try {
    const { content } = await req.json();
    if (!content || typeof content !== "string") {
      return NextResponse.json(
        { error: "content 필드가 필요합니다." } satisfies ApiResponse<never>,
        { status: 400 }
      );
    }

    const sanitized = sanitizeInput(content);

    const result = await callClaude(
      `이 레시피를 파싱해주세요:\n${sanitized}`,
      PARSER_SYSTEM_PROMPT,
      2048
    );

    let parsed: ParsedRecipe;
    try {
      const repaired = repairJson(result.text);
      parsed = JSON.parse(repaired) as ParsedRecipe;
      if (!Array.isArray(parsed.ingredients)) parsed.ingredients = [];
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return NextResponse.json(
        { error: `JSON 파싱 실패: ${msg}`, truncated: result.truncated } satisfies ApiResponse<never>,
        { status: 422 }
      );
    }

    return NextResponse.json({
      data: parsed,
      truncated: result.truncated,
      usage: result.usage,
    } satisfies ApiResponse<ParsedRecipe>);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "서버 오류";
    return NextResponse.json(
      { error: msg } satisfies ApiResponse<never>,
      { status: 500 }
    );
  }
}
