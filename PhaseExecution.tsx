"use client";

import { useEffect, useRef, useState } from "react";
import type { ChecklistItem, ParsedRecipe } from "@/types";

function fmtTime(sec: number) {
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}

export default function PhaseExecution({
  parsed,
  checklist: initial,
}: {
  parsed: ParsedRecipe;
  checklist: ChecklistItem[];
}) {
  const [list, setList] = useState<ChecklistItem[]>(initial);
  const [timerSec, setTimerSec] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  const [activeMin, setActiveMin] = useState<number | null>(null);
  const interval = useRef<ReturnType<typeof setInterval> | null>(null);

  const done = list.filter((i) => i.done).length;
  const pct = Math.round((done / list.length) * 100);

  const toggle = (idx: number) =>
    setList((prev) => prev.map((item, i) => i === idx ? { ...item, done: !item.done } : item));

  const startTimer = (min: number) => {
    if (interval.current) clearInterval(interval.current);
    setTimerSec(min * 60);
    setActiveMin(min);
    setRunning(true);
  };

  useEffect(() => {
    if (running) {
      interval.current = setInterval(() => {
        setTimerSec((s) => {
          if (s === null || s <= 1) { setRunning(false); clearInterval(interval.current!); return 0; }
          return s - 1;
        });
      }, 1000);
    }
    return () => { if (interval.current) clearInterval(interval.current); };
  }, [running]);

  // Group by phase
  const phases: { phase: string; items: ChecklistItem[]; timerMin: number | null }[] = [];
  list.forEach((item) => {
    const last = phases[phases.length - 1];
    if (!last || last.phase !== item.phase) phases.push({ phase: item.phase, items: [], timerMin: item.timerMin });
    phases[phases.length - 1].items.push(item);
  });

  return (
    <div className="space-y-4">
      {/* Progress */}
      <div className={`bg-white rounded-xl border-l-4 border border-cream p-5 shadow-sm ${pct === 100 ? "border-l-green-600" : "border-l-gold"}`}>
        <div className="flex justify-between items-center mb-2">
          <h3 className="font-semibold text-espresso text-sm">진행률</h3>
          <span className={`text-lg font-extrabold ${pct === 100 ? "text-green-600" : "text-gold"}`}>{pct}%</span>
        </div>
        <div className="h-2.5 bg-cream rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ${pct === 100 ? "bg-green-600" : "bg-gold"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="text-xs text-slate-400 mt-1.5">{done} / {list.length} 완료</p>
      </div>

      {/* Timer */}
      {timerSec !== null && (
        <div className={`bg-white rounded-xl border p-5 shadow-sm ${timerSec === 0 ? "border-green-300" : "border-gold"}`}>
          <div className="flex justify-between items-center">
            <div>
              <p className="text-xs text-slate-400">⏱️ 타이머 ({activeMin}분)</p>
              <p className={`text-4xl font-extrabold tabular-nums ${timerSec === 0 ? "text-green-600" : "text-espresso"}`}>
                {timerSec === 0 ? "✅ 완료!" : fmtTime(timerSec)}
              </p>
            </div>
            <div className="flex gap-2">
              {timerSec > 0 && (
                <button
                  onClick={() => setRunning((r) => !r)}
                  className="text-xs px-3 py-1.5 border border-gold text-mocha rounded-lg font-semibold"
                >
                  {running ? "⏸" : "▶"}
                </button>
              )}
              <button
                onClick={() => { setTimerSec(null); setRunning(false); }}
                className="text-xs px-3 py-1.5 bg-red-600 text-white rounded-lg font-semibold"
              >
                중지
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Checklist */}
      {phases.map((ph, pi) => {
        const allDone = ph.items.every((i) => i.done);
        return (
          <div key={pi} className={`bg-white rounded-xl border border-cream p-5 shadow-sm border-l-4 ${allDone ? "border-l-green-500" : "border-l-cream"}`}>
            <div className="flex justify-between items-center mb-3">
              <h4 className={`font-semibold text-sm ${allDone ? "text-green-600" : "text-espresso"}`}>
                {allDone ? "✅" : "○"} {ph.phase}
              </h4>
              {ph.timerMin && (
                <button
                  onClick={() => startTimer(ph.timerMin!)}
                  className="text-xs px-3 py-1 border border-gold text-mocha rounded-lg font-semibold hover:bg-gold-light transition"
                >
                  ⏱️ {ph.timerMin}분 타이머
                </button>
              )}
            </div>
            <div className="space-y-2">
              {ph.items.map((item) => {
                const idx = list.indexOf(item);
                return (
                  <div
                    key={idx}
                    onClick={() => toggle(idx)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition
                      ${item.done ? "bg-green-50" : "bg-parchment hover:bg-cream"}`}
                  >
                    <div className={`w-5 h-5 rounded-md border-2 shrink-0 flex items-center justify-center
                      ${item.done ? "bg-green-600 border-green-600" : "border-slate-300"}`}>
                      {item.done && <span className="text-white text-xs font-bold">✓</span>}
                    </div>
                    <span className={`text-sm ${item.done ? "text-green-600 line-through" : "text-espresso"}`}>
                      {item.task}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {pct === 100 && (
        <div className="bg-green-50 border border-green-300 rounded-xl p-8 text-center shadow-sm">
          <div className="text-5xl mb-2">🎉</div>
          <h3 className="text-green-700 font-extrabold text-lg">완성!</h3>
          <p className="text-green-600 text-sm mt-1">{parsed.name} 완성을 축하합니다</p>
        </div>
      )}
    </div>
  );
}
