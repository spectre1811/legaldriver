# Console v2 — design contract (Lovable → implement)

Per `plan/console-frontend-audit.html` §12. Each design-first item: a Lovable reference (pinned) + a token-level annotation. The implementer builds against **this file**, in the app's `ec-*` token system — never pixel values, never Lovable's exported code. Every design-first PR ships a Lovable-vs-built before/after.

**Reference project:** Chambers prototype `ff0a89ff-f387-45ed-82ee-32e614c070a3`, route `/mocks`, commit `2a433af`.
**Preview (founder-auth):** https://id-preview--ff0a89ff-f387-45ed-82ee-32e614c070a3.lovable.app/mocks

**Palette/fonts confirmed intact** in the prototype: `--ink #1a1c1e`, `--bronze #78582b`, `--honey #e8b563`, `--paper #faf9f7`, Fraunces / Work Sans / IBM Plex Mono. These map 1:1 to the app's `ec-*` tokens.

---

## ⚠️ Reconciliation — session taste vs prototype (founder-flagged)
The prototype has drifted from two decisions we locked this session. **We keep our decisions; the prototype's version does NOT override.**

1. **Logo.** The prototype's `Wordmark` = registrar **seal** + **"MUKADMA"** all-small-caps + Devanagari **मुकदमा (no nukta)**. Our locked direction = **lowercase "mukadma"** wordmark + **मुक़दमा (with nukta ़)** — the shipped console's `brand-mark.tsx`. → In the D4 sidebar build, use **our lowercase lockup**, not the mock's seal. (This also feeds F4: the landing-logo fix — mark, size/spacing, and the underline overlapping the मुक़दमा line.)
2. **Onboarding "What you get"** (MiniCalendar + morning-brief bubble) exists in the prototype but the founder decided **F3 = remove** it from the console. → Console removes it. (Prototype may keep it as a marketing teaser.)

Everything else in the prototype (Graphite & Bronze tokens, single "Console" nav + order, active-row bronze-tint + honey rail, bell dropdown, ⌘K, attention chips, filters drawer, agenda view, pagination, bulk bar + undo, add-case modal, motion layer) is **aligned** with our shipped console and our plan — keep it, and apply the specific tweaks (F1 relabel cause-list, B8 drop the "coming soon" note, E1 add-columns, E2 advocate filter).

---

## D4 — Collapsible & resizable sidebar
Reference: `/mocks` Mockup 1 (three states). Component to build: `ResizablePanel` wrapping the existing `nav.tsx`, width persisted via `usePersistedState` (PRE-C4).

**Widths.** Expanded default **224px** (`w-56`, today's width). Collapsed rail **56px**. Drag range ~200–360px, persisted key `mukadma:sidebar:width` + `mukadma:sidebar:collapsed`.

**Expanded state**
- Logo: **our** lockup (lowercase `mukadma` + `मुक़दमा`), not the seal.
- "CONSOLE" eyebrow (`.eyebrow`, mono) + double-hairline rule (`border-y border-ec-hair`, ~3px) — shown only when expanded.
- Nav item: `rounded-ec-s`, `text-[13px]`, `gap-2.5 py-2 pl-3 pr-2`. Active = `bg-ec-bronze-tint font-medium text-ec-bronze-deep` **+** a honey rail marker `absolute left-0 h-4 w-[3px] rounded-r-full bg-ec-honey`. Inactive = `text-ec-ink-2`, hover `bg-ec-band`.
- **Collapse control**: `mt-auto`, above Settings, right-aligned. `h-7 w-7 rounded-ec-s border border-ec-line bg-ec-card text-ec-muted-ink` chip. **FOUNDER TWEAK (11 Aug): the bare chevron isn't good enough — use a clearer *panel-collapse* glyph** (a sidebar-rectangle with a left-pointing chevron inside it, i.e. a "collapse the panel" affordance, not a lone `‹`). Add it to `components/icons.tsx` as `panelCollapse`/`panelExpand` (mirror for the collapsed rail). Hover: `text-ec-bronze`.
- **Drag handle**: `absolute inset-y-0 right-0 w-[4px]`; resting fill `bg-ec-band` + 1px edge `bg-ec-hair-strong/60`.

**Collapsed rail (56px)**
- Logo: **mark only**, centered. No CONSOLE eyebrow/rule.
- Nav items → icon squares `h-9 w-9 justify-center`; active still `bg-ec-bronze-tint text-ec-bronze-deep` but **no honey rail marker**. Labels hidden.
- **Tooltip** on hover: dark pill to the right — `absolute left-full ml-2.5 rounded-ec-s border border-ec-line bg-ec-ink px-2 py-1 text-[11.5px] text-ec-paper shadow-ec-2`, `pointer-events-none`.
- Collapse control → **chevron-right** chip, centered.

**Mid-drag (active)**
- Drag handle fill → `bg-ec-bronze-tint`; edge rule widens 1px→2px and turns `bg-ec-bronze`.

**A11y (audit H1/H2):** collapse button `aria-label="Collapse sidebar"/"Expand sidebar"`; drag handle `role="separator" aria-orientation="vertical"` + keyboard arrows to resize; tooltips via `title`/`aria-label` on collapsed icons. Respect `prefers-reduced-motion`.

---

## C5 — Notification chips (case-file right rail)
Reference: `/mocks` Mockup 2 (before/after). Replaces the cryptic pills in `cases/[id]/page.tsx` Notifications card.

**Before (today, to replace):** bronze-tint pills `"EM · CASE UPDATE"` etc. — unreadable abbreviations.

**After (build this):** a readable list.
- Container unchanged: the right-rail card (`SectionLabel "Notifications"` + `.ec-card`).
- `ul.divide-y divide-ec-line`. Each row `li`: `flex items-center gap-2.5 py-[7px] first:pt-0 last:pb-0`.
  - **Icon** (`text-ec-ink-2`, 15px): envelope for Email (flap stroke `var(--honey)`), `IconBell` for In-app. (SMS/phone icon reserved for future.)
  - **Channel label**: `shrink-0 text-[12.5px] font-medium text-ec-ink` — "Email" / "In-app".
  - **Description**: `min-w-0 truncate text-[12.5px] text-ec-muted-ink` — "Case update" / "Hearing reminder".
- Rows to show: Email·Case update, Email·Hearing reminder, In-app·Case update, In-app·Hearing reminder (data-driven from real prefs — honest; only show channels/types actually enabled).
- Footer line: `mt-2.5 border-t border-ec-line pt-2.5 text-[12.5px] text-ec-muted-ink` — "Last sent {date}". "Manage →" link `text-ec-bronze`.

**Honest-state rule:** if a case has sent no notifications, keep the existing empty state ("No notifications sent for this case yet.") — the list only renders real receipts.

---

## E1 — Column picker (cases table)
Reference: `/mocks` Mockup E1 (popover-open + custom-columns, two states). Component: `ColumnPicker` (PRE, audit §11) — checkbox popover + drag-to-reorder, persisted `mukadma:cases:columns` via `usePersistedState`.

**Trigger.** A `+` chip at the right end of the cases table header row: `h-7 w-7 rounded-ec-s border border-ec-line bg-ec-card text-ec-muted-ink hover:text-ec-bronze`, `aria-label="Add or reorder columns"`. Icon = `plusColumns` (a table-column glyph with a small `+`, add to `components/icons.tsx`) — **not** a bare `+`.

**Popover.** `w-[260px] rounded-ec-m border border-ec-line bg-ec-card shadow-ec-3 z-ec-dropdown`, right-aligned, `p-1.5`. Header eyebrow `.eyebrow px-2 pt-1.5 pb-1` = "COLUMNS".
- Rows: `ul` of `li flex items-center gap-2 rounded-ec-s px-2 py-1.5 hover:bg-ec-band`. Left = drag handle `IconGrip` (`text-ec-hair-strong cursor-grab`, `aria-hidden`). Then a checkbox (our existing checkbox primitive) + label `text-[13px] text-ec-ink`.
- Drag-to-reorder: dragging row gets `bg-ec-bronze-tint shadow-ec-2`; drop indicator = `h-[2px] bg-ec-bronze` between rows. Keyboard: `↑/↓` move focus, `space` toggle, `alt+↑/↓` reorder (H1/H2 a11y).
- Footer: `mt-1 border-t border-ec-line pt-1.5` — "Reset to default" link `text-[12px] text-ec-muted-ink hover:text-ec-bronze` (the sole recovery when everything's unchecked).

**Columns (honest — only real matter fields).** Default ON: Case / Court / Next hearing / Stage. Optional: Advocate, Case type, Filed on, Last synced. **No fabricated columns.** Locked columns (Case) are shown checked+disabled so they can't be removed.

**Empty-of-optionals:** if the user unchecks every optional, the table still renders the locked defaults — never a zero-column table.

---

## E3 — Clients bulk actions
Reference: `/mocks` Mockup E3 (three states: select → cascade-confirm → undo-toast). Reuses `BulkBar` (exists) + `ConfirmAction` (PRE) + `useToast` (PRE). Also fixes the word-wrap bug (client names truncated).

**Word-wrap fix.** Client-name cell: drop the truncate; `min-w-0 whitespace-normal break-words text-ec-ink font-medium leading-snug`. Column gets a sane `w-[minmax]` so names wrap to 2 lines instead of clipping.

**Row select.** New leading checkbox column (`w-9`), header = select-all (indeterminate when partial). Checked row = `bg-ec-bronze-tint`. On ≥1 selected → floating `BulkBar` (`fixed bottom-6 left-1/2 -translate-x-1/2 z-ec-sticky`, `shadow-ec-3`): `"{n} selected"` + `[Delete selected]` (danger-outline) + `[Clear]` link.

**Cascade confirm (ConfirmAction).** Header "Delete {n} clients?". Body:
- **Blocked section** (only if any are linked): `rounded-ec-s bg-ec-amber-tint/… p-3` warning — "{k} clients can't be deleted — they have linked matters:" + a muted, non-actionable `ul` of those names. **This is the real FK/relationship guard, not decorative** — the count comes from actual `matter` links.
- **Deletable line**: "{d} clients will be deleted. This can't be undone." Buttons `[Cancel]` + `[Delete {d} clients]` (danger). If `d==0`, the delete button is disabled.

**Inline single-delete.** Row hover → trash icon (`text-ec-muted-ink hover:text-ec-danger`) → the row **expands downward** to an in-row confirm bar (`bg-ec-band border-t border-ec-line px-3 py-2`): "Delete {name}? `[Cancel]` `[Delete]`". Reuses ConfirmAction's logic, rendered inline (no modal for the single case).

**Undo toast.** After delete, `useToast`: dark pill bottom-center "{n} client(s) deleted. `[Undo]`" + 5s countdown bar (`bg-ec-honey`). Undo restores the rows (soft-delete window). **Honest:** if the server delete already committed past the undo window, the toast's Undo is gone — don't fake reversibility.

---

## E4 — Documents workspace
Reference: `/mocks` Mockup E4 (five screens). Largest surface. Reuses the unified `Dialog` (PRE) for the viewer, `BulkBar`, `ConfirmAction`, `useToast`. **Build only what the real feature supports — no fabricated forwarding email, no fake trash if soft-delete isn't wired.**

1. **Toolbar.** Under the dark masthead: a filter bar — `[Document type ▾] [Source ▾] [Date from] [Date to] [Sort by ▾]`, each our `Combobox`/native-date, `text-[12.5px]`, gap-2. Right-aligned: a prominent **Trash** icon button (`h-8 w-8 rounded-ec-s border border-ec-line`, icon-only, `aria-label="Trash"`) with a honey count badge (`absolute -top-1 -right-1 min-w-4 h-4 rounded-full bg-ec-honey text-ec-ink text-[10px]`) shown only when trash>0.
2. **List.** Fixed-width name column (`w-[minmax]`, `whitespace-normal break-words` — the word-wrap fix), source chip, date (`.figures`), size. Row hover reveals a **checkbox** (Gmail-style) at the left; header has select-all. On select → `BulkBar` "{n} selected · [Download] [Move to trash]".
3. **Viewer (fixed).** The doc viewer uses the PRE `Dialog` (center variant): real backdrop (`bg-ec-ink/… backdrop-blur-sm` — now works post-WO-401 ink-rgb fix), `shadow-ec-3`, focus trapped, ESC closes with an "ESC" hint chip top-right (`.eyebrow text-ec-paper/70`).
4. **Upload.** A dashed drop-zone (`border-2 border-dashed border-ec-line rounded-ec-m`) at the list top (revealed by an "Upload" button). Per-file progress bar (`bg-ec-bronze`). Completion → toast "{n} documents uploaded. [View]". **Only if upload is actually implemented** — otherwise keep the existing state and skip this screen.
5. **Trash.** Trash view; honest empty state "Trash is empty" + "Back to documents". Trash icon has a subtle hover scale (`hover:scale-105 transition-transform`, honey badge) — respect `prefers-reduced-motion`.

**Scope note:** E4 spans several PRs. Ship it as sub-waves (toolbar+wrap → bulk+trash → viewer → upload), each with real backing. Don't land a control that has no server behind it.

---

## F4 — Landing logo (code-first, before/after)
Not a new Lovable surface — a precise fix on the **existing** lockup (`brand-mark.tsx` / landing hero). Founder F4 = "all of the above": the **mark**, the **size/spacing**, AND **the underline overlapping the मुक़दमा line**. Keep our lowercase `mukadma` + `मुक़दमा` (nukta). Fix: the decorative underline currently collides with the Devanagari baseline — drop it below the descenders (`mukadma`'s tail + मुक़दमा's नुक़्ता) with correct `line-height`/`margin`, re-balance mark-to-wordmark gap. Ship 390/768/1440 before/after.

## F2 — Share case file + Export as PDF (code-first build)
Founder F2 = BUILD both properly (not "SOON"). Uses `ConfirmAction`/`Dialog` + `useToast`. **Share** = generate a real scoped, expiring link (server-side token) — honest permissions copy, no fake "anyone with the link" if it's tenant-scoped. **Export as PDF** = real server render of the case file. Both live in the case `⋯` actions menu, replacing the disabled "SOON" items. If either backend isn't ready, keep it disabled with an honest "coming soon" — never a dead button that looks live.
