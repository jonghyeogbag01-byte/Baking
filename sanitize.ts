// lib/sanitize.ts — 서버/클라이언트 공용
export function sanitizeInput(raw: string): string {
  return raw
    .replace(/\uFFFD/g, "")                                          // 깨진 문자 제거
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")              // 제어문자 제거
    .replace(/(\d+분)(\d+시간)/g, "$1~$2")                            // 범위 복원
    .replace(/(\d+)(분|시간|g|ml|개|장|스푼|컵)(\d+)\2/g, "$1~$3$2") // 범위 복원
    .replace(/(YouTube\s*\+?\d*|공유하기|좋아요\s*\d*|구독\s*[\d,]*|조회수\s*[\d,]+)/gi, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
