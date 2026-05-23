import { useState, useEffect } from "react";

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

// ── 유틸 ─────────────────────────────────────────────────────────
const emptyForm = () => ({
  title: "", requester: "", owner: "",
  due_date: "", status: "대기중", priority: "Medium",
  effort_estimate: "M", tags: "",
  background: "", request: "", as_is: "", to_be: "", constraints: "",
  notes: "",
  primary_category: "", primary_sub: "",
  secondary_category: "", secondary_sub: "",
  classification_note: "",
});

function getPrimaryCode(cat, sub) {
  if (!cat || !sub) return "";
  const idx = FRAMEWORK[cat]?.items.indexOf(sub);
  return idx >= 0 ? `${CATEGORY_CODES[cat]}-${String(idx + 1).padStart(2, "0")}` : "";
}

// Gantt: 2026년 기준 left/width (%) 계산
function calcGanttBar(createdDate, dueDate) {
  const yearStart = new Date("2026-01-01").getTime();
  const yearEnd   = new Date("2026-12-31").getTime();
  const total     = yearEnd - yearStart;
  const s = createdDate ? new Date(createdDate).getTime() : yearStart;
  const e = dueDate     ? new Date(dueDate).getTime()     : yearEnd;
  if (e < yearStart || s > yearEnd) return null;
  const left  = ((Math.max(s, yearStart) - yearStart) / total) * 100;
  const width = Math.max(((Math.min(e, yearEnd) - Math.max(s, yearStart)) / total) * 100, 2);
  return { left: Math.min(left, 98), width: Math.min(width, 100 - left) };
}

function GanttBar({ createdDate, dueDate, color }) {
  const bar = calcGanttBar(createdDate, dueDate);
  return (
    <div style={{ position: "relative", height: 30, display: "flex", borderRadius: 4, overflow: "hidden" }}>
      {["1Q","2Q","3Q","4Q"].map((q, i) => (
        <div key={q} style={{ flex: 1, borderLeft: i > 0 ? "1px solid #1e2d4a" : "none", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontSize: 9, color: "#2a3a5c", fontWeight: 700, letterSpacing: ".04em" }}>{q}</span>
        </div>
      ))}
      {bar && (
        <div style={{
          position: "absolute", top: 7, height: 16, borderRadius: 4,
          left: `${bar.left}%`, width: `${bar.width}%`,
          background: `${color}80`, border: `1px solid ${color}cc`,
          pointerEvents: "none",
        }} />
      )}
    </div>
  );
}

// ── MD Export ────────────────────────────────────────────────────
function taskToMarkdown(task) {
  const tagList = Array.isArray(task.tags) ? task.tags : [];
  return `---
id: "${task.id}"
title: "${task.title}"
requester: "${task.requester || ""}"
owner: "${task.owner || ""}"
created_date: "${task.created_date}"
due_date: "${task.due_date || ""}"
status: "${task.status}"
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

## 비고 / 이슈
${task.notes || ""}

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
  a.href = url; a.download = `${task.id}.md`; a.click();
  URL.revokeObjectURL(url);
}

// ── Seed 데이터 ──────────────────────────────────────────────────
const SEED_TASKS = [
  {
    id: "TASK-001",
    title: "Claude API 도입",
    requester: "DT 전략기획",
    owner: "서동호",
    due_date: "2026-06-30",
    status: "대기중",
    priority: "Medium",
    effort_estimate: "M",
    tags: ["LLM", "사외API", "생산성"],
    background: "",
    request: "",
    as_is: "",
    to_be: "사외 LLM 도입을 통한 DT 개발 생산성 향상",
    constraints: "",
    notes: "",
    created_date: "2026-05-23",
    history: [{ date: "2026-05-23", content: "Task 생성", author: "서동호" }],
    primary_category: "Infra",
    primary_code: "I-01",
    primary_sub: "클라우드/서버/GPU 인프라",
    secondary_category: null,
    secondary_code: null,
    secondary_sub: null,
    classification_note: "사외 LLM(Claude API) 연동을 위한 인프라 구성",
  },
];

// 테이블 컬럼 정의
const GRID = "155px 1fr 240px 88px 82px 65px 130px 34px";
const HEADERS = ["분류 (대/중)","Task","'26 일정 (Gantt)","담당자","상태","우선순위","비고",""];

// ════════════════════════════════════════════════════════════════
// 메인 앱
// ════════════════════════════════════════════════════════════════
export default function App() {
  const [view, setView] = useState("dashboard"); // dashboard | form | edit
  const [tasks, setTasks] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("ai_tasks") || "[]");
      return stored.length > 0 ? stored : SEED_TASKS;
    } catch { return SEED_TASKS; }
  });
  const [form, setForm] = useState(emptyForm());
  const [useLLM, setUseLLM] = useState(true);
  const [classifying, setClassifying] = useState(false);
  const [classResult, setClassResult] = useState(null);
  const [selectedTask, setSelectedTask] = useState(null);
  const [filterCat, setFilterCat] = useState("전체");
  const [filterStatus, setFilterStatus] = useState("전체");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    localStorage.setItem("ai_tasks", JSON.stringify(tasks));
  }, [tasks]);

  // 폼 공통 로직 ──────────────────────────────────────────────────
  const buildClassification = (f) => ({
    primary_category: f.primary_category,
    primary_code: getPrimaryCode(f.primary_category, f.primary_sub),
    primary_sub: f.primary_sub,
    secondary_category: f.secondary_category || null,
    secondary_code: getPrimaryCode(f.secondary_category, f.secondary_sub) || null,
    secondary_sub: f.secondary_sub || null,
    classification_note: f.classification_note,
  });

  const handleSave = async () => {
    if (!form.title.trim()) { setError("제목은 필수입니다."); return; }
    if (!useLLM && !form.primary_category) { setError("1차 카테고리를 선택해주세요."); return; }
    setError(""); setSaving(true); setClassResult(null);

    if (useLLM) {
      setClassifying(true);
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
        setClassifying(false); setSaving(false);
        setTimeout(() => { setClassResult(null); setView("dashboard"); }, 2500);
      } catch (e) {
        setError(e.message || "LLM 분류 중 오류가 발생했습니다.");
        setClassifying(false); setSaving(false);
      }
    } else {
      const newTask = {
        id: `TASK-${String(tasks.length + 1).padStart(3, "0")}`,
        ...form,
        tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
        created_date: new Date().toISOString().split("T")[0],
        history: [{ date: new Date().toISOString().split("T")[0], content: "Task 생성", author: form.owner || "-" }],
        ...buildClassification(form),
      };
      setTasks((prev) => [newTask, ...prev]);
      setForm(emptyForm()); setSaving(false); setView("dashboard");
    }
  };

  const handleUpdate = async () => {
    if (!form.title.trim()) { setError("제목은 필수입니다."); return; }
    if (!useLLM && !form.primary_category) { setError("1차 카테고리를 선택해주세요."); return; }
    setError(""); setSaving(true); setClassResult(null);

    const applyUpdate = (cls) => {
      const updated = {
        ...selectedTask,
        ...form,
        tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
        ...cls,
      };
      setTasks((prev) => prev.map((t) => t.id === selectedTask.id ? updated : t));
    };

    if (useLLM) {
      setClassifying(true);
      try {
        const cls = await classifyWithLLM(form);
        setClassResult(cls);
        applyUpdate(cls);
        setClassifying(false); setSaving(false);
        setTimeout(() => { setClassResult(null); setSelectedTask(null); setForm(emptyForm()); setView("dashboard"); }, 2500);
      } catch (e) {
        setError(e.message || "LLM 분류 중 오류가 발생했습니다.");
        setClassifying(false); setSaving(false);
      }
    } else {
      applyUpdate(buildClassification(form));
      setSelectedTask(null); setForm(emptyForm()); setSaving(false); setView("dashboard");
    }
  };

  const openEdit = (t) => {
    setSelectedTask(t);
    setForm({
      title: t.title,
      requester: t.requester || "",
      owner: t.owner || "",
      due_date: t.due_date || "",
      status: t.status,
      priority: t.priority,
      effort_estimate: t.effort_estimate,
      tags: Array.isArray(t.tags) ? t.tags.join(", ") : "",
      background: t.background || "",
      request: t.request || "",
      as_is: t.as_is || "",
      to_be: t.to_be || "",
      constraints: t.constraints || "",
      notes: t.notes || "",
      primary_category: t.primary_category || "",
      primary_sub: t.primary_sub || "",
      secondary_category: t.secondary_category || "",
      secondary_sub: t.secondary_sub || "",
      classification_note: t.classification_note || "",
    });
    setUseLLM(false);
    setError("");
    setClassResult(null);
    setView("edit");
  };

  const filteredTasks = tasks.filter((t) => {
    const catOk = filterCat === "전체" || t.primary_category === filterCat;
    const stOk  = filterStatus === "전체" || t.status === filterStatus;
    return catOk && stOk;
  });

  const catCounts    = Object.keys(FRAMEWORK).reduce((acc, cat) => { acc[cat] = tasks.filter((t) => t.primary_category === cat).length; return acc; }, {});
  const statusCounts = Object.keys(STATUS_STYLES).reduce((acc, s)  => { acc[s]   = tasks.filter((t) => t.status === s).length; return acc; }, {});

  const navTo = (v) => {
    if (v === "form") setUseLLM(true);
    setView(v); setSelectedTask(null); setForm(emptyForm()); setClassResult(null); setError("");
  };

  // ── 폼 공통 렌더 ─────────────────────────────────────────────
  const renderFormBody = (isEdit) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* 기본 정보 */}
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
            <div className="field">
              <label className="label">마감일</label>
              <input className="inp" type="date" value={form.due_date} onChange={(e) => setForm((p) => ({ ...p, due_date: e.target.value }))} style={{ colorScheme: "dark" }} />
            </div>
            <div className="field">
              <label className="label">상태</label>
              <select className="inp" value={form.status} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}>
                {Object.keys(STATUS_STYLES).map((s) => <option key={s}>{s}</option>)}
              </select>
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
          <div className="field">
            <label className="label">비고 / 이슈</label>
            <textarea className="inp" placeholder="관련 이슈, 리스크, 메모 등을 자유롭게 입력하세요" value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} style={{ minHeight: 64 }} />
          </div>
        </div>
      </div>

      {/* Task 내용 */}
      <div className="card" style={{ borderColor: "#1a2d4a" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#334155", textTransform: "uppercase", letterSpacing: ".06em" }}>Task 내용</div>
          {useLLM && <span style={{ fontSize: 10, color: "#4ECDC4", background: "#0d2e2c", padding: "2px 8px", borderRadius: 10, border: "1px solid #4ECDC430" }}>LLM 분류 기준</span>}
        </div>
        <p style={{ fontSize: 11, color: "#334155", marginBottom: 16 }}>{useLLM ? "아래 내용이 자세할수록 분류 정확도가 높아집니다." : "배경·요청 내용을 입력하면 나중에 LLM 재분류도 가능합니다."}</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {[
            ["background","배경 및 목적","왜 이 Task가 필요한지, 어떤 문제를 해결하는지"],
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

      {/* 수동 분류 */}
      {!useLLM && (
        <div className="card fade-in" style={{ borderColor: "#C3A6FF40", background: "#1a0d2e" }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#C3A6FF", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 16 }}>수동 분류</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div className="field">
                <label className="label">1차 카테고리 *</label>
                <select className="inp" value={form.primary_category} onChange={(e) => setForm((p) => ({ ...p, primary_category: e.target.value, primary_sub: "" }))}>
                  <option value="">선택하세요</option>
                  {Object.keys(FRAMEWORK).map((cat) => <option key={cat}>{cat}</option>)}
                </select>
              </div>
              <div className="field">
                <label className="label">1차 세부분류</label>
                <select className="inp" value={form.primary_sub} onChange={(e) => setForm((p) => ({ ...p, primary_sub: e.target.value }))} disabled={!form.primary_category}>
                  <option value="">선택하세요</option>
                  {(FRAMEWORK[form.primary_category]?.items || []).map((item) => <option key={item}>{item}</option>)}
                </select>
              </div>
              <div className="field">
                <label className="label">2차 카테고리 (선택)</label>
                <select className="inp" value={form.secondary_category} onChange={(e) => setForm((p) => ({ ...p, secondary_category: e.target.value, secondary_sub: "" }))}>
                  <option value="">없음</option>
                  {Object.keys(FRAMEWORK).map((cat) => <option key={cat}>{cat}</option>)}
                </select>
              </div>
              <div className="field">
                <label className="label">2차 세부분류</label>
                <select className="inp" value={form.secondary_sub} onChange={(e) => setForm((p) => ({ ...p, secondary_sub: e.target.value }))} disabled={!form.secondary_category}>
                  <option value="">선택하세요</option>
                  {(FRAMEWORK[form.secondary_category]?.items || []).map((item) => <option key={item}>{item}</option>)}
                </select>
              </div>
            </div>
            <div className="field">
              <label className="label">분류 근거 (선택)</label>
              <input className="inp" placeholder="분류 이유를 간단히 입력하세요 (50자 이내)" value={form.classification_note} onChange={(e) => setForm((p) => ({ ...p, classification_note: e.target.value }))} />
            </div>
          </div>
        </div>
      )}

      {/* 에러 */}
      {error && (
        <div style={{ color: "#f87171", fontSize: 13, padding: "10px 14px", background: "#1f0d0d", borderRadius: 8, border: "1px solid #ef444430" }}>{error}</div>
      )}

      {/* 버튼 */}
      <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
        <button className="btn-ghost" onClick={() => isEdit ? navTo("dashboard") : setForm(emptyForm())}>
          {isEdit ? "← 취소" : "초기화"}
        </button>
        <button className="btn-primary" onClick={isEdit ? handleUpdate : handleSave} disabled={saving}>
          {saving ? (
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span className="spin" style={{ display: "inline-block", width: 14, height: 14, border: "2px solid rgba(255,255,255,.3)", borderTopColor: "#fff", borderRadius: "50%" }} />
              {classifying ? "LLM 분류 중…" : "저장 중…"}
            </span>
          ) : isEdit ? (useLLM ? "수정 + 재분류" : "수정 저장") : (useLLM ? "저장 + 자동 분류" : "저장")}
        </button>
      </div>
    </div>
  );

  // ── 렌더 ──────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: "#090e1a", color: "#e2e8f0", fontFamily: "'DM Sans', 'Noto Sans KR', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;700&family=DM+Mono:wght@400;500&family=Noto+Sans+KR:wght@300;400;500;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 6px; }
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
        .card { background: #0f1629; border: 1px solid #1e2d4a; border-radius: 12px; padding: 20px; }
        .pill { display: inline-flex; align-items: center; gap: 6px; padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 500; }
        .task-row { display: grid; grid-template-columns: ${GRID}; gap: 10px; align-items: center; padding: 12px 16px; border-bottom: 1px solid #0f1629; transition: background .15s; cursor: pointer; }
        .task-row:hover { background: #111827; }
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .fade-in { animation: fadeIn .4s ease; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .cls-badge { display: inline-flex; align-items: center; gap: 5px; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; }
      `}</style>

      {/* ── 헤더 ── */}
      <header style={{ borderBottom: "1px solid #1e2d4a", padding: "0 32px", height: 56, display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, background: "rgba(9,14,26,.95)", backdropFilter: "blur(12px)", zIndex: 100 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 28, height: 28, background: "linear-gradient(135deg,#4ECDC4,#FF6B9D)", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>⬡</div>
          <span style={{ fontWeight: 700, fontSize: 15, letterSpacing: ".02em" }}>AI Task Dashboard</span>
        </div>
        <nav style={{ display: "flex", gap: 6 }}>
          {[["dashboard","📊 대시보드"], ["form","＋ Task 등록"]].map(([v, label]) => (
            <button key={v} onClick={() => navTo(v)}
              style={{ background: view === v ? "#1e2d4a" : "transparent", border: "none", color: view === v ? "#4ECDC4" : "#64748b", padding: "6px 16px", borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: "pointer", transition: "all .2s" }}>
              {label}
            </button>
          ))}
        </nav>
      </header>

      <main style={{ maxWidth: 1400, margin: "0 auto", padding: "32px 24px" }}>

        {/* ══ 대시보드 ══ */}
        {view === "dashboard" && (
          <div className="fade-in">
            {/* KPI 카드 */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 12, marginBottom: 24 }}>
              {Object.entries(FRAMEWORK).map(([cat, { color, bg }]) => (
                <div key={cat} onClick={() => setFilterCat(filterCat === cat ? "전체" : cat)}
                  className="card" style={{ cursor: "pointer", borderColor: filterCat === cat ? color : "#1e2d4a", background: filterCat === cat ? bg : "#0f1629", transition: "all .2s" }}>
                  <div style={{ fontSize: 24, fontWeight: 700, color, fontFamily: "'DM Mono',monospace" }}>{catCounts[cat] || 0}</div>
                  <div style={{ fontSize: 11, color: "#64748b", marginTop: 4, fontWeight: 500 }}>{cat}</div>
                </div>
              ))}
            </div>

            {/* 상태 필터 */}
            <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
              {["전체", ...Object.keys(STATUS_STYLES)].map((s) => (
                <button key={s} onClick={() => setFilterStatus(s)}
                  className="pill" style={{ background: filterStatus === s ? "#1e2d4a" : "transparent", border: `1px solid ${filterStatus === s ? "#4ECDC4" : "#1e2d4a"}`, color: filterStatus === s ? "#4ECDC4" : "#64748b", cursor: "pointer", padding: "6px 14px", fontSize: 12 }}>
                  {s !== "전체" && <span style={{ width: 6, height: 6, borderRadius: "50%", background: STATUS_STYLES[s].dot, display: "inline-block" }} />}
                  {s}{s !== "전체" && statusCounts[s] > 0 && ` (${statusCounts[s]})`}
                </button>
              ))}
            </div>

            {/* Task 테이블 */}
            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
              {/* 헤더 행 */}
              <div style={{ display: "grid", gridTemplateColumns: GRID, gap: 10, padding: "10px 16px", borderBottom: "1px solid #1e2d4a", background: "#080c18" }}>
                {HEADERS.map((h, i) => (
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
                  <div key={t.id} className="task-row" onClick={() => openEdit(t)}>
                    {/* 분류 (대/중) */}
                    <div>
                      {t.primary_category ? (
                        <>
                          <div style={{ fontSize: 11, fontWeight: 700, color: catColor, marginBottom: 2 }}>
                            {t.primary_category}
                          </div>
                          <div style={{ fontSize: 10, color: "#475569", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {t.primary_code} {t.primary_sub}
                          </div>
                        </>
                      ) : (
                        <span style={{ fontSize: 11, color: "#334155" }}>미분류</span>
                      )}
                    </div>

                    {/* ID + 제목 */}
                    <div>
                      <div style={{ fontSize: 10, color: "#4ECDC4", fontFamily: "'DM Mono',monospace", marginBottom: 2 }}>{t.id}</div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: "#e2e8f0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.title}</div>
                    </div>

                    {/* Gantt */}
                    <GanttBar createdDate={t.created_date} dueDate={t.due_date} color={catColor} />

                    {/* 담당자 */}
                    <span style={{ fontSize: 12, color: "#94a3b8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.owner || "-"}</span>

                    {/* 상태 */}
                    <span className="pill" style={{ background: `${st.dot}18`, color: st.color, border: `1px solid ${st.dot}30`, justifySelf: "start" }}>
                      <span style={{ width: 5, height: 5, borderRadius: "50%", background: st.dot, display: "inline-block" }} />{t.status}
                    </span>

                    {/* 우선순위 */}
                    <span style={{ fontSize: 12, fontWeight: 600, color: PRIORITY_COLORS[t.priority] || "#94a3b8" }}>{t.priority}</span>

                    {/* 비고 */}
                    <span style={{ fontSize: 11, color: "#475569", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.notes || "-"}</span>

                    {/* MD 다운로드 */}
                    <button className="btn-sm" onClick={(e) => { e.stopPropagation(); downloadMD(t); }} title="MD 다운로드" style={{ padding: "4px 8px" }}>↓</button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ══ Task 등록 폼 ══ */}
        {view === "form" && (
          <div className="fade-in" style={{ maxWidth: 720, margin: "0 auto" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <h2 style={{ fontSize: 20, fontWeight: 700 }}>Task 등록</h2>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 12, color: useLLM ? "#4ECDC4" : "#64748b", fontWeight: 500 }}>LLM 자동 분류</span>
                <button onClick={() => setUseLLM((v) => !v)}
                  style={{ width: 44, height: 24, borderRadius: 12, background: useLLM ? "#4ECDC4" : "#1e2d4a", border: "none", cursor: "pointer", position: "relative", transition: "background .2s", flexShrink: 0 }}>
                  <span style={{ position: "absolute", top: 3, left: useLLM ? 23 : 3, width: 18, height: 18, borderRadius: "50%", background: "#fff", transition: "left .2s", display: "block" }} />
                </button>
                <span style={{ fontSize: 11, color: useLLM ? "#4ECDC4" : "#475569", fontWeight: 600, minWidth: 24 }}>{useLLM ? "ON" : "OFF"}</span>
              </div>
            </div>
            <p style={{ fontSize: 13, color: "#475569", marginBottom: 28 }}>
              {useLLM ? "저장 시 LLM이 AI Readiness Framework 기준으로 자동 분류합니다." : "카테고리를 직접 선택해서 저장합니다."}
            </p>

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

            {renderFormBody(false)}
          </div>
        )}

        {/* ══ Task 수정 ══ */}
        {view === "edit" && selectedTask && (
          <div className="fade-in" style={{ maxWidth: 720, margin: "0 auto" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <div>
                <div style={{ fontSize: 11, color: "#4ECDC4", fontFamily: "'DM Mono',monospace", marginBottom: 4 }}>{selectedTask.id}</div>
                <h2 style={{ fontSize: 20, fontWeight: 700 }}>Task 수정</h2>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 12, color: useLLM ? "#4ECDC4" : "#64748b", fontWeight: 500 }}>LLM 재분류</span>
                <button onClick={() => setUseLLM((v) => !v)}
                  style={{ width: 44, height: 24, borderRadius: 12, background: useLLM ? "#4ECDC4" : "#1e2d4a", border: "none", cursor: "pointer", position: "relative", transition: "background .2s", flexShrink: 0 }}>
                  <span style={{ position: "absolute", top: 3, left: useLLM ? 23 : 3, width: 18, height: 18, borderRadius: "50%", background: "#fff", transition: "left .2s", display: "block" }} />
                </button>
                <span style={{ fontSize: 11, color: useLLM ? "#4ECDC4" : "#475569", fontWeight: 600, minWidth: 24 }}>{useLLM ? "ON" : "OFF"}</span>
              </div>
            </div>
            <p style={{ fontSize: 13, color: "#475569", marginBottom: 28 }}>
              {useLLM ? "저장 시 LLM이 분류를 재수행합니다." : "분류를 직접 수정하거나 기존 분류를 유지합니다."}
            </p>

            {classResult && (
              <div className="fade-in card" style={{ marginBottom: 20, borderColor: "#4ECDC4", background: "#0d2e2c" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <span style={{ fontSize: 16 }}>✦</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#4ECDC4" }}>LLM 재분류 완료 — 대시보드로 이동합니다</span>
                </div>
              </div>
            )}

            {renderFormBody(true)}
          </div>
        )}
      </main>
    </div>
  );
}
