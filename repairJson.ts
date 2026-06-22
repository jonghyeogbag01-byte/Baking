// lib/repairJson.ts — 서버 전용
// LLM이 생성한 JSON의 흔한 문법 오류를 수정합니다.
export function repairJson(raw: string): string {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("JSON 구조 없음 (중괄호 없음)");
  let s = raw.slice(start, end + 1);

  // 1. 문자열 내 이스케이프 안 된 따옴표 복구
  s = s.replace(/"((?:[^"\\]|\\.)*)"/g, (_match, inner: string) => {
    const fixed = inner.replace(/(?<!\\)"/g, '\\"');
    return `"${fixed}"`;
  });

  // 2. 후행 쉼표 제거
  s = s.replace(/,\s*([}\]])/g, "$1");

  // 3. 배열/객체 내 리터럴 줄바꿈 제거
  s = s.replace(/"([^"]*)\n([^"]*)"/g, (_: string, a: string, b: string) => `"${a} ${b}"`);

  return s;
}
