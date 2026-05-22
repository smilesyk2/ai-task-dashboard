# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install          # install dependencies
npm run dev          # dev server at http://localhost:3000
npm run build        # production build → dist/
npm run preview      # serve the production build locally
```

No test runner or linter is configured.

## Environment Setup

Copy `.env.example` to `.env` and set a real Anthropic API key:

```
VITE_ANTHROPIC_API_KEY=sk-ant-...
```

The key is read at runtime via `import.meta.env.VITE_ANTHROPIC_API_KEY`. Without it, task saving fails with an explicit error.

## Architecture

The entire application lives in **`src/App.jsx`** — there are no sub-components, no routing library, and no state management library. View switching is done with a single `view` state variable (`"dashboard"` | `"form"` | `"detail"`).

**Data flow:**
- All tasks are persisted to and read from `localStorage` under the key `"ai_tasks"`.
- When a task is saved, `classifyWithLLM()` makes a direct browser-to-API call to `https://api.anthropic.com/v1/messages` using `model: "claude-sonnet-4-20250514"`. The header `"anthropic-dangerous-direct-browser-calls": "true"` is required because the call originates from the browser.
- The LLM returns JSON with `primary_category`, `primary_code`, `primary_sub`, `secondary_category`, `secondary_code`, `secondary_sub`, and `classification_note`, which are merged into the task object before saving.

**Key extension points (all inside `src/App.jsx`):**

| Symbol | Purpose |
|---|---|
| `FRAMEWORK` | Category definitions (names, colors, sub-items). Edit here to add/remove categories or sub-items. |
| `CATEGORY_CODES` | Maps category names to single-letter codes (`P`, `D`, `I`, `A`, `G`) used in classification codes like `A-05`. |
| `classifyWithLLM()` | The prompt sent to Claude. Adjust wording here to change classification behavior. |
| `taskToMarkdown()` | YAML frontmatter + Markdown body format for `.md` exports. |
| `handleSave()` | Saves to `localStorage`. Replace this logic when adding a backend. |

**Task ID scheme:** `TASK-001`, `TASK-002`, … generated from `tasks.length + 1`. IDs are not recalculated if tasks are deleted from localStorage.

**Styling:** All CSS is inline styles or a `<style>` tag injected in JSX. There is no CSS file or CSS-in-JS library. The design uses a dark theme (`#090e1a` background) with category-specific accent colors defined in `FRAMEWORK[cat].color`.
