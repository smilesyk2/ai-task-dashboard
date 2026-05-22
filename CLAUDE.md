# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install          # Install dependencies
npm run dev          # Dev server at http://localhost:3000
npm run build        # Production build to dist/
npm run preview      # Preview production build locally
```

There is no test runner or linter configured.

## Environment Setup

Copy `.env.example` to `.env` and set `VITE_ANTHROPIC_API_KEY` with an Anthropic API key from https://console.anthropic.com/settings/keys. Without this key, the LLM classification step will throw on task save.

## Architecture

This is a **single-file React app** — all state management, UI rendering, API calls, and business logic live in `src/App.jsx`. There is no routing library, no state management library, and no component split across files.

### View state machine

The app has three views controlled by a single `view` state string:
- `"dashboard"` — KPI cards + status filter bar + task table
- `"form"` — task registration form
- `"detail"` — task detail view (activated by setting both `view = "detail"` and `selectedTask`)

Navigation uses `navTo()` which resets sidebar state. The detail view is entered inline (not via `navTo`) by setting `selectedTask` directly.

### Data flow

1. User fills out the form (`form` state, shape defined by `emptyForm()`)
2. On save, `classifyWithLLM(form)` calls the Anthropic API directly from the browser (uses the `anthropic-dangerous-direct-browser-calls: true` header — this is intentional for the prototype)
3. The LLM returns JSON with `primary_category`, `primary_code`, `primary_sub`, `secondary_*`, and `classification_note`
4. The returned classification is merged into the task object and prepended to the `tasks` array
5. `tasks` is persisted to `localStorage` via a `useEffect` on every change

### Task data model

```js
{
  id: "TASK-001",               // auto-generated, sequential
  title, requester, owner,
  due_date, status, priority,   // "대기중"|"진행중"|"검토중"|"완료"|"보류"
  effort_estimate,              // "S"|"M"|"L"|"XL"
  tags,                         // string[] (split from comma-separated input)
  background, request, as_is, to_be, constraints,
  created_date,                 // ISO date string
  history,                      // [{ date, content, author }]
  // LLM-added fields:
  primary_category, primary_code, primary_sub,
  secondary_category, secondary_code, secondary_sub,
  classification_note,
}
```

### FRAMEWORK constant

`FRAMEWORK` at the top of `App.jsx` is the authoritative source for all classification categories. It defines:
- 5 top-level categories: Process, Data, Infra, AI Application, Governance
- Each category has a `color`, `bg` (dark tint for selected state), and `items[]` (subcategory names)

`CATEGORY_CODES` maps each category name to a single letter prefix (P/D/I/A/G) used to build codes like `A-05`.

The full framework text is injected verbatim into the LLM prompt at classification time, so editing `FRAMEWORK` immediately affects both the UI and classification behavior.

### Key extension points

| What to change | Where |
|---|---|
| Classification prompt / model | `classifyWithLLM()` in `App.jsx` |
| Category/subcategory definitions | `FRAMEWORK` object at top of `App.jsx` |
| MD export format | `taskToMarkdown()` in `App.jsx` |
| Persistence (localStorage → API) | `handleSave()` and the `useEffect` on `tasks` |
| Task ID scheme | `handleSave()` — currently `tasks.length + 1` with zero-padding |

### Styling

All styles are inline or injected via a `<style>` tag inside the component. There is no CSS file or styling library. Shared styles are defined as CSS class names in the `<style>` block (`.card`, `.btn-primary`, `.inp`, `.pill`, `.task-row`, etc.).

The color palette is dark-mode only: background `#090e1a`, card surface `#0f1629`, borders `#1e2d4a`. Each framework category has its own accent color defined in `FRAMEWORK`.
