"use client";

import { useEffect, useState } from "react";
import type { ParsedRecipe, Knowledge, ChecklistItem } from "@/types";

function buildChecklist(knowledge: Knowledge): ChecklistItem[] {
  const list: ChecklistItem[] = [];
  knowledge.workflow.forEach((ph) => {
    (ph.tasks ?? []).forEach((task) => {
      list.push({ phase: ph.phase ?? "기타", task, done: false, timerMin: ph.timerMin ?? null });
    });
  });
  return list;
}

export default function PhaseKnowledge({
  parsed,
  onDone,
}: {
  parsed: ParsedRecipe;
  onDone: (knowledge: Knowledge, checklist: ChecklistItem[]) => void;
}) {
  const [status, setStatus] = useState<"loading" | "done" | "error">("loading");
  const [knowledge, setKnowledge] = useState<Knowledge | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [err, setErr] = useState("");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      for (let attempt = 0; attempt <= 2; attempt++) {
        if (cancelled) return;
        if (attempt > 0) setRetryCount(attempt);

        try {
          const res = await fetch("/api/knowledge", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ recipe: parsed }),
          });
          const json = await res.json();
          if (cancelled) return;

          if (json.error) throw new Error(json.error);
          if (json.truncated && attempt < 2) continue; // 재시도

          setKnowledge(json.data);
          setStatus("done");
          return;
        } catch (e) {
          if (attempt === 2) {
            setErr(e instanceof Error ? e.message : "서버 오류");
            setStatus("error");
          }
        }
      }
    })();

    return () => { cancelled = true; };
  }, []);

  if (status === "loading") return (
    <div className="bg-white rounded-xl border border-cream p-10 text-center shadow-sm">
      <div className="text-4xl mb-3">📚</div>
      <p className="font-semibold text-mocha">
        {retryCount > 0 ? `재시도 중… (${retryCount}/2)` : "작업 지시서 생성 중…"}
      </p>
      <p className="text-sm text-slate-400 mt-1">전문 제과 지식과 단계별 체크리스트를 만들고 있습니다</p>
    </div>
  );

  if (status === "error") return (
    <div className="bg-white rounded-xl border border-red-200 p-6 shadow-sm">
      <p className="text-red-600 font-semibold">Knowledge Layer 오류</p>
      <p className="text-slate-500 text-sm mt-1">{err}</p>
    </div>
  );

  if (!knowledge) return null;

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border-l-4 border-l-gold border border-cream p-5 shadow-sm">
        <h3 className="font-semibold text-espresso mb-3">🌡️ 전문 제과 지식</h3>
        <ul className="space-y-2">
          {knowledge.tips.map((t, i) => (
            <li key={i} className="flex gap-2 text-sm text-espresso">
              <span className="text-gold shrink-0">✦</span>{t}
            </li>
          ))}
        </ul>
        {knowledge.warnings.length > 0 && (
          <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-700 text-xs font-bold mb-1">⚠️ 주의사항</p>
            {knowledge.warnings.map((w, i) => (
              <p key={i} className="text-red-600 text-xs">{w}</p>
            ))}
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <button
          onClick={() => onDone(knowledge, buildChecklist(knowledge))}
          className="px-5 py-2 bg-gold text-white text-sm font-bold rounded-lg hover:opacity-90 transition"
        >
          실행 어시스턴트 시작 →
        </button>
      </div>
    </div>
  );
}
