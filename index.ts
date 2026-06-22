// ── Recipe ─────────────────────────────────────────────────────
export interface Ingredient {
  name: string;
  amount: string;   // "100", "180~200", "약간" 등 원문 그대로
  unit: string;
  note: string;
}

export interface OvenConfig {
  temp: number;
  duration: number;
  mode: string;
}

export interface ParsedRecipe {
  name: string;
  servings: string;
  category: string;
  ingredients: Ingredient[];
  oven: OvenConfig;
}

// ── Knowledge ──────────────────────────────────────────────────
export interface WorkflowPhase {
  phase: string;
  tasks: string[];
  timerMin: number | null;
}

export interface Knowledge {
  tips: string[];
  warnings: string[];
  workflow: WorkflowPhase[];
}

// ── Checklist ──────────────────────────────────────────────────
export interface ChecklistItem {
  phase: string;
  task: string;
  done: boolean;
  timerMin: number | null;
}

// ── API Response ───────────────────────────────────────────────
export interface ApiResponse<T> {
  data?: T;
  error?: string;
  truncated?: boolean;
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
}
