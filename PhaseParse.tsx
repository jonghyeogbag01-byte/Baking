"use client";

import { useEffect, useState } from "react";
import type { ParsedRecipe } from "@/types";

export default function PhaseParse({
  content,
  onDone,
}: {
  content: string;
  onDone: (parsed: ParsedRecipe) => void;
}) {
  const [status, setStatus] = useState<"loading" | "done" | "error">("loading");
  const [parsed, setParsed] = useState<ParsedRecipe | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    fetch("/api/parse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    })
      .then((r) => r.json())
      .then((res) => {
        if (res.error) throw new Error(res.error);
        setParsed(res.data);
        setStatus("done");
      })
      .catch((e) => {
        setErr(e.message ?? "파싱 실패");
        setStatus("error");
      });
  }, []);

  if (status === "loading") return (
    <div className="bg-white rounded-xl border border-cream p-10 text-center shadow-sm">
      <div className="text-4xl mb-3">🔍</div>
      <p className="font-semibold text-mocha">레시피 분석 중…</p>
      <p className="text-sm text-slate-400 mt-1">재료와 오븐 설정을 구조화하고 있습니다</p>
    </div>
  );

  if (status === "error") return (
    <div className="bg-white rounded-xl border border-red-200 p-6 shadow-sm">
      <p className="text-red-600 font-semibold">파싱 실패</p>
      <p className="text-slate-500 text-sm mt-1">{err}</p>
    </div>
  );

  if (!parsed) return null;

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border-l-4 border-l-gold border border-cream p-5 shadow-sm">
        <div className="flex justify-between items-start">
          <div>
            <h2 className="text-xl font-extrabold text-espresso">{parsed.name}</h2>
            <p className="text-sm text-slate-500 mt-1">
              {parsed.category} · {parsed.servings} · 오븐 {parsed.oven?.temp}°C {parsed.oven?.duration}분
            </p>
          </div>
          <span className="bg-gold-light text-mocha text-xs font-bold px-3 py-1 rounded-full">✅ 파싱 완료</span>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-cream p-5 shadow-sm">
        <h3 className="font-semibold text-espresso mb-3 text-sm">📦 재료 목록 ({parsed.ingredients.length}종)</h3>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b-2 border-cream text-xs text-slate-400">
              {["재료명", "수량", "단위", "비고"].map((h) => (
                <th key={h} className="text-left py-1.5 px-2 font-semibold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {parsed.ingredients.map((ing, i) => (
              <tr key={i} className="border-b border-cream">
                <td className="py-2 px-2 font-medium text-espresso">{ing.name}</td>
                <td className="py-2 px-2 text-mocha">{ing.amount || "-"}</td>
                <td className="py-2 px-2 text-slate-400">{ing.unit || "-"}</td>
                <td className="py-2 px-2 text-slate-400 text-xs">{ing.note || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end">
        <button
          onClick={() => onDone(parsed)}
          className="px-5 py-2 bg-gold text-white text-sm font-bold rounded-lg hover:opacity-90 transition"
        >
          가격 링크 생성 →
        </button>
      </div>
    </div>
  );
}
