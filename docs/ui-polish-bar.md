<!-- MIRROR of exec/skills/ui-polish-bar.md (WO-36). Canonical source is the exec pack; kept in-repo so both
     the deterministic gate (Layer 1) and the agentic UX judge (Layer 2) score against ONE rubric. Do not fork — update the exec source, then re-mirror. -->

# SKILL · UI Polish Bar — nothing on screen may look lame
**Applies to: every screen, page, panel, card, table, empty state, modal, toast — no exceptions. Read by the Design-Engineer agent and enforced by the Code-Reviewer. "It works" is not "it's done"; it must also be presented beautifully, clearly, and on-brand.**

The bar: if a senior product designer glanced at this screen, would they wince at anything? A cramped box, a lonely control, misaligned edges, a stat with no context, default-looking spacing, a raw error string — any of these = not done. Fix it before it ships.

---

## 1. The non-negotiable visual checklist (every view passes ALL of these)
- **Alignment & grid:** everything on a consistent 4px rhythm; edges align; no off-by-a-few-pixels drift; optical alignment where mathematical looks wrong.
- **Spacing:** deliberate and consistent (token spacing, never arbitrary). Generous breathing room; nothing cramped against an edge or another element. One spacing scale, used consistently.
- **Hierarchy:** the eye lands on the most important thing first. Size/weight/colour express importance — not everything is the same visual weight. One clear primary action per view.
- **Typography:** Fraunces for display, Inter for UI, tabular numerals for any date/₹/count. No orphaned single words, no walls of same-size text, correct line-height, no text touching a container edge.
- **Colour discipline:** one brass accent per screen; ink/paper/hairlines do the structure. No random colours, no gradient-for-drama, no drop-shadow soup. Semantic colours only for status.
- **Density that respects lawyers:** information-dense but never cluttered — ledger lines and hairlines, not a card around every atom. Scannable.
- **States are designed, not defaulted:** loading (skeleton, not a spinner-on-blank), empty (helpful, branded, with the next action — never a bare "No data"), error (human message + recovery, never a raw stack/`[object Object]`), success. All four exist for every data view.
- **Interaction feel:** real hover, focus rings (a11y + polish), pressed states, sensible transitions (respect reduced-motion). Nothing feels dead.
- **Responsive:** genuinely good at 390 / 768 / 1440 — not just "doesn't break." Mobile is designed, not squished.
- **Bilingual integrity:** layout survives the longest locale (Hindi/Gujarati often longer); Devanagari renders crisply; nothing clips or wraps ugly.
- **Content quality:** real, sensible labels and microcopy in brand voice (BRAND.md) — never "lorem", never a dev placeholder, never a truncated/awkward label.

## 2. The "lame → elegant" instinct (what to catch)
| Lame (reject) | Elegant (ship) |
|---|---|
| A stat as a bare number | a number with a label, unit, and context/trend |
| A box with a border and cramped text | a card with a clear header, spacing, hierarchy, one action |
| "No data" / blank table | a designed empty state: what this is, why it's empty, the next step |
| Raw error text / red banner of a stack trace | a calm human message + a way forward |
| Everything same size, left-aligned, evenly grey | clear hierarchy; the important thing is obvious |
| A lonely button floating mid-screen | anchored, grouped, with intent; primary vs secondary distinct |
| A form that's just stacked inputs | grouped sections, sensible widths, inline validation, aligned labels |

## 3. Scout before you build (research is allowed and encouraged)
For any non-trivial screen, **look at how the best solve it** before designing — flag the tool to the founder per the design-engineer tooling rule, then:
- Study reference/competitor patterns (Clio, Linear, Stripe dashboards; Indian legal/fintech apps; eCourts for the domain's mental model) for *information layout and interaction*, not to copy pixels.
- Pull the pattern back **into our theme** (Editorial Chambers) — never paste someone else's visual language. The reference informs structure; `tokens.css` + BRAND.md dictate the look.
- If a genuinely better layout for our data exists than the concept shows, propose it (with a rendered mock) rather than shipping a weaker default.

## 4. Verify by looking (not by hoping)
- **Render and inspect every screen yourself** at 390/768/1440 in en + the longest locale before calling it done (rasterize + view; Playwright shots for auth-gated screens). You cannot polish what you haven't looked at.
- Compare against `design/ui-concept.html` and this checklist. If it's below the bar, iterate — a passing typecheck is not a passing screen.

## 5. Enforcement (Code-Reviewer)
A UI PR is **rejected** if any §1 item fails, any §2 "lame" pattern is present, or the author didn't render-and-inspect. This is not nitpicking — presentation is the product for a trust-based legal tool. Reviewer attaches the failing checklist item.

## 6. Definition of Done (adds to the design-engineer DoD)
☐ every §1 checklist item passes · ☐ zero §2 lame patterns · ☐ four states designed · ☐ rendered-and-inspected at 3 widths × 2 locales · ☐ on-brand (tokens + voice) · ☐ any reference/tool used was flagged to founder.
