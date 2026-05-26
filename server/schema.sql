-- ================================================================
-- AI Task Dashboard — PostgreSQL Schema
-- ================================================================

-- ── 사용자 ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id          SERIAL PRIMARY KEY,
  username    VARCHAR(50)  UNIQUE NOT NULL,
  password    VARCHAR(255) NOT NULL,           -- 프로토타입: 평문, 실운영 시 bcrypt 적용
  name        VARCHAR(100) NOT NULL,
  role        VARCHAR(20)  NOT NULL DEFAULT 'user' CHECK (role IN ('user','manager')),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── Readiness Framework ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS framework_categories (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(100) UNIQUE NOT NULL,
  code        VARCHAR(4)   NOT NULL,           -- P / D / I / A / G
  color       VARCHAR(7)   NOT NULL,           -- #RRGGBB
  bg          VARCHAR(7)   NOT NULL DEFAULT '#0f1629',
  sort_order  INTEGER      DEFAULT 0
);

CREATE TABLE IF NOT EXISTS framework_items (
  id          SERIAL PRIMARY KEY,
  category_id INTEGER NOT NULL REFERENCES framework_categories(id) ON DELETE CASCADE,
  name        VARCHAR(200) NOT NULL,
  sort_order  INTEGER DEFAULT 0
);

-- ── 상태·우선순위·규모 ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS statuses (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(50)  UNIQUE NOT NULL,
  color       VARCHAR(7)   NOT NULL,
  dot_color   VARCHAR(7)   NOT NULL,
  sort_order  INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS priorities (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(50)  UNIQUE NOT NULL,
  color       VARCHAR(7)   NOT NULL,
  sort_order  INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS efforts (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(20)  UNIQUE NOT NULL,
  sort_order  INTEGER DEFAULT 0
);

-- ── 컬럼 표시 설정 ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS col_config (
  id          SERIAL PRIMARY KEY,
  col_key     VARCHAR(50)  UNIQUE NOT NULL,
  label       VARCHAR(50)  NOT NULL,
  visible     BOOLEAN      DEFAULT FALSE,
  sort_order  INTEGER DEFAULT 0
);

-- ── LLM 설정 (단일 행, id=1) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS llm_config (
  id               INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  provider         VARCHAR(20) NOT NULL DEFAULT 'claude',
  claude_api_key   TEXT,
  claude_model     VARCHAR(100) DEFAULT 'claude-sonnet-4-20250514',
  gemini_api_key   TEXT,
  gemini_model     VARCHAR(100) DEFAULT 'gemini-1.5-pro',
  openai_api_key   TEXT,
  openai_model     VARCHAR(100) DEFAULT 'gpt-4o',
  onprem_base_url  TEXT,
  onprem_model     VARCHAR(100),
  onprem_api_key   TEXT,
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ── Tasks ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tasks (
  id               VARCHAR(20)  PRIMARY KEY,   -- TASK-001 형식
  title            VARCHAR(500) NOT NULL,
  requester        VARCHAR(200),
  owner            VARCHAR(200),
  start_date       DATE,
  due_date         DATE,
  status           VARCHAR(50),
  priority         VARCHAR(50),
  effort_estimate  VARCHAR(10),
  tags             TEXT[]       DEFAULT '{}',
  background       TEXT,
  request          TEXT,
  as_is            TEXT,
  to_be            TEXT,
  constraints      TEXT,
  notes            TEXT,
  created_date     DATE         DEFAULT CURRENT_DATE,
  created_at       TIMESTAMPTZ  DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  DEFAULT NOW()
);

-- Task별 Readiness 분류 (1:N)
CREATE TABLE IF NOT EXISTS task_readiness (
  id          SERIAL PRIMARY KEY,
  task_id     VARCHAR(20) NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  alias       VARCHAR(200) DEFAULT '',
  category    VARCHAR(100) DEFAULT '',
  code        VARCHAR(20)  DEFAULT '',
  sub         VARCHAR(200) DEFAULT '',
  note        TEXT         DEFAULT '',
  sort_order  INTEGER DEFAULT 0
);

-- Task 이력
CREATE TABLE IF NOT EXISTS task_history (
  id          SERIAL PRIMARY KEY,
  task_id     VARCHAR(20) NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  date        DATE        NOT NULL,
  content     TEXT        NOT NULL,
  author      VARCHAR(200) DEFAULT '',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ================================================================
-- 인덱스
-- ================================================================
CREATE INDEX IF NOT EXISTS idx_task_readiness_task_id ON task_readiness(task_id);
CREATE INDEX IF NOT EXISTS idx_task_history_task_id   ON task_history(task_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status           ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_framework_items_cat    ON framework_items(category_id);

-- ================================================================
-- 기본 시드 데이터 (IF NOT EXISTS 패턴)
-- ================================================================

INSERT INTO users(username, password, name, role) VALUES
  ('admin', 'admin', '관리자', 'manager'),
  ('user',  'user',  '사용자', 'user')
ON CONFLICT (username) DO NOTHING;

INSERT INTO framework_categories(name, code, color, bg, sort_order) VALUES
  ('Process',        'P', '#4ECDC4', '#0d2e2c', 0),
  ('Data',           'D', '#FFE66D', '#2e2a0d', 1),
  ('Infra',          'I', '#A8E6CF', '#0d2e1a', 2),
  ('AI Application', 'A', '#FF6B9D', '#2e0d1a', 3),
  ('Governance',     'G', '#C3A6FF', '#1a0d2e', 4)
ON CONFLICT (name) DO NOTHING;

DO $$
DECLARE
  pid INTEGER; did INTEGER; iid INTEGER; aid INTEGER; gid INTEGER;
BEGIN
  SELECT id INTO pid FROM framework_categories WHERE name='Process';
  SELECT id INTO did FROM framework_categories WHERE name='Data';
  SELECT id INTO iid FROM framework_categories WHERE name='Infra';
  SELECT id INTO aid FROM framework_categories WHERE name='AI Application';
  SELECT id INTO gid FROM framework_categories WHERE name='Governance';

  INSERT INTO framework_items(category_id, name, sort_order) VALUES
    (pid,'업무 프로세스 재설계',0),(pid,'현장 운영 방식 개선',1),(pid,'Human-in-the-loop 운영',2),(pid,'업무 자동화 프로세스',3),(pid,'변화 관리 및 현업 정착',4),
    (did,'데이터 수집/연계',0),(did,'데이터 정제/표준화',1),(did,'데이터 통합/저장 구조',2),(did,'데이터 라벨링/어노테이션',3),(did,'지식 데이터/문서 자산화',4),(did,'피처/임베딩 자산관리',5),
    (iid,'클라우드/서버/GPU 인프라',0),(iid,'AI/ML 플랫폼',1),(iid,'데이터 플랫폼 인프라',2),(iid,'IT/OT 연계 인프라',3),(iid,'API/서비스 연계 인프라',4),(iid,'DevOps/MLOps 운영 인프라',5),(iid,'보안 인프라',6),
    (aid,'예측 모델',0),(aid,'최적화 모델',1),(aid,'Vision AI',2),(aid,'NLP/텍스트 분석',3),(aid,'GenAI/RAG 서비스',4),(aid,'AI Agent',5),(aid,'추천/개인화 서비스',6),(aid,'모델 운영/성능 개선',7),
    (gid,'AI 거버넌스',0),(gid,'데이터 거버넌스',1),(gid,'거버넌스 조직/역할체계',2),(gid,'권한/접근 통제 정책',3),(gid,'보안/개인정보/컴플라이언스',4),(gid,'모델 리스크 관리',5),(gid,'표준/가이드라인',6),(gid,'성과/투자관리 기준',7)
  ON CONFLICT DO NOTHING;
END $$;

INSERT INTO statuses(name, color, dot_color, sort_order) VALUES
  ('대기중', '#94a3b8', '#64748b', 0),
  ('진행중', '#60a5fa', '#3b82f6', 1),
  ('검토중', '#fb923c', '#f97316', 2),
  ('완료',   '#4ade80', '#22c55e', 3),
  ('보류',   '#f87171', '#ef4444', 4)
ON CONFLICT (name) DO NOTHING;

INSERT INTO priorities(name, color, sort_order) VALUES
  ('High',   '#ff4d6d', 0),
  ('Medium', '#ffd60a', 1),
  ('Low',    '#4cc9f0', 2)
ON CONFLICT (name) DO NOTHING;

INSERT INTO efforts(name, sort_order) VALUES
  ('S', 0), ('M', 1), ('L', 2), ('XL', 3)
ON CONFLICT (name) DO NOTHING;

INSERT INTO col_config(col_key, label, visible, sort_order) VALUES
  ('owner',           '담당자',   FALSE, 0),
  ('status',          '상태',     FALSE, 1),
  ('priority',        '우선순위', FALSE, 2),
  ('effort_estimate', '규모',     FALSE, 3),
  ('requester',       '요청부서', FALSE, 4),
  ('due_date',        '마감일',   FALSE, 5)
ON CONFLICT (col_key) DO NOTHING;

INSERT INTO llm_config(id, provider) VALUES (1, 'claude')
ON CONFLICT (id) DO NOTHING;

-- 예시 Task (seed)
INSERT INTO tasks(id, title, requester, owner, due_date, status, priority, effort_estimate, tags, to_be, created_date)
VALUES ('TASK-001','Claude API 도입','DT 전략기획','서동호','2026-06-30','대기중','Medium','M',ARRAY['LLM','사외API'],'사외 LLM 도입을 통한 DT 개발 생산성 향상','2026-01-15')
ON CONFLICT (id) DO NOTHING;

INSERT INTO task_readiness(task_id, alias, category, code, sub, note, sort_order)
VALUES ('TASK-001','','Infra','I-01','클라우드/서버/GPU 인프라','사외 LLM API 연동 인프라',0)
ON CONFLICT DO NOTHING;

INSERT INTO task_history(task_id, date, content, author)
VALUES ('TASK-001','2026-05-23','Task 생성','서동호')
ON CONFLICT DO NOTHING;
