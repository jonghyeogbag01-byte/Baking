"use client";

import { useState } from "react";
import type { ParsedRecipe, Knowledge, ChecklistItem } from "@/types";
import PhaseInput from "@/components/phases/PhaseInput";
import PhaseParse from "@/components/phases/PhaseParse";
import PhasePrice from "@/components/phases/PhasePrice";
import PhaseKnowledge from "@/components/phases/PhaseKnowledge";
import PhaseExecution from "@/components/phases/PhaseExecution";
import Stepper from "@/components/ui/Stepper";

const STEPS = ["입력", "파싱", "가격", "지식", "실행"];

export default function Home() {
  const [phase, setPhase] = useState(0);
  const [rawInput, setRawInput] = useState("");
  const [parsed, setParsed] = useState<ParsedRecipe | null>(null);
  const [knowledge, setKnowledge] = useState<Knowledge | null>(null);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);

  return (
    <main className="min-h-screen px-4 py-8">
      <div className="max-w-2xl mx-auto">
        {phase > 0 && <Stepper steps={STEPS} current={phase} />}

        {phase === 0 && (
          <PhaseInput
            onSubmit={(content) => { setRawInput(content); setPhase(1); }}
          />
        )}
        {phase === 1 && (
          <PhaseParse
            content={rawInput}
            onDone={(p) => { setParsed(p); setPhase(2); }}
          />
        )}
        {phase === 2 && parsed && (
          <PhasePrice
            parsed={parsed}
            onDone={() => setPhase(3)}
          />
        )}
        {phase === 3 && parsed && (
          <PhaseKnowledge
            parsed={parsed}
            onDone={(k, cl) => { setKnowledge(k); setChecklist(cl); setPhase(4); }}
          />
        )}
        {phase === 4 && parsed && knowledge && (
          <PhaseExecution parsed={parsed} checklist={checklist} />
        )}

        {phase > 0 && phase < 4 && (
          <button
            onClick={() => setPhase((p) => p - 1)}
            className="mt-4 text-sm text-mocha underline"
          >
            ← 이전 단계
          </button>
        )}
      </div>
    </main>
  );
}
