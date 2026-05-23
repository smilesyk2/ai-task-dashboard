import { useState, useEffect, useRef } from "react";
import * as XLSX from "xlsx";

// ── Framework 정의 ────────────────────────────────────────────────
const FRAMEWORK = {
  Process: {
    color: "#4ECDC4", bg: "#0d2e2c",
    items: ["업무 프로세스 재설계","현장 운영 방식 개선","Human-in-the-loop 운영","업무 자동화 프로세스","변화 관리 및 현업 정착"]
  },
  Data: {
    color: "#FFE66D", bg: "#2e2a0d",
    items: ["데이터 수집/연계","데이터 정제/표준화","데이터 통합/저장 구조","데이터 라벨링/어노테이션","지식 데이터/문서 자산화","피처/임베딩 자산관리"]
  },
  Infra: {
    color: "#A8E6CF", bg: "#0d2e1a",
    items: ["클라우드/서버/GPU 인프라","AI/ML 플랫폼","데이터 플랫폼 인프라","IT/OT 연계 인프라","API/서비스 연계 인프라","DevOps/MLOps 운영 인프라","보안 인프라"]
  },
  "AI Application": {
    color: "#FF6B9D", bg: "#2e0d1a",
    items: ["예측 모델","최적화 모델","Vision AI","NLP/텍스트 분석","GenAI/RAG 서비스","AI Agent","추천/개인화 서비스","모델 운영/성능 개선"]
  },
  Governance: {
    color: "#C3A6FF", bg: "#1a0d2e",
    items: ["AI 거버넌스","데이터 거버넌스","거버넌스 조직/역할체계","권한/접근 통제 정책","보안/개인정보/컴플라이언스","모델 리스크 관리","표준/가이드라인","성과/투자관리 기준"]
  }
};

const CATEGORY_CODES = {
  Process: "P", Data: "D", Infra: "I", "AI Application": "A", Governance: "G"
};

const STATUS_STYLES = {
  "대기중":  { color: "#94a3b8", dot: "#64748b" },
  "진행중":  { color: "#60a5fa", dot: "#3b82f6" },
  "검토중":  { color: "#fb923c", dot: "#f97316" },
  "완료":    { color: "#4ade80", dot: "#22c55e" },
  "보류":    { color: "#f87171", dot: "#ef4444" },
};

const PRIORITY_COLORS = { High: "#ff4d6d", Medium: "#ffd60a", Low: "#4cc9f0" };
const TASK_TYPES = ["과제", "미팅", "POC", "파일럿"];

// ── LLM 분류 호출 ────────────────────────────────────────────────
async function classifyWithLLM(taskData) {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("VITE_ANTHROPIC_API_KEY가 설정되지 않았습니다. .env 파일을 확인하세요.");

  const frameworkText = Object.entries(FRAMEWORK)
    .map(([cat, { items }]) =>
      `[${cat}]\n${items.map((it, i) => `  ${CATEGORY_CODES[cat]}-0${i + 1}: ${it}`).join("\n")}`
    )
    .join("\n\n");

  const prompt = `당신은 AI Readiness Framework 전문가입니다.
아래 Framework 기준으로 Task를 분류하고, 반드시 JSON만 반환하세요.

=== AI Readiness Framework ===
${frameworkText}

=== Task 정보 ===
제목: ${taskData.title}
배경/목적: ${taskData.background}
요청 내용: ${taskData.request}
기대 결과: ${taskData.to_be}

=== 출력 형식 (JSON만, 설명 없이) ===
{
  "primary_category": "카테고리명",
  "primary_code": "코드(예: A-05)",
  "primary_sub": "세부분류명",
  "secondary_category": "카테고리명 또는 null",
  "secondary_code": "코드 또는 null",
  "secondary_sub": "세부분류명 또는 null",
  "classification_note": "분류 근거 한 줄 (한국어, 50자 이내)"
}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-calls": "true",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `API 오류 (${res.status})`);
  }

  const data = await res.json();
  const text = data.content?.map((b) => b.text || "").join("") || "";
  const clean = text.replace(/```json|```/g, "").trim();
  return JSON.parse(clean);
}

// ── 빈 폼 ───────────────────────────────────────────────────────
const emptyForm = () => ({
  title: "", requester: "", owner: "",
  start_date: "", due_date: "", status: "대기중", priority: "Medium",
  effort_estimate: "M", tags: "",
  task_type: "과제", project: "",
  background: "", request: "", as_is: "", to_be: "", constraints: "",
});

// ── MD Export 유틸 ───────────────────────────────────────────────
function taskToMarkdown(task) {
  const tagList = Array.isArray(task.tags) ? task.tags : [];
  return `---
id: "${task.id}"
title: "${task.title}"
requester: "${task.requester || ""}"
owner: "${task.owner || ""}"
created_date: "${task.created_date}"
start_date: "${task.start_date || ""}"
due_date: "${task.due_date || ""}"
status: "${task.status}"
task_type: "${task.task_type || "과제"}"
project: "${task.project || ""}"
primary_category: "${task.primary_category || ""}"
primary_code: "${task.primary_code || ""}"
secondary_category: "${task.secondary_category || ""}"
secondary_code: "${task.secondary_code || ""}"
classification_note: "${task.classification_note || ""}"
priority: "${task.priority}"
effort_estimate: "${task.effort_estimate}"
tags: [${tagList.map((t) => `"${t}"`).join(", ")}]
---

# ${task.id}: ${task.title}

## 배경 및 목적
${task.background || ""}

## 요청 내용
${task.request || ""}

## 현재 상황 (As-Is)
${task.as_is || ""}

## 기대 결과 (To-Be)
${task.to_be || ""}

## 제약 조건 / 참고사항
${task.constraints || ""}

---

## 진행 이력

| 날짜 | 내용 | 작성자 |
|------|------|--------|
${(task.history || []).map((h) => `| ${h.date} | ${h.content} | ${h.author} |`).join("\n")}
`;
}

function downloadMD(task) {
  const blob = new Blob([taskToMarkdown(task)], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${task.id}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Excel 템플릿 다운로드 ────────────────────────────────────────
function downloadExcelTemplate() {
  const headers = [
    "title","requester","owner","start_date","due_date",
    "status","priority","effort_estimate","tags",
    "task_type","project",
    "background","request","as_is","to_be","constraints"
  ];
  const examples = [
    [
      "RAG 기반 고객문의 자동화","고객서비스팀","홍길동",
      "2026-03-01","2026-06-30","진행중","High","L","RAG,파일럿",
      "파일럿","AI 고객서비스 혁신",
      "고객 문의 응대 자동화 필요","RAG 시스템 구축 및 파일럿 운영",
      "이메일/전화로 수동 처리 중","자동응답률 70% 달성","기존 CRM 연동 필요"
    ],
    [
      "데이터 품질 관리 체계 구축","데이터팀","김철수",
      "2026-01-15","2026-03-31","대기중","Medium","M","데이터품질,표준화",
      "과제","AI 데이터 인프라 강화",
      "원천 데이터 품질 이슈 빈발","데이터 품질 지표 정의 및 모니터링",
      "부서별 데이터 관리 기준 상이","데이터 품질 스코어 90% 이상","레거시 시스템 연동 복잡"
    ],
    [
      "AI 거버넌스 킥오프 미팅","전략기획팀","이영희",
      "2026-02-10","2026-02-10","완료","Low","S","거버넌스,미팅",
      "미팅","AI 거버넌스 수립",
      "AI 도입 가이드라인 공유 목적","주요 이해관계자 킥오프","없음","회의록 및 액션아이템 도출","전 부서 임원 참석 필요"
    ],
  ];
  const ws = XLSX.utils.aoa_to_sheet([headers, ...examples]);
  ws["!cols"] = headers.map(() => ({ wch: 22 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Tasks");
  XLSX.writeFile(wb, "task_import_template.xlsx");
}

// ════════════════════════════════════════════════════════════════
// 메인 앱
// ════════════════════════════════════════════════════════════════
export default function App() {
  const [view, setView] = useState("dashboard");
  const [tasks, setTasks] = useState(() => {
    try { return JSON.parse(localStorage.getItem("ai_tasks") || "[]"); }
    catch { return []; }
  });
  const [form, setForm] = useState(emptyForm());
  const [classifying, setClassifying] = useState(false);
  const [classResult, setClassResult] = useState(null);
  const [selectedTask, setSelectedTask] = useState(null);
  const [filterCat, setFilterCat] = useState("전체");
  const [filterStatus, setFilterStatus] = useState("전체");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [ganttYear, setGanttYear] = useState(new Date().getFullYear());
  const [importProgress, setImportProgress] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    localStorage.setItem("ai_tasks", JSON.stringify(tasks));
  }, [tasks]);

  const handleSave = async () => {
    if (!form.title.trim()) { setError("제목은 필수입니다."); return; }
    setError("");
    setSaving(true);
    setClassifying(true);
    setClassResult(null);
    try {
      const cls = await classifyWithLLM(form);
      setClassResult(cls);
      const newTask = {
        id: `TASK-${String(tasks.length + 1).padStart(3, "0")}`,
        ...form,
        tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
        created_date: new Date().toISOString().split("T")[0],
        history: [{ date: new Date().toISOString().split("T")[0], content: "Task 생성", author: form.owner || "-" }],
        ...cls,
      };
      setTasks((prev) => [newTask, ...prev]);
      setForm(emptyForm());
      setClassifying(false);
      setSaving(false);
      setTimeout(() => { setClassResult(null); setView("dashboard"); }, 2500);
    } catch (e) {
      setError(e.message || "LLM 분류 중 오류가 발생했습니다.");
      setClassifying(false);
      setSaving(false);
    }
  };

  const handleExcelImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setError("");
    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(new Uint8Array(buffer), { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
      const validRows = rows.filter((r) => String(r.title || "").trim());
      if (validRows.length === 0) { setError("유효한 데이터 행이 없습니다. 템플릿을 확인하세요."); return; }

      setImportProgress({ current: 0, total: validRows.length });
      const newTasks = [];

      for (let i = 0; i < validRows.length; i++) {
        const row = validRows[i];
        setImportProgress({ current: i + 1, total: validRows.length });
        const taskData = {
          title:          String(row.title || ""),
          requester:      String(row.requester || ""),
          owner:          String(row.owner || ""),
          start_date:     String(row.start_date || ""),
          due_date:       String(row.due_date || ""),
          status:         row.status || "대기중",
          priority:       row.priority || "Medium",
          effort_estimate: row.effort_estimate || "M",
          tags:           String(row.tags || ""),
          task_type:      row.task_type || "과제",
          project:        String(row.project || ""),
          background:     String(row.background || ""),
          request:        String(row.request || ""),
          as_is:          String(row.as_is || ""),
          to_be:          String(row.to_be || ""),
          constraints:    String(row.constraints || ""),
        };
        let cls = {};
        try { cls = await classifyWithLLM(taskData); } catch { /* 미분류로 추가 */ }
        newTasks.push({
          ...taskData,
          tags: taskData.tags.split(",").map((t) => t.trim()).filter(Boolean),
          created_date: new Date().toISOString().split("T")[0],
          history: [{ date: new Date().toISOString().split("T")[0], content: "엑셀 일괄 등록", author: taskData.owner || "-" }],
          ...cls,
        });
      }

      setTasks((prev) => {
        const base = prev.length;
        const numbered = newTasks.map((t, i) => ({
          ...t,
          id: `TASK-${String(base + i + 1).padStart(3, "0")}`,
        }));
        return [...numbered.reverse(), ...prev];
      });
      setImportProgress(null);
      setView("dashboard");
    } catch (e) {
      setError(`엑셀 파싱 오류: ${e.message}`);
      setImportProgress(null);
    }
  };

  const filteredTasks = tasks.filter((t) => {
    const catOk = filterCat === "전체" || t.primary_category === filterCat;
    const stOk = filterStatus === "전체" || t.status === filterStatus;
    return catOk && stOk;
  });

  const catCounts = Object.keys(FRAMEWORK).reduce((acc, cat) => {
    acc[cat] = tasks.filter((t) => t.primary_category === cat).length;
    return acc;
  }, {});

  const statusCounts = Object.keys(STATUS_STYLES).reduce((acc, s) => {
    acc[s] = tasks.filter((t) => t.status === s).length;
    return acc;
  }, {});

  const navTo = (v) => { setView(v); setSelectedTask(null); setClassResult(null); setError(""); };

  // ── Gantt 계산 ────────────────────────────────────────────────
  const MONTHS = ["1월","2월","3월","4월","5월","6월","7월","8월","9월","10월","11월","12월"];
  const QUARTERS = [
    { label: "Q1 (1~3월)", months: [0,1,2] },
    { label: "Q2 (4~6월)", months: [3,4,5] },
    { label: "Q3 (7~9월)", months: [6,7,8] },
    { label: "Q4 (10~12월)", months: [9,10,11] },
  ];
  const daysPerMonth = Array.from({ length: 12 }, (_, m) => new Date(ganttYear, m + 1, 0).getDate());
  const totalDays = daysPerMonth.reduce((a, b) => a + b, 0);
  const monthOffsetDays = daysPerMonth.reduce((acc, d, i) => {
    acc.push(i === 0 ? 0 : acc[i - 1] + daysPerMonth[i - 1]);
    return acc;
  }, []);

  const yearStartMs = new Date(ganttYear, 0, 1).getTime();
  const yearEndMs   = new Date(ganttYear + 1, 0, 1).getTime();
  const yearDurMs   = yearEndMs - yearStartMs;

  const getBarPos = (task) => {
    const startStr = task.start_date || task.created_date;
    if (!startStr) return null;
    const s = new Date(startStr).getTime();
    const e = task.due_date ? new Date(task.due_date).getTime() + 86400000 : s + 86400000;
    if (s >= yearEndMs || e <= yearStartMs) return null;
    const cs = Math.max(s, yearStartMs);
    const ce = Math.min(e, yearEndMs);
    const left  = (cs - yearStartMs) / yearDurMs * 100;
    const width = Math.max(0.5, (ce - cs) / yearDurMs * 100);
    return { left, width };
  };

  const todayPct = (() => {
    const today = new Date();
    if (today.getFullYear() !== ganttYear) return null;
    return (today.getTime() - yearStartMs) / yearDurMs * 100;
  })();

  const ganttByCategory = Object.keys(FRAMEWORK).map((cat) => ({
    cat,
    color: FRAMEWORK[cat].color,
    bg:    FRAMEWORK[cat].bg,
    items: tasks.filter((t) => t.primary_category === cat && getBarPos(t) !== null),
  })).filter((g) => g.items.length > 0);

  const ganttTotal = ganttByCategory.reduce((s, g) => s + g.items.length, 0);
  const LABEL_W = 280;

  // ── 렌더 ──────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: "#090e1a", color: "#e2e8f0", fontFamily: "'DM Sans', 'Noto Sans KR', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;700&family=DM+Mono:wght@400;500&family=Noto+Sans+KR:wght@300;400;500;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: #0f1629; }
        ::-webkit-scrollbar-thumb { background: #2a3a5c; border-radius: 3px; }
        input, textarea, select { outline: none; font-family: inherit; }
        .field { display: flex; flex-direction: column; gap: 6px; }
        .label { font-size: 11px; font-weight: 500; text-transform: uppercase; letter-spacing: .08em; color: #64748b; }
        .inp { background: #0f1629; border: 1px solid #1e2d4a; border-radius: 8px; color: #e2e8f0; padding: 10px 14px; font-size: 14px; width: 100%; transition: border .2s; }
        .inp:focus { border-color: #4ECDC4; box-shadow: 0 0 0 2px rgba(78,205,196,.12); }
        .inp::placeholder { color: #334155; }
        textarea.inp { resize: vertical; min-height: 80px; line-height: 1.6; }
        .btn-primary { background: linear-gradient(135deg,#4ECDC4,#2a9d8f); color: #fff; border: none; border-radius: 8px; padding: 12px 28px; font-size: 14px; font-weight: 600; cursor: pointer; transition: opacity .2s, transform .15s; letter-spacing: .02em; }
        .btn-primary:hover:not(:disabled) { opacity: .9; transform: translateY(-1px); }
        .btn-primary:disabled { opacity: .5; cursor: not-allowed; }
        .btn-ghost { background: transparent; border: 1px solid #1e2d4a; border-radius: 8px; color: #94a3b8; padding: 10px 20px; font-size: 13px; cursor: pointer; transition: all .2s; }
        .btn-ghost:hover { border-color: #4ECDC4; color: #4ECDC4; }
        .btn-sm { background: transparent; border: 1px solid #1e2d4a; border-radius: 6px; color: #64748b; padding: 6px 12px; font-size: 12px; cursor: pointer; transition: all .2s; }
        .btn-sm:hover { border-color: #4ECDC4; color: #4ECDC4; }
        .btn-sm:disabled { opacity: .4; cursor: not-allowed; }
        .card { background: #0f1629; border: 1px solid #1e2d4a; border-radius: 12px; padding: 20px; }
        .pill { display: inline-flex; align-items: center; gap: 6px; padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 500; }
        .task-row { display: grid; grid-template-columns: 90px 1fr 160px 100px 80px 70px 36px; gap: 12px; align-items: center; padding: 14px 16px; border-bottom: 1px solid #0f1629; transition: background .15s; cursor: pointer; }
        .task-row:hover { background: #111827; }
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .fade-in { animation: fadeIn .4s ease; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .cls-badge { display: inline-flex; align-items: center; gap: 5px; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; }
        .gantt-row:hover { background: #111827 !important; }
        .gantt-bar { position: absolute; top: 50%; transform: translateY(-50%); border-radius: 4px; cursor: pointer; }
        .gantt-bar:hover { opacity: 1 !important; filter: brightness(1.15); }
      `}</style>

      {/* ── 헤더 ── */}
      <header style={{ borderBottom: "1px solid #1e2d4a", padding: "0 32px", height: 56, display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, background: "rgba(9,14,26,.95)", backdropFilter: "blur(12px)", zIndex: 100 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 28, height: 28, background: "linear-gradient(135deg,#4ECDC4,#FF6B9D)", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>⬡</div>
          <span style={{ fontWeight: 700, fontSize: 15, letterSpacing: ".02em" }}>AI Task Dashboard</span>
        </div>
        <nav style={{ display: "flex", gap: 6 }}>
          {[["dashboard","📊 대시보드"], ["gantt","📅 로드맵"], ["form","＋ Task 등록"]].map(([v, label]) => (
            <button key={v} onClick={() => navTo(v)}
              style={{ background: view === v ? "#1e2d4a" : "transparent", border: "none", color: view === v ? "#4ECDC4" : "#64748b", padding: "6px 16px", borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: "pointer", transition: "all .2s" }}>
              {label}
            </button>
          ))}
        </nav>
      </header>

      <main style={{ maxWidth: 1400, margin: "0 auto", padding: "32px 24px" }}>

        {/* ══ 대시보드 ══ */}
        {view === "dashboard" && !selectedTask && (
          <div className="fade-in">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 12, marginBottom: 24 }}>
              {Object.entries(FRAMEWORK).map(([cat, { color, bg }]) => (
                <div key={cat} onClick={() => setFilterCat(filterCat === cat ? "전체" : cat)}
                  className="card" style={{ cursor: "pointer", borderColor: filterCat === cat ? color : "#1e2d4a", background: filterCat === cat ? bg : "#0f1629", transition: "all .2s" }}>
                  <div style={{ fontSize: 24, fontWeight: 700, color, fontFamily: "'DM Mono',monospace" }}>{catCounts[cat] || 0}</div>
                  <div style={{ fontSize: 11, color: "#64748b", marginTop: 4, fontWeight: 500 }}>{cat}</div>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
              {["전체", ...Object.keys(STATUS_STYLES)].map((s) => (
                <button key={s} onClick={() => setFilterStatus(s)}
                  className="pill" style={{ background: filterStatus === s ? "#1e2d4a" : "transparent", border: `1px solid ${filterStatus === s ? "#4ECDC4" : "#1e2d4a"}`, color: filterStatus === s ? "#4ECDC4" : "#64748b", cursor: "pointer", padding: "6px 14px", fontSize: 12 }}>
                  {s !== "전체" && <span style={{ width: 6, height: 6, borderRadius: "50%", background: STATUS_STYLES[s].dot, display: "inline-block" }} />}
                  {s}{s !== "전체" && statusCounts[s] > 0 && ` (${statusCounts[s]})`}
                </button>
              ))}
            </div>

            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
              <div style={{ display: "grid", gridTemplateColumns: "90px 1fr 160px 100px 80px 70px 36px", gap: 12, padding: "10px 16px", borderBottom: "1px solid #1e2d4a" }}>
                {["ID","제목","분류","담당자","상태","우선순위",""].map((h, i) => (
                  <div key={i} style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".08em", color: "#334155" }}>{h}</div>
                ))}
              </div>
              {filteredTasks.length === 0 ? (
                <div style={{ padding: "48px 16px", textAlign: "center", color: "#334155", fontSize: 13 }}>
                  등록된 Task가 없습니다.&nbsp;
                  <span style={{ color: "#4ECDC4", cursor: "pointer" }} onClick={() => navTo("form")}>Task를 등록해보세요 →</span>
                </div>
              ) : filteredTasks.map((t) => {
                const catColor = FRAMEWORK[t.primary_category]?.color || "#64748b";
                const st = STATUS_STYLES[t.status] || STATUS_STYLES["대기중"];
                return (
                  <div key={t.id} className="task-row">
                    <span onClick={() => { setSelectedTask(t); setView("detail"); }} style={{ fontFamily: "'DM Mono',monospace", fontSize: 12, color: "#4ECDC4" }}>{t.id}</span>
                    <div onClick={() => { setSelectedTask(t); setView("detail"); }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: "#e2e8f0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.title}</div>
                      {t.classification_note && <div style={{ fontSize: 11, color: "#475569", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.classification_note}</div>}
                    </div>
                    <div onClick={() => { setSelectedTask(t); setView("detail"); }}>
                      <span className="cls-badge" style={{ background: `${catColor}18`, color: catColor, border: `1px solid ${catColor}30` }}>
                        {t.primary_code} {t.primary_category}
                      </span>
                    </div>
                    <span onClick={() => { setSelectedTask(t); setView("detail"); }} style={{ fontSize: 13, color: "#94a3b8" }}>{t.owner || "-"}</span>
                    <span onClick={() => { setSelectedTask(t); setView("detail"); }} className="pill" style={{ background: `${st.dot}18`, color: st.color, border: `1px solid ${st.dot}30` }}>
                      <span style={{ width: 5, height: 5, borderRadius: "50%", background: st.dot, display: "inline-block" }} />{t.status}
                    </span>
                    <span onClick={() => { setSelectedTask(t); setView("detail"); }} style={{ fontSize: 12, fontWeight: 600, color: PRIORITY_COLORS[t.priority] || "#94a3b8" }}>{t.priority}</span>
                    <button className="btn-sm" onClick={(e) => { e.stopPropagation(); downloadMD(t); }} title="MD 다운로드" style={{ padding: "4px 8px" }}>↓</button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ══ 상세 뷰 ══ */}
        {view === "detail" && selectedTask && (
          <div className="fade-in">
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
              <button className="btn-ghost" onClick={() => { setView("dashboard"); setSelectedTask(null); }}>← 목록으로</button>
              <button className="btn-sm" onClick={() => downloadMD(selectedTask)}>↓ MD 다운로드</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 20 }}>
              <div>
                <div className="card" style={{ marginBottom: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
                    <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 13, color: "#4ECDC4" }}>{selectedTask.id}</span>
                    <span className="pill" style={{ background: `${STATUS_STYLES[selectedTask.status]?.dot}18`, color: STATUS_STYLES[selectedTask.status]?.color, border: `1px solid ${STATUS_STYLES[selectedTask.status]?.dot}30` }}>
                      {selectedTask.status}
                    </span>
                    {selectedTask.task_type && selectedTask.task_type !== "과제" && (
                      <span className="pill" style={{ background: "#1e2d4a", color: "#94a3b8", border: "1px solid #2a3a5c" }}>{selectedTask.task_type}</span>
                    )}
                  </div>
                  <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 20, lineHeight: 1.4 }}>{selectedTask.title}</h2>
                  {[["배경 및 목적", selectedTask.background], ["요청 내용", selectedTask.request], ["현재 상황 (As-Is)", selectedTask.as_is], ["기대 결과 (To-Be)", selectedTask.to_be], ["제약 조건", selectedTask.constraints]].map(([label, val]) => val && (
                    <div key={label} style={{ marginBottom: 16 }}>
                      <div className="label" style={{ marginBottom: 6 }}>{label}</div>
                      <div style={{ fontSize: 14, color: "#94a3b8", lineHeight: 1.7, background: "#090e1a", padding: "10px 14px", borderRadius: 8 }}>{val}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div className="card">
                  <div className="label" style={{ marginBottom: 12 }}>AI Readiness 분류</div>
                  {(() => {
                    const cat = selectedTask.primary_category;
                    const color = FRAMEWORK[cat]?.color || "#64748b";
                    return (
                      <>
                        <div className="cls-badge" style={{ background: `${color}18`, color, border: `1px solid ${color}30`, marginBottom: 8, fontSize: 13 }}>
                          {selectedTask.primary_code} · {selectedTask.primary_sub || cat}
                        </div>
                        {selectedTask.secondary_category && (
                          <div className="cls-badge" style={{ background: "#1e2d4a", color: "#64748b", border: "1px solid #2a3a5c", marginBottom: 8, fontSize: 12 }}>
                            + {selectedTask.secondary_code} · {selectedTask.secondary_sub}
                          </div>
                        )}
                        {selectedTask.classification_note && (
                          <div style={{ fontSize: 12, color: "#475569", marginTop: 8, fontStyle: "italic", lineHeight: 1.6 }}>"{selectedTask.classification_note}"</div>
                        )}
                      </>
                    );
                  })()}
                </div>
                <div className="card">
                  <div className="label" style={{ marginBottom: 10 }}>기본 정보</div>
                  {[
                    ["요청자", selectedTask.requester],
                    ["담당자", selectedTask.owner],
                    ["프로젝트", selectedTask.project],
                    ["유형", selectedTask.task_type],
                    ["등록일", selectedTask.created_date],
                    ["시작일", selectedTask.start_date],
                    ["마감일", selectedTask.due_date],
                    ["우선순위", selectedTask.priority],
                    ["규모", selectedTask.effort_estimate],
                  ].map(([k, v]) => v && (
                    <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #1e2d4a", fontSize: 13 }}>
                      <span style={{ color: "#475569" }}>{k}</span>
                      <span style={{ color: "#94a3b8", fontWeight: 500 }}>{v}</span>
                    </div>
                  ))}
                  {selectedTask.tags?.length > 0 && (
                    <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {selectedTask.tags.map((tag) => (
                        <span key={tag} style={{ background: "#1e2d4a", color: "#64748b", padding: "2px 8px", borderRadius: 4, fontSize: 11 }}>#{tag}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ══ 간트 로드맵 ══ */}
        {view === "gantt" && (
          <div className="fade-in">
            {/* 헤더 */}
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 700 }}>{ganttYear}년 AI Readiness 로드맵</h2>
                <p style={{ fontSize: 12, color: "#475569", marginTop: 4 }}>
                  Framework 카테고리별 과제 타임라인
                  {ganttTotal > 0 && ` · ${ganttTotal}건`}
                </p>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button className="btn-sm" onClick={() => setGanttYear((y) => y - 1)}>◀ {ganttYear - 1}</button>
                <span style={{ fontSize: 14, fontWeight: 700, color: "#4ECDC4", minWidth: 40, textAlign: "center" }}>{ganttYear}</span>
                <button className="btn-sm" onClick={() => setGanttYear((y) => y + 1)}>{ganttYear + 1} ▶</button>
              </div>
            </div>

            {/* 범례 */}
            <div style={{ display: "flex", gap: 16, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
              {Object.entries(FRAMEWORK).map(([cat, { color }]) => (
                <span key={cat} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "#64748b" }}>
                  <span style={{ width: 10, height: 10, borderRadius: 2, background: color, display: "inline-block", flexShrink: 0 }} />{cat}
                </span>
              ))}
              <span style={{ width: 1, height: 14, background: "#2a3a5c", display: "inline-block", flexShrink: 0 }} />
              <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "#475569" }}>
                <span style={{ width: 20, height: 7, background: "#64748b", borderRadius: 2, display: "inline-block" }} />과제
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "#475569" }}>
                <span style={{ width: 20, height: 7, backgroundImage: "repeating-linear-gradient(90deg,#64748b 0,#64748b 5px,transparent 5px,transparent 10px)", display: "inline-block" }} />POC / 파일럿
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "#475569" }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#64748b", display: "inline-block" }} />미팅
              </span>
              {todayPct !== null && (
                <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "#ff6b9d" }}>
                  <span style={{ width: 2, height: 12, background: "#ff6b9d", borderRadius: 1, display: "inline-block" }} />오늘
                </span>
              )}
            </div>

            {ganttTotal === 0 ? (
              <div className="card" style={{ textAlign: "center", padding: "56px 16px", color: "#334155" }}>
                <div style={{ fontSize: 32, marginBottom: 16 }}>📅</div>
                <div style={{ fontSize: 14, marginBottom: 8 }}>{ganttYear}년에 표시할 Task가 없습니다.</div>
                <div style={{ fontSize: 12, color: "#1e2d4a" }}>
                  Task 등록 시 <strong style={{ color: "#4ECDC4" }}>시작일 / 마감일</strong>을 입력하면 로드맵에 자동으로 표시됩니다.
                </div>
                <div style={{ marginTop: 20 }}>
                  <span style={{ color: "#4ECDC4", cursor: "pointer", fontSize: 13 }} onClick={() => navTo("form")}>Task 등록하러 가기 →</span>
                </div>
              </div>
            ) : (
              <div className="card" style={{ padding: 0, overflowX: "auto" }}>
                {/* 타임라인 헤더 */}
                <div style={{ display: "flex", position: "sticky", top: 0, zIndex: 10, background: "#0f1629", borderBottom: "2px solid #1e2d4a", minWidth: LABEL_W + 720 }}>
                  <div style={{ width: LABEL_W, minWidth: LABEL_W, padding: "8px 16px", fontSize: 10, color: "#334155", fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase", borderRight: "1px solid #1e2d4a", flexShrink: 0 }}>
                    과제명
                  </div>
                  <div style={{ flex: 1, minWidth: 720, position: "relative" }}>
                    {/* 분기 헤더 */}
                    <div style={{ display: "flex", borderBottom: "1px solid #1e2d4a" }}>
                      {QUARTERS.map((q) => {
                        const qDays = q.months.reduce((s, m) => s + daysPerMonth[m], 0);
                        return (
                          <div key={q.label} style={{ width: `${qDays / totalDays * 100}%`, textAlign: "center", fontSize: 11, fontWeight: 700, color: "#64748b", padding: "5px 0", borderRight: "1px solid #1e2d4a" }}>
                            {q.label}
                          </div>
                        );
                      })}
                    </div>
                    {/* 월 헤더 */}
                    <div style={{ display: "flex" }}>
                      {MONTHS.map((m, i) => (
                        <div key={i} style={{ width: `${daysPerMonth[i] / totalDays * 100}%`, textAlign: "center", fontSize: 10, color: "#475569", padding: "3px 0", borderRight: "1px solid #0f1629", whiteSpace: "nowrap", overflow: "hidden" }}>
                          {m}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* 카테고리별 행 */}
                {ganttByCategory.map(({ cat, color, bg, items }) => (
                  <div key={cat} style={{ minWidth: LABEL_W + 720 }}>
                    {/* 카테고리 헤더 행 */}
                    <div style={{ display: "flex", background: bg, borderBottom: "1px solid #1e2d4a" }}>
                      <div style={{ width: LABEL_W, minWidth: LABEL_W, padding: "6px 16px", fontSize: 11, fontWeight: 700, color, borderRight: "1px solid #1e2d4a", flexShrink: 0, letterSpacing: ".04em" }}>
                        ▸ {cat} <span style={{ fontWeight: 400, opacity: .55 }}>({items.length})</span>
                      </div>
                      <div style={{ flex: 1, minWidth: 720, position: "relative" }}>
                        {monthOffsetDays.map((d, i) => i > 0 && (
                          <div key={i} style={{ position: "absolute", left: `${d / totalDays * 100}%`, top: 0, bottom: 0, width: 1, background: "#ffffff08" }} />
                        ))}
                      </div>
                    </div>

                    {/* Task 행 */}
                    {items.map((task) => {
                      const pos = getBarPos(task);
                      const isMeeting = task.task_type === "미팅";
                      const isDashed  = task.task_type === "POC" || task.task_type === "파일럿";
                      return (
                        <div key={task.id} className="gantt-row"
                          style={{ display: "flex", borderBottom: "1px solid #0a1020", minHeight: 40, cursor: "pointer", transition: "background .12s" }}
                          onClick={() => { setSelectedTask(task); setView("detail"); }}>
                          {/* 라벨 */}
                          <div style={{ width: LABEL_W, minWidth: LABEL_W, padding: "0 16px", display: "flex", alignItems: "center", gap: 7, borderRight: "1px solid #1e2d4a", flexShrink: 0, overflow: "hidden" }}>
                            <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 10, color: "#4ECDC4", flexShrink: 0 }}>{task.id}</span>
                            <span style={{ fontSize: 12, color: "#94a3b8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{task.title}</span>
                            {task.task_type && task.task_type !== "과제" && (
                              <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, border: `1px solid ${color}40`, color, flexShrink: 0 }}>{task.task_type}</span>
                            )}
                          </div>
                          {/* 타임라인 */}
                          <div style={{ flex: 1, minWidth: 720, position: "relative" }}>
                            {/* 월 구분선 */}
                            {monthOffsetDays.map((d, i) => i > 0 && (
                              <div key={i} style={{ position: "absolute", left: `${d / totalDays * 100}%`, top: 0, bottom: 0, width: 1, background: "#1e2d4a" }} />
                            ))}
                            {/* 오늘 선 */}
                            {todayPct !== null && (
                              <div style={{ position: "absolute", left: `${todayPct}%`, top: 0, bottom: 0, width: 1, background: "#ff6b9d50", zIndex: 1, pointerEvents: "none" }} />
                            )}
                            {/* 바 */}
                            {pos && (
                              <div
                                className="gantt-bar"
                                title={[
                                  `${task.id}: ${task.title}`,
                                  `${task.start_date || task.created_date} ~ ${task.due_date || ""}`,
                                  task.project ? `프로젝트: ${task.project}` : "",
                                  task.classification_note || "",
                                ].filter(Boolean).join("\n")}
                                style={{
                                  left: `${pos.left}%`,
                                  width: `${pos.width}%`,
                                  height: isMeeting ? 10 : 20,
                                  borderRadius: isMeeting ? "50% / 50%" : 4,
                                  background: isDashed
                                    ? `repeating-linear-gradient(90deg, ${color} 0px, ${color} 5px, ${color}28 5px, ${color}28 10px)`
                                    : color,
                                  opacity: 0.8,
                                  zIndex: 2,
                                }}
                              />
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ══ 등록 폼 ══ */}
        {view === "form" && (
          <div className="fade-in" style={{ maxWidth: 720, margin: "0 auto" }}>

            {/* 엑셀 임포트 진행 바 */}
            {importProgress && (
              <div className="card" style={{ marginBottom: 20, borderColor: "#4ECDC4", background: "#0d2e2c" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                  <span className="spin" style={{ display: "inline-block", width: 14, height: 14, border: "2px solid rgba(78,205,196,.3)", borderTopColor: "#4ECDC4", borderRadius: "50%", flexShrink: 0 }} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#4ECDC4" }}>
                    LLM 분류 중… {importProgress.current} / {importProgress.total}건
                  </span>
                </div>
                <div style={{ height: 4, background: "#1e2d4a", borderRadius: 2, overflow: "hidden" }}>
                  <div style={{ height: "100%", background: "linear-gradient(90deg,#4ECDC4,#2a9d8f)", borderRadius: 2, width: `${importProgress.current / importProgress.total * 100}%`, transition: "width .3s" }} />
                </div>
              </div>
            )}

            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 28, gap: 16 }}>
              <div>
                <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 6 }}>Task 등록</h2>
                <p style={{ fontSize: 13, color: "#475569" }}>저장 시 LLM이 AI Readiness Framework 기준으로 자동 분류합니다.</p>
              </div>
              <div style={{ display: "flex", gap: 8, flexShrink: 0, alignItems: "flex-start" }}>
                <button className="btn-sm" onClick={downloadExcelTemplate} title="예시 데이터 포함 엑셀 템플릿 다운로드">
                  ↓ 템플릿
                </button>
                <button className="btn-sm" onClick={() => fileInputRef.current?.click()} disabled={!!importProgress} title="엑셀 파일로 Task 일괄 등록">
                  ↑ 엑셀 업로드
                </button>
                <input ref={fileInputRef} type="file" accept=".xlsx,.xls" style={{ display: "none" }} onChange={handleExcelImport} />
              </div>
            </div>

            {classResult && (
              <div className="fade-in card" style={{ marginBottom: 20, borderColor: "#4ECDC4", background: "#0d2e2c" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <span style={{ fontSize: 16 }}>✦</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#4ECDC4" }}>LLM 분류 완료 — 대시보드로 이동합니다</span>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <span className="cls-badge" style={{ background: `${FRAMEWORK[classResult.primary_category]?.color}18`, color: FRAMEWORK[classResult.primary_category]?.color, border: `1px solid ${FRAMEWORK[classResult.primary_category]?.color}30` }}>
                    {classResult.primary_code} · {classResult.primary_sub}
                  </span>
                  {classResult.secondary_category && (
                    <span className="cls-badge" style={{ background: "#1e2d4a", color: "#64748b", border: "1px solid #2a3a5c" }}>
                      + {classResult.secondary_code} · {classResult.secondary_sub}
                    </span>
                  )}
                </div>
                {classResult.classification_note && <div style={{ fontSize: 12, color: "#64748b", marginTop: 8, fontStyle: "italic" }}>"{classResult.classification_note}"</div>}
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              <div className="card">
                <div style={{ fontSize: 12, fontWeight: 600, color: "#334155", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 16 }}>기본 정보</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <div className="field">
                    <label className="label">제목 *</label>
                    <input className="inp" placeholder="Task를 한 문장으로 표현하세요" value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                    {[["requester","요청 부서/담당자","예: 고객서비스팀"], ["owner","담당자","예: 홍길동"]].map(([key, label, ph]) => (
                      <div key={key} className="field">
                        <label className="label">{label}</label>
                        <input className="inp" placeholder={ph} value={form[key]} onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.value }))} />
                      </div>
                    ))}
                    <div className="field" style={{ gridColumn: "1 / -1" }}>
                      <label className="label">프로젝트 / 이니셔티브</label>
                      <input className="inp" placeholder="예: AI 고객서비스 혁신 — 여러 Task를 묶는 상위 과제명" value={form.project} onChange={(e) => setForm((p) => ({ ...p, project: e.target.value }))} />
                    </div>
                    <div className="field">
                      <label className="label">Task 유형</label>
                      <select className="inp" value={form.task_type} onChange={(e) => setForm((p) => ({ ...p, task_type: e.target.value }))}>
                        {TASK_TYPES.map((t) => <option key={t}>{t}</option>)}
                      </select>
                    </div>
                    <div className="field">
                      <label className="label">상태</label>
                      <select className="inp" value={form.status} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}>
                        {Object.keys(STATUS_STYLES).map((s) => <option key={s}>{s}</option>)}
                      </select>
                    </div>
                    <div className="field">
                      <label className="label">시작일 <span style={{ color: "#334155", fontSize: 10 }}>(로드맵 표시 기준)</span></label>
                      <input className="inp" type="date" value={form.start_date} onChange={(e) => setForm((p) => ({ ...p, start_date: e.target.value }))} style={{ colorScheme: "dark" }} />
                    </div>
                    <div className="field">
                      <label className="label">마감일</label>
                      <input className="inp" type="date" value={form.due_date} onChange={(e) => setForm((p) => ({ ...p, due_date: e.target.value }))} style={{ colorScheme: "dark" }} />
                    </div>
                    <div className="field">
                      <label className="label">우선순위</label>
                      <select className="inp" value={form.priority} onChange={(e) => setForm((p) => ({ ...p, priority: e.target.value }))}>
                        {["High","Medium","Low"].map((p) => <option key={p}>{p}</option>)}
                      </select>
                    </div>
                    <div className="field">
                      <label className="label">규모 (S/M/L/XL)</label>
                      <select className="inp" value={form.effort_estimate} onChange={(e) => setForm((p) => ({ ...p, effort_estimate: e.target.value }))}>
                        {["S","M","L","XL"].map((e) => <option key={e}>{e}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="field">
                    <label className="label">태그 (쉼표로 구분)</label>
                    <input className="inp" placeholder="예: RAG, 파일럿, 2025-H2" value={form.tags} onChange={(e) => setForm((p) => ({ ...p, tags: e.target.value }))} />
                  </div>
                </div>
              </div>

              <div className="card" style={{ borderColor: "#1a2d4a" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#334155", textTransform: "uppercase", letterSpacing: ".06em" }}>Task 내용</div>
                  <span style={{ fontSize: 10, color: "#4ECDC4", background: "#0d2e2c", padding: "2px 8px", borderRadius: 10, border: "1px solid #4ECDC430" }}>LLM 분류 기준</span>
                </div>
                <p style={{ fontSize: 11, color: "#334155", marginBottom: 16 }}>아래 내용이 자세할수록 분류 정확도가 높아집니다.</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {[
                    ["background","배경 및 목적 *","왜 이 Task가 필요한지, 어떤 문제를 해결하는지"],
                    ["request","요청 내용","구체적으로 무엇을 해달라는 것인지"],
                    ["as_is","현재 상황 (As-Is)","현재 어떻게 하고 있는지"],
                    ["to_be","기대 결과 (To-Be)","완료 시 어떤 상태가 되어야 하는지"],
                    ["constraints","제약 조건/참고사항","예산, 일정, 시스템 제약 등"],
                  ].map(([key, label, ph]) => (
                    <div key={key} className="field">
                      <label className="label">{label}</label>
                      <textarea className="inp" placeholder={ph} value={form[key]} onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.value }))} />
                    </div>
                  ))}
                </div>
              </div>

              {error && (
                <div style={{ color: "#f87171", fontSize: 13, padding: "10px 14px", background: "#1f0d0d", borderRadius: 8, border: "1px solid #ef444430" }}>{error}</div>
              )}

              <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
                <button className="btn-ghost" onClick={() => setForm(emptyForm())}>초기화</button>
                <button className="btn-primary" onClick={handleSave} disabled={saving || !!importProgress}>
                  {saving ? (
                    <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span className="spin" style={{ display: "inline-block", width: 14, height: 14, border: "2px solid rgba(255,255,255,.3)", borderTopColor: "#fff", borderRadius: "50%" }} />
                      {classifying ? "LLM 분류 중…" : "저장 중…"}
                    </span>
                  ) : "저장 + 자동 분류"}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
