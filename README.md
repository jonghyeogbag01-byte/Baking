# Baking OS

레시피 붙여넣기 → 재료 추출 → 가격 링크 → 작업 지시서 → 실행 어시스턴트

## 폴더 구조

```
baking-os/
├── app/
│   ├── layout.tsx
│   ├── page.tsx              # 5단계 플로우 오케스트레이터
│   ├── globals.css
│   └── api/
│       ├── parse/route.ts    # POST /api/parse  (Recipe Parser)
│       └── knowledge/route.ts# POST /api/knowledge (Knowledge + Workflow)
├── components/
│   ├── phases/
│   │   ├── PhaseInput.tsx
│   │   ├── PhaseParse.tsx
│   │   ├── PhasePrice.tsx
│   │   ├── PhaseKnowledge.tsx
│   │   └── PhaseExecution.tsx
│   └── ui/
│       └── Stepper.tsx
├── lib/
│   ├── claude.ts             # ⚠️ 서버 전용 — API Key 사용
│   ├── sanitize.ts           # 입력 정제 (서버/클라이언트 공용)
│   ├── repairJson.ts         # JSON 복구 (서버 전용)
│   └── prompts.ts            # LLM 시스템 프롬프트
├── types/
│   └── index.ts              # 공유 타입
├── .env.example
└── .env.local                # ⚠️ git 제외
```

## 로컬 실행

### 1. 저장소 클론 및 의존성 설치

```bash
git clone https://github.com/YOUR_ID/baking-os.git
cd baking-os
npm install
```

### 2. 환경변수 설정

```bash
cp .env.example .env.local
# .env.local 에 ANTHROPIC_API_KEY 값 입력
```

```
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxxxxxxxxxxxxx
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 3. 개발 서버 실행

```bash
npm run dev
# http://localhost:3000 접속
```

### 4. 빌드 확인

```bash
npm run build
npm run start
```

---

## Vercel 배포

### 방법 A — GitHub 연동 (권장)

```bash
# 1. GitHub 레포 생성 후 push
git init
git add .
git commit -m "init: Baking OS"
gh repo create baking-os --public --push

# 2. Vercel 대시보드 → Add New Project → GitHub 레포 선택
# 3. Environment Variables 에 아래 항목 추가:
#    ANTHROPIC_API_KEY = sk-ant-xxx
# 4. Deploy 클릭
```

이후 main 브랜치에 push 할 때마다 자동 배포됩니다.

### 방법 B — Vercel CLI

```bash
npm i -g vercel
vercel login
vercel                # 첫 배포 (대화형 설정)
vercel --prod         # 프로덕션 배포
```

### 환경변수 등록 (Vercel 대시보드)

```
Settings → Environment Variables
ANTHROPIC_API_KEY  →  sk-ant-xxx  →  Production / Preview / Development 모두 체크
```

---

## API 명세

### POST /api/parse

**Request**
```json
{ "content": "레시피 본문 텍스트" }
```

**Response**
```json
{
  "data": {
    "name": "마들렌",
    "servings": "12개",
    "category": "마들렌",
    "ingredients": [
      { "name": "버터", "amount": "100", "unit": "g", "note": "" }
    ],
    "oven": { "temp": 180, "duration": 12, "mode": "컨벡션" }
  },
  "truncated": false,
  "usage": { "input_tokens": 312, "output_tokens": 180 }
}
```

### POST /api/knowledge

**Request**
```json
{ "recipe": { ...ParsedRecipe } }
```

**Response**
```json
{
  "data": {
    "tips": ["버터는 태우지 않도록 주의"],
    "warnings": ["반죽 휴지 생략 시 모양이 나오지 않음"],
    "workflow": [
      { "phase": "Mise en place", "tasks": ["재료 꺼내기", "틀 버터칠"], "timerMin": null },
      { "phase": "굽기", "tasks": ["180°C 12분"], "timerMin": 12 }
    ]
  },
  "truncated": false,
  "usage": { "input_tokens": 280, "output_tokens": 340 }
}
```

---

## 아키텍처 원칙

- **API Key 보안**: `ANTHROPIC_API_KEY`는 `lib/claude.ts`(서버)에서만 사용. `NEXT_PUBLIC_` 접두사 없음 → 브라우저 노출 불가
- **클라이언트 → 서버**: 모든 AI 호출은 `/api/*` 경유
- **DB 없음**: 상태는 React state로 관리 (세션 종료 시 초기화)

## 향후 확장

- [ ] Supabase — 레시피 저장 및 URL 공유
- [ ] Naver Shopping API — 실시간 가격 수집 (`/api/price`)
- [ ] Supabase Auth — 내 레시피함
- [ ] PDF 출력 — 작업 지시서 다운로드
