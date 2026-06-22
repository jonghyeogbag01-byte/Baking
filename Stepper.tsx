"use client";

interface StepperProps {
  steps: string[];
  current: number;
}

export default function Stepper({ steps, current }: StepperProps) {
  return (
    <div className="flex mb-8">
      {steps.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <div key={i} className="flex flex-col items-center flex-1">
            <div className="flex items-center w-full">
              {i > 0 && (
                <div className={`flex-1 h-0.5 ${done ? "bg-gold" : "bg-cream"}`} />
              )}
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0
                  ${done ? "bg-gold text-white" : active ? "bg-espresso text-white ring-2 ring-gold" : "bg-cream text-slate-500"}`}
              >
                {done ? "✓" : i + 1}
              </div>
              {i < steps.length - 1 && (
                <div className={`flex-1 h-0.5 ${done ? "bg-gold" : "bg-cream"}`} />
              )}
            </div>
            <span className={`text-[10px] mt-1 text-center leading-tight
              ${active ? "text-espresso font-semibold" : "text-slate-400"}`}>
              {s}
            </span>
          </div>
        );
      })}
    </div>
  );
}
