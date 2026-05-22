# AI Task Dashboard

AI Readiness Framework 기반의 업무 추적 대시보드입니다.
Task 입력 시 Claude API가 자동으로 Framework 카테고리를 분류합니다.

## 기술 스택

- React 18 + Vite
- Anthropic Claude API (claude-sonnet-4-20250514)
- localStorage (프로토타입 단계, 추후 DB 연동 예정)

---

## 빠른 시작

```bash
# 1. 의존성 설치
npm install

# 2. 환경변수 설정
cp .env.example .env
# .env 파일을 열어 VITE_ANTHROPIC_API_KEY 입력

# 3. 개발 서버 실행
npm run dev
# → http://localhost:3000
```

---

## 프로젝트 구조

```
ai-task-dashboard/
├── src/
│   ├── main.jsx          # 진입점
│   └── App.jsx           # 메인 앱 (대시보드 + 폼 + 상세)
├── index.html
├── vite.config.js
├── package.json
├── .env.example          # API 키 설정 템플릿
└── .gitignore
```

---

## 화면 구성

| 화면 | 설명 |
|------|------|
| 대시보드 | 카테고리별 KPI + 상태 필터 + Task 목록 |
| Task 등록 | 웹 폼 입력 → 저장 시 LLM 자동 분류 |
| Task 상세 | 분류 결과 + 기본 정보 + MD 다운로드 |

---

## AI Readiness Framework 분류 체계

| 카테고리 | 세부 항목 수 |
|----------|-------------|
| Process | 5개 |
| Data | 6개 |
| Infra | 7개 |
| AI Application | 8개 |
| Governance | 8개 |

Task 저장 시 `primary_category` + `secondary_category`로 이중 분류되며,
분류 근거(`classification_note`)가 함께 저장됩니다.

---

## MD Export

각 Task는 대시보드 목록의 `↓` 버튼 또는 상세 화면에서 MD 파일로 다운로드할 수 있습니다.
YAML frontmatter 포함 형식으로 추후 DB 마이그레이션에 활용 가능합니다.

---

## Claude Code에서 작업할 때

```bash
# Framework 카테고리 수정
# src/App.jsx 상단의 FRAMEWORK 객체를 수정하세요.

# 빌드
npm run build

# 미리보기
npm run preview
```

### 주요 확장 포인트

- `src/App.jsx` > `classifyWithLLM()` — 분류 프롬프트 수정
- `src/App.jsx` > `FRAMEWORK` — 카테고리/세부항목 수정
- `src/App.jsx` > `taskToMarkdown()` — MD export 형식 수정
- `localStorage` → API 교체 시 `handleSave()` 내 저장 로직만 변경
