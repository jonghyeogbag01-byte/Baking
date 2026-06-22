import { useState, useEffect, useRef } from "react";

// ── Design tokens ──────────────────────────────────────────────
// Palette inspired by a warm, professional pastry kitchen:
// parchment base, deep espresso text, burnished-gold accent,
// with cool slate for data/utility.
const T = {
  parchment: "#F7F3ED",
  cream: "#EFE8DC",
  espresso: "#2B1D0E",
  mocha: "#5C3D1E",
  gold: "#C8821A",
  goldLight: "#F0C97A",
  slate: "#4A5568",
  slateLight: "#E2E8F0",
  green: "#2D6A4F",
  greenLight: "#D8F3DC",
  red: "#9B2226",
  redLight: "#FFE5E5",
};

// ── Observability: Global Log Store ───────────────────────────
const _logs = [];
let _logListeners = [];
function subscribeLog(fn) { _logListeners.push(fn); return () => { _logListeners = _logListeners.filter(f => f !== fn); }; }
function emitLog(entry) { _logs.push(entry); _logListeners.forEach(fn => fn([..._logs])); }

function logEvent(stage, event, data = {}) {
  const entry = { id: Date.now() + Math.random(), ts: new Date().toISOString(), stage, event, ...data };
  emitLog(entry);
  // Mirror to console for devtools
  const style = event.includes("ERROR") ? "color:#f44" : event.includes("SUCCESS") ? "color:#4c4" : "color:#8af";
  console.log(`%c[BakingOS][${stage}] ${event}`, style, data);
}

// ── Instrumented API caller ────────────────────────────────────
// 반환: { text, truncated, stopReason, usage }
// truncated 판단: stop_reason==="max_tokens" OR JSON 종료문자 없음
async function callClaude(messages, systemPrompt, stage = "Unknown", maxTokens = 4096) {
  const payload = { model: "claude-sonnet-4-6", max_tokens: maxTokens, system: systemPrompt, messages };
  logEvent(stage, "REQUEST_SENT", {
    max_tokens: maxTokens,
    system_length: systemPrompt.length,
    user_content_length: messages[0]?.content?.length ?? 0,
    user_content_preview: messages[0]?.content?.slice(0, 200),
  });

  const t0 = performance.now();
  let httpStatus = null;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    httpStatus = res.status;
    const data = await res.json();
    const elapsed = Math.round(performance.now() - t0);

    if (!res.ok || data.error) {
      const errMsg = data.error?.message ?? JSON.stringify(data);
      logEvent(stage, "API_ERROR", { http_status: httpStatus, error: errMsg, elapsed_ms: elapsed });
      throw new Error(`API ${httpStatus}: ${errMsg}`);
    }

    const usage = data.usage ?? {};
    const stopReason = data.stop_reason ?? "unknown";
    const text = (data.content ?? []).map(b => b.text || "").join("");

    // ── Truncation 판단: stop_reason 우선, 보조로 JSON 구조 종료 확인
    const tokenTruncated = stopReason === "max_tokens";
    const tail = text.trimEnd();
    const structuralTruncated = tokenTruncated || (
      text.includes("{") && !tail.endsWith("}") && !tail.endsWith("]")
    );

    logEvent(stage, "RESPONSE_RECEIVED", {
      http_status: httpStatus,
      elapsed_ms: elapsed,
      input_tokens: usage.input_tokens,
      output_tokens: usage.output_tokens,
      max_tokens: maxTokens,
      stop_reason: stopReason,
      token_truncated: tokenTruncated,
      structural_truncated: structuralTruncated,
      response_length: text.length,
      response_tail: text.slice(-80),
      response_preview: text.slice(0, 300),
    });

    if (structuralTruncated) {
      logEvent(stage, "TRUNCATION_DETECTED", {
        output_tokens: usage.output_tokens,
        max_tokens: maxTokens,
        token_truncated: tokenTruncated,
        structural_truncated: structuralTruncated,
        response_tail: text.slice(-200),
      });
    }

    return { text, truncated: structuralTruncated, stopReason, usage };
  } catch (err) {
    const elapsed = Math.round(performance.now() - t0);
    logEvent(stage, "FETCH_ERROR", { http_status: httpStatus, error: err.message, elapsed_ms: elapsed });
    throw err;
  }
}

function naverLink(ingredient) {
  return `https://search.shopping.naver.com/search/all?query=${encodeURIComponent(ingredient + " 제과재료")}`;
}

function fmtTime(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// ── Input Sanitizer ───────────────────────────────────────────
function sanitizeInput(raw) {
  return raw
    // 1. 깨진 문자(U+FFFD replacement character) 제거
    .replace(/\uFFFD/g, "")
    // 2. 비가시 제어문자 제거 (줄바꿈·탭 제외)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    // 3. 범위 표현 복원: "숫자숫자" → "숫자~숫자"
    //    "30분1시간" → "30분~1시간", "2030분" → "20~30분"
    .replace(/(\d+분)(\d+시간)/g, "$1~$2")
    .replace(/(\d+)(분|시간|g|ml|개|장|스푼|컵)(\d+)\2/g, "$1~$3$2")
    // 4. 복사 잔재 텍스트 제거 (YouTube, +1, 공유 등)
    .replace(/(YouTube\s*\+?\d*|공유하기|좋아요\s*\d*|구독\s*\d*|조회수\s*[\d,]+)/gi, "")
    // 5. 연속 공백/줄바꿈 정리
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ── Log Viewer (floating panel) ───────────────────────────────
const STAGE_COLOR = {
  Parser: "#61AFEF", Knowledge: "#C678DD", Execution: "#E5C07B",
  Input: "#98C379", Unknown: "#ABB2BF",
};
const EVENT_COLOR = {
  REQUEST_SENT: "#ABB2BF", RESPONSE_RECEIVED: "#98C379",
  PARSE_SUCCESS: "#98C379", RENDER_SUCCESS: "#98C379",
  API_ERROR: "#E06C75", FETCH_ERROR: "#E06C75", PARSE_ERROR: "#E06C75",
  SANITIZE: "#61AFEF", START: "#E5C07B",
};

function LogViewer() {
  const [logs, setLogs] = useState([]);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("ALL");
  const [selected, setSelected] = useState(null);
  const bottomRef = useRef(null);

  useEffect(() => subscribeLog(setLogs), []);
  useEffect(() => { if (open) bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [logs, open]);

  const stages = ["ALL", ...new Set(logs.map(l => l.stage))];
  const visible = filter === "ALL" ? logs : logs.filter(l => l.stage === filter);
  const errorCount = logs.filter(l => l.event.includes("ERROR")).length;
  const lastSuccess = [...logs].reverse().find(l => l.event.includes("SUCCESS"))?.stage ?? "없음";

  const exportLogs = () => {
    const blob = new Blob([JSON.stringify(logs, null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = `baking-os-logs-${Date.now()}.json`; a.click();
  };

  return (
    <>
      {/* Floating toggle button */}
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          position: "fixed", bottom: 20, right: 20, zIndex: 1000,
          background: errorCount > 0 ? "#E06C75" : "#282C34",
          color: "#fff", borderRadius: 28, padding: "10px 18px",
          cursor: "pointer", fontSize: 13, fontWeight: 700,
          boxShadow: "0 4px 16px rgba(0,0,0,0.35)",
          display: "flex", alignItems: "center", gap: 8,
          fontFamily: "monospace",
        }}
      >
        <span>{open ? "✕" : "🔍"}</span>
        <span>Logs ({logs.length})</span>
        {errorCount > 0 && (
          <span style={{ background: "#fff", color: "#E06C75", borderRadius: 10, padding: "1px 7px", fontSize: 11 }}>
            {errorCount} ERR
          </span>
        )}
      </div>

      {/* Panel */}
      {open && (
        <div style={{
          position: "fixed", bottom: 70, right: 20, zIndex: 999,
          width: Math.min(620, window.innerWidth - 32),
          maxHeight: "70vh", background: "#1E2127",
          borderRadius: 12, boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
          display: "flex", flexDirection: "column", overflow: "hidden",
          fontFamily: "monospace",
        }}>

          {/* Header */}
          <div style={{ padding: "10px 14px", background: "#282C34", borderBottom: "1px solid #3E4451", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ color: "#ABB2BF", fontSize: 12, fontWeight: 700 }}>BAKING OS — OBSERVABILITY</span>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ color: "#98C379", fontSize: 11 }}>✓ last: {lastSuccess}</span>
              <button onClick={exportLogs} style={{ background: "#3E4451", border: "none", color: "#ABB2BF", borderRadius: 4, padding: "3px 8px", fontSize: 11, cursor: "pointer" }}>⬇ JSON</button>
              <button onClick={() => setSelected(null)} style={{ background: "none", border: "none", color: "#ABB2BF", fontSize: 11, cursor: "pointer" }}>✕ 선택해제</button>
            </div>
          </div>

          {/* Summary bar */}
          <div style={{ padding: "6px 14px", background: "#21252B", borderBottom: "1px solid #3E4451", display: "flex", gap: 16, fontSize: 11, color: "#ABB2BF" }}>
            <span>총 이벤트 <b style={{ color: "#E5C07B" }}>{logs.length}</b></span>
            <span>오류 <b style={{ color: "#E06C75" }}>{errorCount}</b></span>
            <span>마지막 성공 단계 <b style={{ color: "#98C379" }}>{lastSuccess}</b></span>
          </div>

          {/* Stage filter */}
          <div style={{ padding: "6px 14px", background: "#21252B", borderBottom: "1px solid #3E4451", display: "flex", gap: 6, flexWrap: "wrap" }}>
            {stages.map(s => (
              <button key={s} onClick={() => setFilter(s)} style={{
                background: filter === s ? "#3E4451" : "none",
                border: `1px solid ${filter === s ? "#61AFEF" : "#3E4451"}`,
                color: filter === s ? "#61AFEF" : "#ABB2BF",
                borderRadius: 4, padding: "2px 8px", fontSize: 11, cursor: "pointer",
              }}>{s}</button>
            ))}
          </div>

          {/* Log list */}
          <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
            {visible.length === 0 && (
              <p style={{ color: "#5C6370", fontSize: 12, textAlign: "center", padding: "20px 0" }}>로그 없음 — 레시피 분석을 시작하세요</p>
            )}
            {visible.map((log) => (
              <div
                key={log.id}
                onClick={() => setSelected(selected?.id === log.id ? null : log)}
                style={{
                  padding: "5px 14px", cursor: "pointer",
                  background: selected?.id === log.id ? "#2C313C" : "transparent",
                  borderLeft: `3px solid ${EVENT_COLOR[log.event] ?? "#ABB2BF"}`,
                  marginBottom: 1,
                }}
              >
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ color: "#5C6370", fontSize: 10, flexShrink: 0 }}>
                    {log.ts.slice(11, 23)}
                  </span>
                  <span style={{ color: STAGE_COLOR[log.stage] ?? "#ABB2BF", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                    [{log.stage}]
                  </span>
                  <span style={{ color: EVENT_COLOR[log.event] ?? "#ABB2BF", fontSize: 11 }}>
                    {log.event}
                  </span>
                  {log.elapsed_ms && (
                    <span style={{ color: "#5C6370", fontSize: 10 }}>{log.elapsed_ms}ms</span>
                  )}
                  {log.http_status && (
                    <span style={{ color: log.http_status === 200 ? "#98C379" : "#E06C75", fontSize: 10 }}>
                      HTTP {log.http_status}
                    </span>
                  )}
                  {log.input_tokens && (
                    <span style={{ color: "#5C6370", fontSize: 10 }}>↑{log.input_tokens} ↓{log.output_tokens}</span>
                  )}
                </div>

                {/* Expanded detail */}
                {selected?.id === log.id && (
                  <div style={{ marginTop: 6, padding: "8px 10px", background: "#1A1D23", borderRadius: 6, fontSize: 11 }}>
                    {Object.entries(log).filter(([k]) => !["id","ts","stage","event"].includes(k)).map(([k, v]) => (
                      <div key={k} style={{ marginBottom: 6 }}>
                        <span style={{ color: "#61AFEF", display: "block", marginBottom: 2 }}>{k}:</span>
                        <pre style={{ margin: 0, color: "#ABB2BF", whiteSpace: "pre-wrap", wordBreak: "break-all", maxHeight: 200, overflowY: "auto" }}>
                          {typeof v === "object" ? JSON.stringify(v, null, 2) : String(v)}
                        </pre>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        </div>
      )}
    </>
  );
}

// ── JSON Repair ───────────────────────────────────────────────
// LLM이 생성한 JSON의 흔한 문법 오류를 수정합니다.
function repairJson(raw) {
  // 1. { } 범위만 추출
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("JSON 구조 없음 (중괄호 없음)");
  let s = raw.slice(start, end + 1);

  // 2. JSON 문자열 내부의 이스케이프 안 된 따옴표 복구
  //    "버터를 "중탕"으로" → "버터를 \"중탕\"으로"
  //    전략: 문자열 값 영역(콜론 뒤 " ~ 다음 " 사이)을 찾아 내부 naked quote를 이스케이프
  s = s.replace(/"((?:[^"\\]|\\.)*)"/g, (match, inner) => {
    // inner 안에 이스케이프 안 된 " 가 있으면 \" 로 교체
    const fixed = inner.replace(/(?<!\\)"/g, '\\"');
    return `"${fixed}"`;
  });

  // 3. 후행 쉼표 제거  [1, 2, ] → [1, 2]
  s = s.replace(/,\s*([}\]])/g, "$1");

  // 4. 배열/객체 내 줄바꿈으로 이어진 문자열 이어붙이기
  //    "abc\n def" (JSON 문자열 값 안 literal newline) → "abc def"
  s = s.replace(/"([^"]*)\n([^"]*)"/g, (_, a, b) => `"${a} ${b}"`);

  return s;
}

// ── Sub-components ─────────────────────────────────────────────

function Stepper({ steps, current }) {
  return (
    <div style={{ display: "flex", gap: 0, marginBottom: 28 }}>
      {steps.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", width: "100%" }}>
              {i > 0 && (
                <div style={{ flex: 1, height: 2, background: done ? T.gold : T.cream }} />
              )}
              <div
                style={{
                  width: 28, height: 28, borderRadius: "50%",
                  background: done ? T.gold : active ? T.espresso : T.cream,
                  color: done || active ? "#fff" : T.slate,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 12, fontWeight: 700, flexShrink: 0,
                  border: active ? `2px solid ${T.gold}` : "none",
                  boxSizing: "border-box",
                }}
              >
                {done ? "✓" : i + 1}
              </div>
              {i < steps.length - 1 && (
                <div style={{ flex: 1, height: 2, background: done ? T.gold : T.cream }} />
              )}
            </div>
            <span style={{ fontSize: 10, color: active ? T.espresso : T.slate, marginTop: 4, textAlign: "center", lineHeight: 1.2 }}>
              {s}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Card({ children, style }) {
  return (
    <div style={{
      background: "#fff", borderRadius: 12,
      border: `1px solid ${T.cream}`,
      padding: "20px 24px", marginBottom: 16, ...style,
    }}>
      {children}
    </div>
  );
}

function Btn({ onClick, disabled, children, variant = "primary", style }) {
  const base = {
    padding: "10px 22px", borderRadius: 8, border: "none",
    cursor: disabled ? "not-allowed" : "pointer",
    fontWeight: 600, fontSize: 14, transition: "opacity .15s", ...style,
  };
  const variants = {
    primary: { background: T.gold, color: "#fff", opacity: disabled ? 0.5 : 1 },
    ghost: { background: "transparent", color: T.mocha, border: `1px solid ${T.gold}`, opacity: disabled ? 0.5 : 1 },
    danger: { background: T.red, color: "#fff", opacity: disabled ? 0.5 : 1 },
  };
  return <button onClick={disabled ? undefined : onClick} style={{ ...base, ...variants[variant] }}>{children}</button>;
}

// ── Sample recipes ─────────────────────────────────────────────
const SAMPLES = {
  "마들렌": `마들렌 12개 기준
재료:
- 버터 100g
- 설탕 90g
- 달걀 2개
- 박력분 100g
- 베이킹파우더 3g
- 꿀 10g
- 레몬제스트 1개분
- 소금 1g

만드는 법:
1. 버터를 녹여 식힌다
2. 달걀과 설탕을 섞고 꿀, 레몬제스트, 소금 추가
3. 체친 박력분과 베이킹파우더를 넣고 섞는다
4. 녹인 버터를 넣고 섞은 후 냉장 1시간 휴지
5. 마들렌 틀에 80% 채워 180°C 오븐에서 12분 굽기
6. 꺼내서 식힘망에 올려 완전히 식힌다`,

  "스콘": `스콘 8개 기준
재료:
- 박력분 250g
- 버터 60g (차갑게)
- 설탕 30g
- 베이킹파우더 8g
- 소금 3g
- 달걀 1개
- 우유 80~100ml
- 건포도 50g (선택)

만드는 법:
1. 가루류를 체에 내려 볼에 담는다
2. 차가운 버터를 잘라 넣고 손가락으로 모래알 질감이 나게 비빈다
3. 달걀과 우유를 섞어 반죽에 넣고 가볍게 뭉친다
4. 반죽을 2cm 두께로 밀어 스콘 모양으로 커팅
5. 200°C 오븐에서 18~20분 굽기
6. 식힘망에서 10분 식힌 후 서빙`,

  "초코쿠키": `초코칩 쿠키 20개 기준
재료:
- 버터 115g (실온)
- 황설탕 100g
- 백설탕 50g
- 달걀 1개
- 바닐라에센스 5ml
- 박력분 190g
- 베이킹소다 3g
- 소금 3g
- 초코칩 150g

만드는 법:
1. 버터와 설탕을 크림화한다 (약 3분)
2. 달걀과 바닐라에센스를 넣고 섞는다
3. 체친 가루류를 넣고 주걱으로 자르듯 섞는다
4. 초코칩을 넣고 섞은 뒤 냉장 30분 휴지
5. 30g씩 분할해 베이킹 시트에 올린다
6. 175°C에서 11~13분 굽기 (가장자리만 익으면 꺼내기)
7. 시트 위에서 5분 후 식힘망으로 옮기기`,
};

// ── PHASE 0: Input ─────────────────────────────────────────────
function PhaseInput({ onSubmit }) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [preview, setPreview] = useState(null);
  const [urlWarning, setUrlWarning] = useState(false);

  const URL_RE = /^https?:\/\//i;

  const handleChange = (val) => {
    setText(val);
    setErr("");
    // URL 감지
    const trimmed = val.trim();
    if (URL_RE.test(trimmed)) {
      setUrlWarning(true);
      setPreview(null);
      return;
    }
    setUrlWarning(false);
    // Sanitize diff preview
    if (trimmed) {
      const sanitized = sanitizeInput(trimmed);
      setPreview(sanitized !== trimmed ? sanitized : null);
    } else {
      setPreview(null);
    }
  };

  const loadSample = (key) => {
    handleChange(SAMPLES[key]);
    logEvent("Input", "SAMPLE_LOADED", { sample: key });
  };

  const handle = async () => {
    const raw = text.trim();
    if (!raw) return setErr("레시피 본문을 붙여넣어 주세요.");
    if (URL_RE.test(raw)) return setErr("URL은 지원되지 않습니다. 레시피 본문을 직접 복사해 붙여넣어 주세요.");
    const content = sanitizeInput(raw);
    logEvent("Input", "START", { input_length: raw.length, sanitized_length: content.length });
    if (content !== raw) {
      logEvent("Input", "SANITIZE", {
        diff_chars: raw.length - content.length,
        sanitized_preview: content.slice(0, 300),
      });
    }
    setErr(""); setLoading(true);
    try {
      onSubmit({ mode: "text", content, original: raw });
    } catch (e) {
      setErr("오류가 발생했습니다. 다시 시도해주세요.");
    }
    setLoading(false);
  };

  return (
    <div style={{ maxWidth: 640, margin: "0 auto" }}>
      <div style={{ textAlign: "center", marginBottom: 28 }}>
        <div style={{ fontSize: 36, marginBottom: 8 }}>🥐</div>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: T.espresso, margin: 0 }}>Baking OS</h1>
        <p style={{ color: T.mocha, marginTop: 6, fontSize: 14 }}>
          레시피 본문을 붙여넣으면 재료 추출 · 가격 링크 · 작업 지시서까지 자동으로 만들어드립니다
        </p>
      </div>

      <Card>
        {/* Sample buttons */}
        <div style={{ marginBottom: 14 }}>
          <p style={{ margin: "0 0 8px", fontSize: 12, color: T.slate, fontWeight: 600 }}>샘플 레시피로 테스트</p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {Object.keys(SAMPLES).map((key) => (
              <button key={key} onClick={() => loadSample(key)} style={{
                padding: "6px 14px", borderRadius: 20,
                border: `1px solid ${T.gold}`, background: T.goldLight,
                color: T.mocha, fontSize: 12, fontWeight: 600, cursor: "pointer",
              }}>
                {key === "마들렌" ? "🧁" : key === "스콘" ? "🫐" : "🍪"} {key}
              </button>
            ))}
          </div>
        </div>

        <div style={{ height: 1, background: T.cream, margin: "0 0 14px" }} />

        {/* Paste area */}
        <p style={{ margin: "0 0 8px", fontSize: 12, color: T.slate, fontWeight: 600 }}>레시피 본문 붙여넣기</p>
        <textarea
          value={text}
          onChange={(e) => handleChange(e.target.value)}
          placeholder={
            "만개의레시피, 네이버 블로그 등에서 레시피 본문을 복사해 붙여넣으세요.\n\n지원 형식:\n- 재료명 + 수량 (예: 버터 100g)\n- 단계별 설명 (예: 1. 버터를 녹인다)\n- 범위 수량 (예: 180~200g, 약간)\n- 오븐 온도와 시간"
          }
          style={{
            width: "100%", minHeight: 200, padding: 12, borderRadius: 8,
            border: `1.5px solid ${urlWarning ? T.red : T.cream}`,
            fontFamily: "inherit", fontSize: 14, resize: "vertical",
            background: T.parchment, color: T.espresso, outline: "none",
            boxSizing: "border-box", transition: "border-color .15s",
          }}
        />

        {/* URL warning */}
        {urlWarning && (
          <div style={{ marginTop: 8, padding: "10px 14px", background: T.redLight, borderRadius: 8, border: `1px solid ${T.red}` }}>
            <p style={{ margin: 0, fontSize: 13, color: T.red, fontWeight: 600 }}>
              ⚠️ URL 가져오기는 현재 지원되지 않습니다
            </p>
            <p style={{ margin: "4px 0 0", fontSize: 12, color: T.red }}>
              만개의레시피 등 사이트에서 레시피 <b>본문 텍스트를 직접 복사</b>해 붙여넣어 주세요.<br />
              (URL fetch 기능은 백엔드 연동 후 지원 예정입니다)
            </p>
          </div>
        )}

        {/* Sanitize diff preview */}
        {preview && !urlWarning && (
          <div style={{ marginTop: 8, padding: "10px 12px", background: "#FFFBEB", borderRadius: 8, border: `1px solid ${T.goldLight}` }}>
            <p style={{ margin: "0 0 4px", fontSize: 12, fontWeight: 700, color: T.mocha }}>
              🧹 입력 정제 감지 — 깨진 문자·범위 표현을 자동 복원했습니다
            </p>
            <pre style={{ margin: 0, fontSize: 11, color: T.slate, whiteSpace: "pre-wrap", maxHeight: 72, overflow: "auto" }}>
              {preview.slice(0, 300)}{preview.length > 300 ? "…" : ""}
            </pre>
          </div>
        )}

        {err && <p style={{ color: T.red, fontSize: 13, margin: "8px 0 0" }}>{err}</p>}

        <div style={{ marginTop: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <p style={{ margin: 0, fontSize: 11, color: T.slate }}>
            💡 URL 지원은 백엔드 연동 후 추가 예정
          </p>
          <Btn onClick={handle} disabled={loading || urlWarning}>
            {loading ? "분석 중…" : "레시피 분석 시작 →"}
          </Btn>
        </div>
      </Card>
    </div>
  );
}

// ── PHASE 1: Parse ─────────────────────────────────────────────
function PhaseParse({ input, onDone }) {
  const [status, setStatus] = useState("parsing");
  const [parsed, setParsed] = useState(null);
  const [rawResponse, setRawResponse] = useState("");
  const [parseErr, setParseErr] = useState("");
  const [showDebug, setShowDebug] = useState(false);

  useEffect(() => {
    const SYSTEM = `당신은 베이킹 레시피 파서입니다.
반드시 { 로 시작하고 } 로 끝나는 순수 JSON만 반환하세요. 마크다운, 설명, 코드블록 금지.

스키마 (필드명·타입 정확히 준수):
{
  "name": "레시피 이름",
  "servings": "분량 (예: 12개)",
  "category": "제과 카테고리 (예: 마들렌)",
  "ingredients": [
    {
      "name": "재료명",
      "amount": "수량 — 범위 허용 (예: 100, 180~200, 약간, 적당량)",
      "unit": "단위 (예: g / ml / 개 / 없으면 빈 문자열)",
      "note": "비고 (예: 선택, 실온 / 없으면 빈 문자열)"
    }
  ],
  "oven": {
    "temp": 숫자 (number, 범위면 중간값),
    "duration": 숫자 (number, 분 단위 정수),
    "mode": "컨벡션 또는 일반"
  }
}

규칙:
- steps 필드는 생성하지 마세요 (불필요)
- 문자열 값 안에 큰따옴표(")를 절대 사용하지 마세요. 작은따옴표(') 사용
- amount는 원문 그대로 string 보존
- oven.temp 범위면 중간값 숫자 사용
- 재료 없으면 ingredients: []
- 레시피 이름 불명이면 name: "레시피"
- 후행 쉼표 금지`;

    callClaude(
      [{ role: "user", content: `이 레시피를 파싱해주세요:\n${input.content}` }],
      SYSTEM,
      "Parser",
      2048
    )
      .then(({ text: raw, truncated }) => {
        setRawResponse(raw);
        if (truncated) {
          logEvent("Parser", "TRUNCATION_DETECTED", { note: "Parser 응답 truncation — 재시도 없이 repair 시도" });
        }
        let data;
        try {
          const repaired = repairJson(raw);
          data = JSON.parse(repaired);
        } catch (e) {
          // position 주변 컨텍스트 추출
          const posMatch = e.message.match(/position (\d+)/);
          const pos = posMatch ? parseInt(posMatch[1]) : null;
          const context = pos !== null
            ? raw.slice(Math.max(0, pos - 60), pos + 60)
            : raw.slice(0, 300);
          logEvent("Parser", "PARSE_ERROR", {
            error: e.message,
            error_position: pos,
            context_around_error: context,
            raw_length: raw.length,
          });
          throw e;
        }
        if (!Array.isArray(data.ingredients)) data.ingredients = [];
        logEvent("Parser", "PARSE_SUCCESS", {
          recipe_name: data.name,
          ingredient_count: data.ingredients.length,
          has_oven: !!data.oven,
          parsed_json: data,
        });
        setParsed(data);
        setStatus("done");
        logEvent("Parser", "RENDER_SUCCESS", { phase: "PhaseParse" });
      })
      .catch((e) => {
        const msg = e?.message ?? String(e);
        setParseErr(msg);
        logEvent("Parser", "PARSE_ERROR", { error: msg });
        console.error("[PhaseParse] 실패:", msg);
        setStatus("error");
      });
  }, []);

  // ── Debug Panel ──────────────────────────────────────────────
  const DebugPanel = () => (
    <div style={{ marginTop: 16 }}>
      <button
        onClick={() => setShowDebug(d => !d)}
        style={{
          background: "none", border: `1px solid ${T.slate}`, borderRadius: 6,
          color: T.slate, fontSize: 11, padding: "4px 10px", cursor: "pointer",
        }}
      >
        {showDebug ? "▲ Debug 닫기" : "▼ Debug 패널 열기"}
      </button>
      {showDebug && (
        <div style={{ marginTop: 8, background: "#1E1E1E", borderRadius: 8, padding: 14, fontSize: 11, color: "#D4D4D4", overflowX: "auto" }}>
          <p style={{ margin: "0 0 6px", color: "#569CD6", fontWeight: 700 }}>// Sanitized Input</p>
          <pre style={{ margin: "0 0 14px", whiteSpace: "pre-wrap", color: "#CE9178" }}>
            {input.content?.slice(0, 600)}{input.content?.length > 600 ? "\n…(truncated)" : ""}
          </pre>
          <p style={{ margin: "0 0 6px", color: "#569CD6", fontWeight: 700 }}>// Parser Raw Response</p>
          <pre style={{ margin: "0 0 14px", whiteSpace: "pre-wrap", color: "#B5CEA8" }}>
            {rawResponse || "(응답 없음)"}
          </pre>
          {parseErr && (
            <>
              <p style={{ margin: "0 0 6px", color: "#F44747", fontWeight: 700 }}>// Parse Error</p>
              <pre style={{ margin: 0, whiteSpace: "pre-wrap", color: "#F44747" }}>{parseErr}</pre>
            </>
          )}
          {parsed && (
            <>
              <p style={{ margin: "14px 0 6px", color: "#569CD6", fontWeight: 700 }}>// Parsed JSON</p>
              <pre style={{ margin: 0, whiteSpace: "pre-wrap", color: "#DCDCAA" }}>
                {JSON.stringify(parsed, null, 2)}
              </pre>
            </>
          )}
        </div>
      )}
    </div>
  );

  if (status === "parsing") return (
    <Card style={{ textAlign: "center", padding: "40px 24px" }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>🔍</div>
      <p style={{ color: T.mocha, fontWeight: 600 }}>레시피 분석 중…</p>
      <p style={{ color: T.slate, fontSize: 13 }}>재료와 단계를 구조화하고 있습니다</p>
    </Card>
  );

  if (status === "error") return (
    <Card style={{ textAlign: "center", padding: "32px 24px", borderColor: T.red }}>
      <p style={{ color: T.red, fontWeight: 700 }}>파싱 실패</p>
      <p style={{ color: T.slate, fontSize: 13 }}>{parseErr}</p>
      <DebugPanel />
      <div style={{ marginTop: 12 }}>
        <Btn onClick={() => window.location.reload()} variant="ghost">처음으로</Btn>
      </div>
    </Card>
  );

  return (
    <div>
      <Card style={{ borderLeft: `4px solid ${T.gold}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h2 style={{ margin: 0, color: T.espresso, fontSize: 20 }}>{parsed.name}</h2>
            <p style={{ margin: "4px 0 0", color: T.slate, fontSize: 13 }}>
              {parsed.category} · {parsed.servings} · 오븐 {parsed.oven?.temp}°C {parsed.oven?.duration}분
            </p>
          </div>
          <span style={{ background: T.goldLight, color: T.mocha, borderRadius: 20, padding: "4px 12px", fontSize: 12, fontWeight: 700 }}>
            ✅ 파싱 완료
          </span>
        </div>
        <DebugPanel />
      </Card>

      <Card>
        <h3 style={{ margin: "0 0 14px", color: T.espresso, fontSize: 15 }}>📦 재료 목록 ({parsed.ingredients.length}종)</h3>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ borderBottom: `2px solid ${T.cream}` }}>
              {["재료명", "수량", "단위", "비고"].map((h) => (
                <th key={h} style={{ textAlign: "left", padding: "6px 8px", color: T.slate, fontWeight: 600, fontSize: 12 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {parsed.ingredients.map((ing, i) => (
              <tr key={i} style={{ borderBottom: `1px solid ${T.cream}` }}>
                <td style={{ padding: "8px", color: T.espresso, fontWeight: 500 }}>{ing.name}</td>
                <td style={{ padding: "8px", color: T.mocha }}>{ing.amount ?? "-"}</td>
                <td style={{ padding: "8px", color: T.slate }}>{ing.unit ?? "-"}</td>
                <td style={{ padding: "8px", color: T.slate, fontSize: 12 }}>{ing.note || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <div style={{ textAlign: "right" }}>
        <Btn onClick={() => onDone(parsed)}>가격 링크 생성 →</Btn>
      </div>
    </div>
  );
}

// ── PHASE 2: Price ─────────────────────────────────────────────
function PhasePrice({ parsed, onDone }) {
  return (
    <div>
      <Card style={{ borderLeft: `4px solid ${T.gold}` }}>
        <h3 style={{ margin: "0 0 4px", color: T.espresso }}>💰 재료 가격 비교</h3>
        <p style={{ margin: 0, fontSize: 13, color: T.slate }}>네이버쇼핑 바로가기 링크를 생성했습니다. 각 재료를 클릭해 가격을 확인하세요.</p>
        <div style={{ marginTop: 8, padding: "8px 12px", background: T.slateLight, borderRadius: 8, fontSize: 12, color: T.slate }}>
          ⚡ <strong>B안 예정:</strong> 추후 백엔드 연동 시 최저가·평균가 자동 수집으로 업그레이드됩니다
        </div>
      </Card>

      <Card>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {parsed.ingredients.map((ing, i) => (
            <div key={i} style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "10px 14px", background: T.parchment, borderRadius: 8,
            }}>
              <div>
                <span style={{ fontWeight: 600, color: T.espresso, fontSize: 14 }}>{ing.name}</span>
                <span style={{ color: T.slate, fontSize: 12, marginLeft: 8 }}>{ing.amount ?? ""}{ing.unit ?? ""}</span>
              </div>
              <a
                href={naverLink(ing.name)}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  padding: "6px 14px", background: "#03C75A", color: "#fff",
                  borderRadius: 6, fontSize: 12, fontWeight: 700,
                  textDecoration: "none", flexShrink: 0,
                }}
              >
                N 가격 보기
              </a>
            </div>
          ))}
        </div>
      </Card>

      <div style={{ textAlign: "right" }}>
        <Btn onClick={() => onDone()}>작업 지시서 생성 →</Btn>
      </div>
    </div>
  );
}

// ── PHASE 3: Knowledge + Checklist ────────────────────────────
function PhaseKnowledge({ parsed, onDone }) {
  const [status, setStatus] = useState("loading");
  const [knowledge, setKnowledge] = useState(null);
  const [checklist, setChecklist] = useState([]);
  const [retryCount, setRetryCount] = useState(0);

  // 스키마를 최대한 압축 — tips/warnings 각 3개, tasks 각 2개로 제한
  const SYSTEM = `전문 제과 파티시에. 순수 JSON만 반환. { 로 시작 } 로 끝. 마크다운 금지.
스키마:
{"tips":["string x3 이하"],"warnings":["string x2 이하"],"workflow":[{"phase":"string","tasks":["string x2 이하"],"timerMin":null}]}
규칙: workflow 정확히 5개(Mise en place/계량/반죽/굽기/식힘&마무리). 굽기 timerMin=숫자. 나머지 null. 문자열 안 큰따옴표 금지.`;

  const buildChecklist = (data) => {
    const list = [];
    data.workflow.forEach((ph) => {
      (ph.tasks ?? []).forEach((task) => {
        list.push({
          phase: ph.phase ?? "기타",
          task,
          done: false,
          timerMin: typeof ph.timerMin === "number" ? ph.timerMin : null,
        });
      });
    });
    return list;
  };

  const applyFallback = (data) => {
    if (!Array.isArray(data.tips)) data.tips = [];
    if (!Array.isArray(data.warnings)) data.warnings = [];
    if (!Array.isArray(data.workflow) || data.workflow.length === 0) {
      data.workflow = [
        { phase: "Mise en place", tasks: ["재료를 꺼내 한곳에 모읍니다", "도구를 준비합니다"], timerMin: null },
        { phase: "계량", tasks: ["모든 재료를 정확히 계량합니다"], timerMin: null },
        { phase: "반죽", tasks: ["레시피 순서대로 재료를 혼합합니다"], timerMin: null },
        { phase: "굽기", tasks: ["예열된 오븐에 굽습니다"], timerMin: parsed.oven?.duration ?? 15 },
        { phase: "식힘 & 마무리", tasks: ["완전히 식힌 후 마무리합니다"], timerMin: null },
      ];
    }
    return data;
  };

  const run = async () => {
    const MAX_RETRY = 2;
    let lastUsage = null;
    let finalTruncated = false;

    for (let attempt = 0; attempt <= MAX_RETRY; attempt++) {
      const ingredientList = parsed.ingredients?.length
        ? parsed.ingredients.map(i => i.name).join(", ")
        : "재료 정보 없음";

      const userContent = `레시피:${parsed.name}(${parsed.category ?? "제과"}) 오븐:${parsed.oven?.temp ?? 180}°C ${parsed.oven?.duration ?? 15}분 재료:${ingredientList}`;

      logEvent("Knowledge", attempt === 0 ? "START" : "RETRY", {
        attempt,
        max_retry: MAX_RETRY,
        recipe_name: parsed.name,
        ingredient_count: parsed.ingredients?.length ?? 0,
      });

      let raw, truncated, usage;
      try {
        ({ text: raw, truncated, usage } = await callClaude(
          [{ role: "user", content: userContent }],
          SYSTEM,
          "Knowledge",
          4096
        ));
      } catch (e) {
        logEvent("Knowledge", "FETCH_ERROR", { error: e?.message, attempt });
        if (attempt === MAX_RETRY) { setStatus("error"); return; }
        continue;
      }

      lastUsage = usage;
      finalTruncated = truncated;
      setRetryCount(attempt);

      if (truncated && attempt < MAX_RETRY) {
        logEvent("Knowledge", "RETRY", {
          reason: "TRUNCATION",
          attempt,
          output_tokens: usage?.output_tokens,
          response_tail: raw.slice(-100),
        });
        continue; // 재시도
      }

      // ── 파싱 시도
      let data;
      try {
        const repaired = repairJson(raw);
        data = JSON.parse(repaired);
      } catch (e) {
        const posMatch = e.message.match(/position (\d+)/);
        const pos = posMatch ? parseInt(posMatch[1]) : null;
        logEvent("Knowledge", "PARSE_ERROR", {
          error: e.message,
          error_position: pos,
          context_around_error: pos !== null ? raw.slice(Math.max(0, pos - 60), pos + 60) : raw.slice(-300),
          truncated,
          attempt,
          output_tokens: usage?.output_tokens,
        });

        if (attempt < MAX_RETRY) continue; // 재시도

        // 최종 실패 → fallback
        logEvent("Knowledge", "FALLBACK_APPLIED", { reason: "PARSE_FAILED_ALL_ATTEMPTS" });
        data = {};
      }

      data = applyFallback(data);
      const list = buildChecklist(data);

      logEvent("Knowledge", "PARSE_SUCCESS", {
        attempt,
        tips_count: data.tips.length,
        warnings_count: data.warnings.length,
        workflow_phases: data.workflow.map(p => ({ phase: p.phase, tasks: p.tasks?.length, timerMin: p.timerMin })),
        checklist_items: list.length,
        final_output_tokens: lastUsage?.output_tokens,
        final_truncated: finalTruncated,
        retry_count: attempt,
      });

      setKnowledge(data);
      setChecklist(list);
      setStatus("done");
      logEvent("Knowledge", "RENDER_SUCCESS", {
        checklist_items: list.length,
        retry_count: attempt,
        final_output_tokens: lastUsage?.output_tokens,
        truncated: finalTruncated,
      });
      return; // 성공 종료
    }

    // 루프 소진 → 에러
    setStatus("error");
    logEvent("Knowledge", "EXHAUSTED_RETRIES", { max_retry: MAX_RETRY, final_output_tokens: lastUsage?.output_tokens });
  };

  useEffect(() => { run(); }, []);

  if (status === "loading") return (
    <Card style={{ textAlign: "center", padding: "40px 24px" }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>📚</div>
      <p style={{ color: T.mocha, fontWeight: 600 }}>
        {retryCount > 0 ? "응답이 잘려 재시도 중…" : "전문 지식 & 작업 지시서 생성 중…"}
      </p>
      {retryCount > 0 && <p style={{ color: T.slate, fontSize: 13 }}>Retry #{retryCount}</p>}
    </Card>
  );

  if (status === "error") return (
    <Card style={{ borderColor: T.red }}>
      <p style={{ color: T.red, fontWeight: 700 }}>Knowledge Layer 오류</p>
      <p style={{ color: T.slate, fontSize: 13 }}>로그 뷰어에서 상세 원인을 확인하세요.</p>
      <Btn onClick={() => { setStatus("loading"); setRetryCount(0); run(); }} variant="ghost" style={{ marginTop: 8 }}>
        수동 재시도
      </Btn>
    </Card>
  );

  if (status === "loading") return (
    <Card style={{ textAlign: "center", padding: "40px 24px" }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>📚</div>
      <p style={{ color: T.mocha, fontWeight: 600 }}>전문 지식 & 작업 지시서 생성 중…</p>
    </Card>
  );

  if (status === "error") return (
    <Card><p style={{ color: T.red }}>생성 실패. 다시 시도해주세요.</p></Card>
  );

  return (
    <div>
      <Card style={{ borderLeft: `4px solid ${T.gold}` }}>
        <h3 style={{ margin: "0 0 12px", color: T.espresso }}>🌡️ 전문 제과 지식</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {knowledge.tips.map((t, i) => (
            <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
              <span style={{ color: T.gold, fontSize: 16, flexShrink: 0 }}>✦</span>
              <span style={{ fontSize: 14, color: T.espresso }}>{t}</span>
            </div>
          ))}
        </div>
        {knowledge.warnings.length > 0 && (
          <div style={{ marginTop: 14, padding: "12px 14px", background: T.redLight, borderRadius: 8 }}>
            <p style={{ margin: "0 0 6px", fontWeight: 700, color: T.red, fontSize: 13 }}>⚠️ 주의사항</p>
            {knowledge.warnings.map((w, i) => (
              <p key={i} style={{ margin: "4px 0", fontSize: 13, color: T.red }}>{w}</p>
            ))}
          </div>
        )}
      </Card>

      <div style={{ textAlign: "right" }}>
        <Btn onClick={() => onDone(checklist, knowledge)}>실행 어시스턴트 시작 →</Btn>
      </div>
    </div>
  );
}

// ── PHASE 4: Execution ─────────────────────────────────────────
function PhaseExecution({ parsed, checklist: initialList, knowledge }) {
  const [list, setList] = useState(initialList);
  const [timerSec, setTimerSec] = useState(null);
  const [timerRunning, setTimerRunning] = useState(false);
  const [activeTimer, setActiveTimer] = useState(null);
  const intervalRef = useRef(null);

  const done = list.filter((i) => i.done).length;
  const pct = Math.round((done / list.length) * 100);

  const toggle = (idx) => {
    setList((prev) => prev.map((item, i) => i === idx ? { ...item, done: !item.done } : item));
  };

  const startTimer = (minutes) => {
    clearInterval(intervalRef.current);
    setTimerSec(minutes * 60);
    setActiveTimer(minutes);
    setTimerRunning(true);
  };

  useEffect(() => {
    if (timerRunning && timerSec > 0) {
      intervalRef.current = setInterval(() => setTimerSec((s) => {
        if (s <= 1) { setTimerRunning(false); clearInterval(intervalRef.current); return 0; }
        return s - 1;
      }), 1000);
    }
    return () => clearInterval(intervalRef.current);
  }, [timerRunning]);

  // Group checklist by phase
  const phases = [];
  list.forEach((item) => {
    const last = phases[phases.length - 1];
    if (!last || last.phase !== item.phase) phases.push({ phase: item.phase, items: [], timerMin: item.timerMin });
    phases[phases.length - 1].items.push(item);
  });

  return (
    <div>
      {/* Progress */}
      <Card style={{ borderLeft: `4px solid ${pct === 100 ? T.green : T.gold}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <h3 style={{ margin: 0, color: T.espresso, fontSize: 15 }}>진행률</h3>
          <span style={{ fontWeight: 800, color: pct === 100 ? T.green : T.gold, fontSize: 18 }}>{pct}%</span>
        </div>
        <div style={{ background: T.cream, borderRadius: 99, height: 10, overflow: "hidden" }}>
          <div style={{
            height: "100%", borderRadius: 99,
            background: pct === 100 ? T.green : T.gold,
            width: `${pct}%`, transition: "width .3s",
          }} />
        </div>
        <p style={{ margin: "8px 0 0", fontSize: 12, color: T.slate }}>{done} / {list.length} 완료</p>
      </Card>

      {/* Timer */}
      {timerSec !== null && (
        <Card style={{ background: timerSec === 0 ? T.greenLight : T.parchment, borderColor: timerSec === 0 ? T.green : T.gold }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <p style={{ margin: 0, fontSize: 12, color: T.slate }}>⏱️ 타이머 ({activeTimer}분)</p>
              <p style={{ margin: "4px 0 0", fontSize: 32, fontWeight: 800, color: timerSec === 0 ? T.green : T.espresso, fontVariantNumeric: "tabular-nums" }}>
                {timerSec === 0 ? "✅ 완료!" : fmtTime(timerSec)}
              </p>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {timerSec > 0 && (
                <Btn onClick={() => setTimerRunning((r) => !r)} variant="ghost" style={{ fontSize: 12 }}>
                  {timerRunning ? "⏸ 일시정지" : "▶ 재개"}
                </Btn>
              )}
              <Btn onClick={() => { setTimerSec(null); setTimerRunning(false); clearInterval(intervalRef.current); }} variant="danger" style={{ fontSize: 12 }}>
                중지
              </Btn>
            </div>
          </div>
        </Card>
      )}

      {/* Checklist by phase */}
      {phases.map((ph, pi) => {
        const phDone = ph.items.every((i) => i.done);
        return (
          <Card key={pi} style={{ borderLeft: `3px solid ${phDone ? T.green : T.cream}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h4 style={{ margin: 0, color: phDone ? T.green : T.espresso, fontSize: 14 }}>
                {phDone ? "✅" : "○"} {ph.phase}
              </h4>
              {ph.timerMin && (
                <Btn onClick={() => startTimer(ph.timerMin)} variant="ghost" style={{ fontSize: 11, padding: "5px 12px" }}>
                  ⏱️ {ph.timerMin}분 타이머
                </Btn>
              )}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {ph.items.map((item, ii) => {
                const globalIdx = list.indexOf(item);
                return (
                  <div
                    key={ii}
                    onClick={() => toggle(globalIdx)}
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "8px 10px", borderRadius: 8, cursor: "pointer",
                      background: item.done ? T.greenLight : T.parchment,
                      transition: "background .15s",
                    }}
                  >
                    <div style={{
                      width: 20, height: 20, borderRadius: 6, flexShrink: 0,
                      border: `2px solid ${item.done ? T.green : T.slate}`,
                      background: item.done ? T.green : "transparent",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      {item.done && <span style={{ color: "#fff", fontSize: 12 }}>✓</span>}
                    </div>
                    <span style={{ fontSize: 14, color: item.done ? T.green : T.espresso, textDecoration: item.done ? "line-through" : "none" }}>
                      {item.task}
                    </span>
                  </div>
                );
              })}
            </div>
          </Card>
        );
      })}

      {pct === 100 && (
        <Card style={{ background: T.greenLight, borderColor: T.green, textAlign: "center", padding: "28px 24px" }}>
          <div style={{ fontSize: 40 }}>🎉</div>
          <h3 style={{ color: T.green, margin: "8px 0 4px" }}>완성!</h3>
          <p style={{ color: T.green, fontSize: 14, margin: 0 }}>{parsed.name} 완성을 축하합니다</p>
        </Card>
      )}
    </div>
  );
}

// ── Root ───────────────────────────────────────────────────────
const PHASE_LABELS = ["입력", "파싱", "가격", "지식", "실행"];

export default function BakingOS() {
  const [phase, setPhase] = useState(0);
  const [input, setInput] = useState(null);
  const [parsed, setParsed] = useState(null);
  const [checklist, setChecklist] = useState([]);
  const [knowledge, setKnowledge] = useState(null);

  return (
    <div style={{
      minHeight: "100vh", background: T.parchment,
      fontFamily: "'Pretendard', 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif",
      padding: "24px 16px",
    }}>
      <LogViewer />
      <div style={{ maxWidth: 680, margin: "0 auto" }}>
        {phase > 0 && <Stepper steps={PHASE_LABELS} current={phase} />}

        {phase === 0 && (
          <PhaseInput onSubmit={(inp) => { setInput(inp); setPhase(1); }} />
        )}
        {phase === 1 && (
          <PhaseParse input={input} onDone={(p) => { setParsed(p); setPhase(2); }} />
        )}
        {phase === 2 && (
          <PhasePrice parsed={parsed} onDone={() => setPhase(3)} />
        )}
        {phase === 3 && (
          <PhaseKnowledge parsed={parsed} onDone={(cl, kn) => { setChecklist(cl); setKnowledge(kn); setPhase(4); }} />
        )}
        {phase === 4 && (
          <PhaseExecution parsed={parsed} checklist={checklist} knowledge={knowledge} />
        )}

        {phase > 0 && phase < 4 && (
          <div style={{ marginTop: 8 }}>
            <Btn onClick={() => setPhase((p) => p - 1)} variant="ghost" style={{ fontSize: 13 }}>← 이전</Btn>
          </div>
        )}
      </div>
    </div>
  );
}
