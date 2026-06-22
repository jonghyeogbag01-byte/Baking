// lib/claude.ts
// ⚠️  서버 전용 — 클라이언트에서 import 금지
// API Key는 process.env.ANTHROPIC_API_KEY 에서만 읽음

import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export interface ClaudeResult {
  text: string;
  truncated: boolean;   // stop_reason==="max_tokens" OR JSON 종료문자 없음
  stopReason: string;
  usage: { input_tokens: number; output_tokens: number };
}

export async function callClaude(
  userContent: string,
  systemPrompt: string,
  maxTokens = 2048
): Promise<ClaudeResult> {
  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [{ role: "user", content: userContent }],
  });

  const text = response.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("");

  const tokenTruncated = response.stop_reason === "max_tokens";
  const tail = text.trimEnd();
  const structuralTruncated =
    tokenTruncated ||
    (text.includes("{") && !tail.endsWith("}") && !tail.endsWith("]"));

  return {
    text,
    truncated: structuralTruncated,
    stopReason: response.stop_reason ?? "unknown",
    usage: {
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
    },
  };
}
