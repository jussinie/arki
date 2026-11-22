# Tide UI — Tickets

Visual identity "Tide" for Arki: water-first, calm, with the water-level orb as the hero. Four tickets can start now; two follow-ups are blocked by other backlog items.

Each ticket is one story (WIP limit of one), lists its write allowlist, and is **Tier 2** (UI polish) per `AGENTS.md`.

| #   | Ticket                                     | Depends on            |
| --- | ------------------------------------------ | --------------------- |
| 1   | Tide design tokens (light and dark)        | —                     |
| 2   | Self-host the Outfit font                  | 1                     |
| 3   | Water orb replaces the goal bar            | 1                     |
| 4   | Tide quick-add buttons and today layout    | 3                     |
| 5   | Tide styling for the day summary           | F-2 (follow-up)       |
| 6   | Tide tab bar                               | Router ticket (follow-up) |

---

## 1. Tide design tokens (light and dark)

**Why:** Colours are hardcoded in five CSS files and there is no dark mode. One token set lets every later Tide ticket restyle by token, not by hex.

### Scope

- Create `src/shared/ui/tokens.css` with these custom properties on `:root`:

| Token                | Light                            | Dark      | Use                                      |
| -------------------- | -------------------------------- | --------- | ---------------------------------------- |
| `--color-bg`         | `#EAF2F3` (Mist)                 | `#0F2229` | page background                          |
| `--color-surface`    | `#FFFFFF`                        | `#17323B` | cards, inputs, secondary buttons         |
| `--color-text`       | `#12303A` (Ink)                  | `#E6F1F2` | body text                                |
| `--color-text-muted` | `#4A6670`                        | `#9DB7BD` | dates, labels                            |
| `--color-primary`    | `#12303A`                        | `#5CC4C0` | primary button background                |
| `--color-on-primary` | `#FFFFFF`                        | `#0F2229` | text on primary                          |
| `--color-accent`     | `#176B6B` (Teal, darker for text)| `#5CC4C0` | links, secondary button text, focus ring |
| `--color-water-top`  | `#7FD1CF` (Wave)                 | `#7FD1CF` | water gradient top                       |
| `--color-water-deep` | `#1F8A8A` (Teal)                 | `#3FA9A6` | water gradient bottom                    |
| `--color-food`       | `#F2795B` (Coral)                | `#F48A6F` | food progress (later)                    |
| `--color-success`    | `#1B7A3A`                        | `#6FD394` | goal reached                             |
| `--color-error`      | `#B3261E`                        | `#FF8A80` | error messages                           |
| `--color-border`     | `#C9DADD`                        | `#2A4A54` | dividers, input borders                  |

- Radii: `--radius-sm: 0.5rem`, `--radius-lg: 1rem`, `--radius-pill: 999px`.
- Dark values go in `@media (prefers-color-scheme: dark)` together with `color-scheme: dark`.
- Import `tokens.css` at the top of `src/app/global.css`; set `body` background and colour from the tokens.
- Replace every hardcoded colour in the allowed files with a token. Don't change layout.

> Note: Teal `#1F8A8A` is only 3.65:1 on Mist, too low for text. Use `--color-accent` (`#176B6B`, 6.27:1 on white) for text and focus rings; keep `#1F8A8A` for the water fill only.

### Files allowed

- `src/shared/ui/tokens.css` (new)
- `src/app/global.css`
- `src/app/App.css`
- `src/app/DateNavigator.css`
- `src/features/session/ui/SignInPage.css`
- `src/features/water/ui/WaterTracker.css`

### Acceptance

```gherkin
Scenario: Light theme uses the Tide palette
  Given my device is in light mode
  When I open today's view
  Then the background is Mist and the text is Ink

Scenario: Dark theme follows the device
  Given my device is in dark mode
  When I open today's view or the sign-in page
  Then every screen uses the dark token values
  And no text or button is unreadable
```

- [ ] No hex colours remain in the listed CSS files except in `tokens.css` (`grep -rn '#[0-9a-fA-F]\{3,6\}' src --include=*.css`).
- [ ] All text meets WCAG AA (4.5:1) in both themes. The values above already meet it.
- [ ] Existing unit and e2e tests pass unchanged.

**Out of scope:** fonts, layout changes, the water orb.

---

## 2. Self-host the Outfit font

**Why:** Tide's look depends on Outfit. Self-hosting avoids sending users' requests to Google, which also helps the open privacy question for health-related data.

### Scope

- Add the `@fontsource/outfit` dependency.
- Import weights 400, 600 and 700 in `src/app/main.tsx`.
- In `tokens.css`, add `--font-sans: 'Outfit', system-ui, -apple-system, 'Segoe UI', sans-serif;` and use it on `body` in `global.css`.
- In `index.html`, add `<meta name="theme-color">` for light (`#EAF2F3`) and dark (`#0F2229`), each with a `media` attribute.

### Files allowed

- `package.json`, `package-lock.json`
- `src/app/main.tsx`
- `src/shared/ui/tokens.css`
- `src/app/global.css`
- `index.html`

### Acceptance

- [ ] In the Network tab, the font loads from the app's own origin; no request goes to `fonts.googleapis.com`.
- [ ] If the font fails to load, text falls back to the system font without the layout breaking.
- [ ] `npm run build` passes; the bundle grows by less than about 100 KB (load only the Latin subset if needed).

**Depends on:** 1

---

## 3. Water orb replaces the goal bar

**Why:** The water level is the hero of Tide. A circle that fills like a glass shows progress more clearly and gives a small reward each time water is logged.

### Scope

- New `src/features/water/ui/WaterOrb.tsx` and `WaterOrb.css`. Write `WaterOrb.test.tsx` first (Red-Green-Refactor).
- Props: `consumedMl`, `goalMl`. Fill height comes from the existing `waterGoalFillPercent()`; goal-reached state from `isWaterGoalReached()`. Add no new calculation logic.
- Build:
  - Circle about 12rem across, `--color-surface` ring, `overflow: hidden` with `border-radius: 50%`.
  - Water body: bottom-anchored block with a `--color-water-top` → `--color-water-deep` gradient and `height: <percent>%`.
  - Wave surface: inline SVG path twice the orb's width on top of the water; a CSS animation slides it sideways in a loop of about 6 s.
  - Height change: transitions over about 600 ms with ease-out.
  - Centre text: litres in large type (e.g. "1.55 L"), below it "of 2 L · 78%".
  - Goal reached: orb full, ✓ in `--color-success`; keep the existing "Goal reached" label.
  - `prefers-reduced-motion: reduce`: no wave animation, no height transition.
- Keep the accessibility contract of the current bar: `role="progressbar"`, `aria-label="Daily water goal"`, and the same `aria-valuemin`, `aria-valuemax`, `aria-valuenow` and `aria-valuetext`.
- In `WaterGoalMeter.tsx`, replace the bar markup with `<WaterOrb>`. The goal form stays where it is in this ticket.

### Files allowed

- `src/features/water/ui/WaterOrb.tsx` (new)
- `src/features/water/ui/WaterOrb.css` (new)
- `src/features/water/ui/WaterOrb.test.tsx` (new)
- `src/features/water/ui/WaterGoalMeter.tsx`
- `src/features/water/ui/WaterTracker.css` (remove the old `.water__bar*` rules)

Existing tests are read-only.

### Acceptance

```gherkin
Scenario: Orb shows progress toward the goal
  Given my goal is 2 L and I have logged 500 ml
  When I open today's view
  Then the orb is filled to 25%
  And it reads "0.5 L" and "of 2 L · 25%"

Scenario: Adding water raises the level
  Given the orb is at 25% of a 2 L goal
  When I add 3 dl
  Then the orb rises to 40% without a page reload

Scenario: Goal reached
  Given my goal is 2 L
  When I log 2 L or more
  Then the orb is full and shows "Goal reached"
  And it never shows more than 100%

Scenario: Reduced motion
  Given my device has reduce motion turned on
  When I open today's view
  Then the wave does not move and the level changes without animation
```

- [ ] `fast-check` property test: for any consumed amount ≥ 0 and any valid goal, the rendered fill stays between 0 and 100%, and `aria-valuenow` never exceeds `aria-valuemax`.
- [ ] `e2e/water-goal.spec.ts` and `e2e/add-water.spec.ts` pass unchanged.
- [ ] Looks right at 360 px wide and on desktop, in both themes.

**Depends on:** 1

---

## 4. Tide quick-add buttons and today layout

**Why:** Logging should be one tap, and the screen should lead with the orb and the add buttons, with everything else secondary.

### Scope

- Order on today's view: date heading and date navigator → orb → quick-add row → goal setting.
- Quick-add (1, 2, 3, 4 dl) becomes a single row of pills: `--radius-pill`, at least 44 px tall. 2 dl is the primary pill (`--color-primary`); the others use `--color-surface` with `--color-accent` text. On narrow screens the row wraps to two lines.
- The goal form moves under an "Edit goal" disclosure (`<details>` / `<summary>`), closed by default. If saving fails, it opens and shows the error. The input label "Daily water goal (L)" and the "Save goal" button keep their text.
- Header: "Arki" and the sign-out button stay; the email moves to `--color-text-muted` in smaller type.
- Focus rings everywhere: `--color-accent`, 2 px wide, 2 px offset.

### Files allowed

- `src/features/water/ui/WaterTracker.tsx`
- `src/features/water/ui/WaterTracker.css`
- `src/features/water/ui/WaterGoalMeter.tsx`
- `src/app/App.tsx` (markup order only)
- `src/app/App.css`
- `src/app/DateNavigator.css`
- `src/features/water/ui/*.test.tsx` — only where the disclosure changes the interaction

### Acceptance

```gherkin
Scenario: Quick add from the main row
  Given I am on today's view
  When I tap "2 dl"
  Then 200 ml is added and the orb rises

Scenario: Goal setting is tucked away
  Given I am on today's view
  Then the goal form is hidden behind "Edit goal"
  When I open "Edit goal", enter 2.5 and save
  Then the goal is 2.5 L

Scenario: Save error is visible
  Given saving the goal fails
  Then "Edit goal" is open and shows "Could not save the water goal. Try again."
```

- [ ] Every button and input is reachable by keyboard with a visible focus ring.
- [ ] If an e2e test fails only because the goal form is now behind the disclosure, update it to open "Edit goal" first, and call that change out in the PR. Nothing else in the e2e suite changes.

**Depends on:** 3

---

## Follow-ups (create now, refine later)

### 5. Tide styling for the day summary

**Blocked by:** F-2.

Coral energy bar plus meal cards (`--color-surface`, `--radius-lg`, meal name on the left, kcal on the right with `font-variant-numeric: tabular-nums`). Coral is 2.41:1 on Mist, below the 3:1 a graphic needs, so the bar needs a `--color-border` track or a darker coral — decide in this ticket.

### 6. Tide tab bar (Today / Log / Trends / Me)

**Blocked by:** the router library ticket.

Fixed bottom bar using the tokens, padded by `env(safe-area-inset-bottom)`, active tab in `--color-accent`. Add only tabs that have real routes.
