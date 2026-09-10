# Week 2 — CSS Foundations and Responsive Layout

Portfolio v2. The Week 1 markup, now styled and responsive. No CSS framework and
no JavaScript.

## What this is

The same single-page profile site from Week 1, with a stylesheet built from a
small set of design tokens, laid out with Flexbox and Grid, and made responsive
from 320px upwards.

The finished page for the week is:

`Day 10/Responsive Design and Weekly Build/index.html`

## How to run it

No build step and no dependencies.

1. Clone or download this repository.
2. Open `Day 10/Responsive Design and Weekly Build/index.html` in any browser.

Double-clicking works. To serve it over HTTP instead, so the Network panel shows
real requests and I can see which image file `srcset` actually chooses:

```bash
python -m http.server 8000
```

and open `http://localhost:8000`.

## Folder layout

```text
Day 6/Cascade, Selectors and Box Model/    first stylesheet, box model demo
Day 7/Typography, Color and Variables/     design tokens, type and spacing scale
Day 8/Flexbox/                             header, nav, card rows, form controls
Day 9/CSS Grid/                            card grids, gallery, track demo
Day 10/Responsive Design and Weekly Build/ mobile-first breakpoints, Portfolio v2
```

Each day keeps its own snapshot of the page, so the stylesheet can be read as it
grew rather than only in its final state.

## The design system

Every value in the stylesheet comes from a token declared in `:root`. There is no
hex code and no raw pixel value anywhere else in the file.

- **Type scale** — six steps, roughly a 1.25 ratio. The three heading steps are
  fluid with `clamp()`; body text stays at `1rem` so it follows the reader's
  browser setting.
- **Spacing scale** — six steps, all multiples of 4.
- **Colour** — named by role (`--color-brand`, `--color-text-muted`,
  `--color-surface`) rather than by appearance, with a separate `--color-focus`
  so the focus ring never blends into a brand-coloured control.
- **Utilities** — a short list of single-purpose classes, kept deliberately
  short so they do not turn into inline styles with extra steps.

## Layout

Both layout systems are used, chosen per component rather than by preference:

| Component | System | Why |
|-----------|--------|-----|
| Site header | Flexbox | Photo is content-sized, text absorbs the remainder |
| Navigation | Flexbox | One wrapping line of links |
| Topic cards | Grid | Equal columns that line up |
| Project gallery | Grid | Two dimensions, equal row heights, a spanning card |
| Form fields | Flexbox | Label stacked over its control |
| Footer | Flexbox | Two items pushed apart on one axis |

The short version of the rule: if items have to line up with items in *other*
rows, it is Grid. Otherwise Flexbox is less to declare.

## Responsive approach

Mobile first. The base stylesheet is the small-screen layout and there are two
`min-width` breakpoints, both taken from where the content stopped looking right
rather than from device sizes.

- `40em` (640px) — the header becomes a row, the photo grows, the buttons sit
  side by side, and the featured project card spans two columns
- `64em` (1024px) — spacing only

Most of the responsiveness is not in a breakpoint at all: `max-width` for fluid
containers, `repeat(auto-fit, minmax(min(220px, 100%), 1fr))` for the grids,
`clamp()` for headings, `65ch` for line length.

Images use `srcset` and `sizes` so a phone downloads a 42KB file instead of the
520KB original, with `width` and `height` attributes on the tag to reserve space
and avoid layout shift.

## What I learned this week

- The cascade resolves by origin, then specificity, then source order — and
  specificity columns are compared, not added, so a class can never catch an ID.
- `border-box` should be the default, because `width` then means the width I
  actually see.
- Custom properties inherit and are live at runtime, which is what makes them
  different from build-time variables.
- Flexbox distributes items along one axis; Grid places items onto shared tracks
  in two. That single difference decides which one a component needs.
- `min-width: 0` on a flex item and `minmax(0, 1fr)` on a grid track are the same
  fix for the same automatic minimum I never wrote.
- A breakpoint should only ever add; if it undoes something, the base layout was
  written for the wrong screen.
- Custom properties do not work inside a media query condition, and they fail
  silently.

## Checks I ran

- No horizontal scrolling at 320, 390, 640, 768, 1024 and 1440px
- Browser zoom to 200% at 1280px
- Tabbed the whole page at both narrow and wide widths; visual order and tab
  order still match
- Focus visible on every interactive element, including the table scroll
  container; `outline: none` appears nowhere
- Text contrast checked with the DevTools colour picker; all above 4.5:1
- Network panel checked to confirm which image candidate is downloaded at each
  viewport size

## Week 2 completion checkpoint

- [x] No horizontal scrolling on common mobile widths
- [x] Flexbox and Grid both used intentionally
- [x] Visible focus states
- [x] README with setup steps and what I learned
- [x] Five daily commits

## Next week

Week 3 is JavaScript fundamentals: values and operators, control flow, functions
and scope, arrays and objects, then a console-based expense analyzer with input
validation and error handling.
