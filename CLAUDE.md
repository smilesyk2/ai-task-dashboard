# CLAUDE.md

이 파일은 Claude Code(claude.ai/code)가 이 저장소에서 작업할 때 참고하는 가이드입니다.

## 명령어

```bash
npm install          # 의존성 설치
npm run dev          # 개발 서버 실행 (http://localhost:3000)
npm run build        # 프로덕션 빌드 (dist/ 폴더 생성)
npm run preview      # 프로덕션 빌드 로컬 미리보기
```

테스트 러너 및 린터는 설정되어 있지 않습니다.

## 환경 설정

`.env.example`을 `.env`로 복사한 뒤 `VITE_ANTHROPIC_API_KEY`에 Anthropic API 키를 입력하세요. 이 키가 없으면 Task 저장 시 LLM 분류 단계에서 오류가 발생합니다.

## 아키텍처

**단일 파일 React 앱**으로, 상태 관리·UI 렌더링·API 호출·비즈니스 로직이 모두 `src/App.jsx`에 있습니다. 라우팅 라이브러리, 상태 관리 라이브러리, 파일 분리된 컴포넌트는 없습니다.

### 뷰 상태 머신

`view` 상태 문자열 하나로 세 가지 화면을 제어합니다:
- `"dashboard"` — KPI 카드 + 상태 필터 바 + Task 목록 테이블
- `"form"` — Task 등록 폼
- `"detail"` — Task 상세 화면 (`view = "detail"` + `selectedTask` 동시 설정으로 진입)

화면 이동은 `navTo()`를 사용하며 사이드 상태를 초기화합니다. 상세 화면은 `navTo()` 없이 `selectedTask`를 직접 설정해 진입합니다.

### 데이터 흐름

1. 사용자가 폼 작성 (`form` 상태, 초기값은 `emptyForm()`으로 정의)
2. 저장 시 `classifyWithLLM(form)`이 브라우저에서 직접 Anthropic API 호출 (`anthropic-dangerous-direct-browser-calls: true` 헤더 사용 — 프로토타입 단계에서 의도된 방식)
3. LLM이 `primary_category`, `primary_code`, `primary_sub`, `secondary_*`, `classification_note`가 담긴 JSON 반환
4. 반환된 분류 결과가 task 객체에 합쳐져 `tasks` 배열 맨 앞에 추가됨
5. `tasks`는 변경될 때마다 `useEffect`를 통해 `localStorage`에 저장

### Task 데이터 모델

```js
{
  id: "TASK-001",               // 자동 생성, 순번
  title, requester, owner,
  due_date, status, priority,   // "대기중"|"진행중"|"검토중"|"완료"|"보류"
  effort_estimate,              // "S"|"M"|"L"|"XL"
  tags,                         // string[] (쉼표 구분 입력값을 분리)
  background, request, as_is, to_be, constraints,
  created_date,                 // ISO 날짜 문자열
  history,                      // [{ date, content, author }]
  // LLM이 추가하는 필드:
  primary_category, primary_code, primary_sub,
  secondary_category, secondary_code, secondary_sub,
  classification_note,
}
```

### FRAMEWORK 상수

`App.jsx` 상단의 `FRAMEWORK`가 모든 분류 카테고리의 원천입니다:
- 5개 최상위 카테고리: Process, Data, Infra, AI Application, Governance
- 각 카테고리에 `color`, `bg`(선택 시 어두운 배경), `items[]`(세부 분류명) 정의

`CATEGORY_CODES`는 카테고리명을 단일 문자 접두어(P/D/I/A/G)로 매핑해 `A-05` 형태의 코드를 생성합니다.

`FRAMEWORK` 전체 텍스트가 분류 시 LLM 프롬프트에 그대로 주입되므로, `FRAMEWORK`를 수정하면 UI와 분류 동작이 동시에 바뀝니다.

### 주요 확장 포인트

| 변경 내용 | 위치 |
|---|---|
| 분류 프롬프트 / 모델 | `App.jsx`의 `classifyWithLLM()` |
| 카테고리/세부 분류 정의 | `App.jsx` 상단의 `FRAMEWORK` 객체 |
| MD 익스포트 형식 | `App.jsx`의 `taskToMarkdown()` |
| 저장소 교체 (localStorage → API) | `handleSave()`와 `tasks`의 `useEffect` |
| Task ID 체계 | `handleSave()` — 현재 `tasks.length + 1` 제로패딩 방식 |

### 스타일링

모든 스타일은 인라인 또는 컴포넌트 내부 `<style>` 태그로 주입됩니다. CSS 파일이나 스타일링 라이브러리는 없습니다. 공통 스타일은 `<style>` 블록에 CSS 클래스명으로 정의되어 있습니다 (`.card`, `.btn-primary`, `.inp`, `.pill`, `.task-row` 등).

컬러 팔레트는 다크모드 전용입니다: 배경 `#090e1a`, 카드 표면 `#0f1629`, 테두리 `#1e2d4a`. 각 Framework 카테고리의 강조색은 `FRAMEWORK`에 정의되어 있습니다.
