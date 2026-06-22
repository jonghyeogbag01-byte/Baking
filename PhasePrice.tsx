"use client";

import type { ParsedRecipe } from "@/types";

function naverLink(name: string) {
  return `https://search.shopping.naver.com/search/all?query=${encodeURIComponent(name + " 제과재료")}`;
}

export default function PhasePrice({
  parsed,
  onDone,
}: {
  parsed: ParsedRecipe;
  onDone: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border-l-4 border-l-gold border border-cream p-5 shadow-sm">
        <h3 className="font-semibold text-espresso mb-1">💰 재료 가격 비교</h3>
        <p className="text-sm text-slate-500">네이버쇼핑 바로가기 링크를 생성했습니다.</p>
        <div className="mt-2 px-3 py-2 bg-slate-100 rounded-lg text-xs text-slate-500">
          ⚡ 추후 백엔드 연동 시 최저가·평균가 자동 수집으로 업그레이드됩니다
        </div>
      </div>

      <div className="bg-white rounded-xl border border-cream p-5 shadow-sm space-y-2">
        {parsed.ingredients.map((ing, i) => (
          <div key={i} className="flex items-center justify-between px-3 py-2 bg-parchment rounded-lg">
            <div>
              <span className="font-semibold text-espresso text-sm">{ing.name}</span>
              <span className="text-slate-400 text-xs ml-2">{ing.amount ?? ""}{ing.unit ?? ""}</span>
            </div>
            <a
              href={naverLink(ing.name)}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1 bg-[#03C75A] text-white text-xs font-bold rounded-md hover:opacity-90 transition shrink-0"
            >
              N 가격 보기
            </a>
          </div>
        ))}
      </div>

      <div className="flex justify-end">
        <button
          onClick={onDone}
          className="px-5 py-2 bg-gold text-white text-sm font-bold rounded-lg hover:opacity-90 transition"
        >
          작업 지시서 생성 →
        </button>
      </div>
    </div>
  );
}
