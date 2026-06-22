"use client";

import { useState } from "react";
import { sanitizeInput } from "@/lib/sanitize";

const SAMPLES = {
  "🧁 마들렌": `마들렌 12개 기준\n재료:\n- 버터 100g\n- 설탕 90g\n- 달걀 2개\n- 박력분 100g\n- 베이킹파우더 3g\n- 꿀 10g\n- 레몬제스트 1개분\n\n만드는 법:\n1. 버터를 녹여 식힌다\n2. 달걀과 설탕을 섞는다\n3. 가루류를 넣고 섞은 후 냉장 1시간 휴지\n4. 180°C 오븐에서 12분 굽기`,
  "🫐 스콘": `스콘 8개 기준\n재료:\n- 박력분 250g\n- 버터 60g\n- 설탕 30g\n- 베이킹파우더 8g\n- 소금 3g\n- 달걀 1개\n- 우유 80~100ml\n\n만드는 법:\n1. 가루류를 체에 내린다\n2. 버터를 손으로 비벼 넣는다\n3. 달걀+우유를 넣고 뭉친다\n4. 200°C 오븐에서 18분 굽기`,
  "🍪 초코쿠키": `초코칩 쿠키 20개 기준\n재료:\n- 버터 115g\n- 황설탕 100g\n- 달걀 1개\n- 박력분 190g\n- 베이킹소다 3g\n- 초코칩 150g\n\n만드는 법:\n1. 버터와 설탕을 크림화한다\n2. 달걀을 넣고 섞는다\n3. 가루류를 넣고 초코칩 추가\n4. 175°C에서 12분 굽기`,
};

const URL_RE = /^https?:\/\//i;

export default function PhaseInput({ onSubmit }: { onSubmit: (content: string) => void }) {
  const [text, setText] = useState("");
  const [urlWarning, setUrlWarning] = useState(false);
  const [err, setErr] = useState("");

  const handleChange = (val: string) => {
    setText(val);
    setErr("");
    setUrlWarning(URL_RE.test(val.trim()));
  };

  const handleSubmit = () => {
    const raw = text.trim();
    if (!raw) return setErr("레시피 본문을 붙여넣어 주세요.");
    if (URL_RE.test(raw)) return setErr("URL은 지원되지 않습니다. 본문을 직접 복사해 붙여넣어 주세요.");
    onSubmit(sanitizeInput(raw));
  };

  return (
    <div className="max-w-xl mx-auto">
      <div className="text-center mb-8">
        <div className="text-5xl mb-3">🥐</div>
        <h1 className="text-2xl font-extrabold text-espresso">Baking OS</h1>
        <p className="text-mocha text-sm mt-2">레시피 붙여넣기 → 재료 추출 → 가격 비교 → 작업 지시서</p>
      </div>

      <div className="bg-white rounded-xl border border-cream p-5 shadow-sm">
        {/* 샘플 버튼 */}
        <p className="text-xs text-slate-500 font-semibold mb-2">샘플로 테스트</p>
        <div className="flex gap-2 flex-wrap mb-4">
          {Object.entries(SAMPLES).map(([label, content]) => (
            <button
              key={label}
              onClick={() => handleChange(content)}
              className="text-xs px-3 py-1.5 rounded-full border border-gold bg-gold-light text-mocha font-semibold hover:opacity-80 transition"
            >
              {label}
            </button>
          ))}
        </div>

        <div className="border-t border-cream mb-4" />

        <p className="text-xs text-slate-500 font-semibold mb-2">레시피 본문 붙여넣기</p>
        <textarea
          value={text}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="만개의레시피, 네이버 블로그 등에서 본문을 복사해 붙여넣으세요.&#10;&#10;지원 형식: 재료명+수량, 단계별 설명, 범위 수량(180~200g), 오븐 온도/시간"
          className={`w-full min-h-48 p-3 rounded-lg border text-sm bg-parchment text-espresso resize-y outline-none transition
            ${urlWarning ? "border-red-400" : "border-cream focus:border-gold"}`}
        />

        {urlWarning && (
          <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-700 text-xs font-semibold">⚠️ URL 가져오기는 현재 지원되지 않습니다</p>
            <p className="text-red-600 text-xs mt-1">레시피 본문 텍스트를 직접 복사해 붙여넣어 주세요. (URL 지원은 추후 추가 예정)</p>
          </div>
        )}

        {err && <p className="text-red-600 text-xs mt-2">{err}</p>}

        <div className="mt-4 flex items-center justify-between">
          <p className="text-xs text-slate-400">💡 URL fetch는 백엔드 연동 후 지원 예정</p>
          <button
            onClick={handleSubmit}
            disabled={urlWarning || !text.trim()}
            className="px-5 py-2 bg-gold text-white text-sm font-bold rounded-lg disabled:opacity-40 hover:opacity-90 transition"
          >
            분석 시작 →
          </button>
        </div>
      </div>
    </div>
  );
}
