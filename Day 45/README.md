# Week 9 — Modern Angular Fundamentals

The reading list again, in Angular 22. Standalone components, no NgModule, the
built-in control flow, and typed component communication.

## What this is

Five days learning Angular by rebuilding something I already understood, which
turned out to be the right way round: every difference stood out because the
behaviour was fixed.

The finished app for the week is:

`Day 45/Inputs, Outputs and Mini Build/`

## How to run it

```bash
cd "Day 45/Inputs, Outputs and Mini Build"
npm install
npm start          # ng serve
npm run build      # ng build
npm run typecheck  # tsc -b --force
```

No network needed — the data is a constant. The API arrives in Week 11.

## Folder layout

```text
Day 41/Angular CLI and Project Setup/   the scaffold, explained file by file
Day 42/Standalone Components/           six components, ng-content, :host
Day 43/Template Binding and Events/     the five bindings, and events
Day 44/Control Flow and Lists/          @if, @for, @empty, @switch, @let
Day 45/Inputs, Outputs and Mini Build/  input(), output(), model()
```

Each day carries the previous day's components forward, so the diff between two
folders is the day's work.

## Architecture

```text
src/main.ts              bootstrapApplication(App, appConfig)
src/app/app.config.ts    the providers - one, so far
src/app/domain.ts        the model: 3 unions, their labels, 1 guard, seed data
src/app/app.ts + .html   the parent: 4 signals, 4 computeds, 6 handlers
src/app/panel.*          ng-content, a named slot, :host
src/app/book-card.*      3 inputs, 3 outputs
src/app/filter-bar.*     1 model, 4 inputs, 2 outputs
src/app/badge.ts         inline template
src/app/stat.ts          inline template, host class
src/app/empty-state.ts   projects a hint
src/styles.css           global: Day 10's tokens, third framework
```

Component styles are scoped automatically, so `src/styles.css` holds only the
tokens and the shared classes — scoping a design token would defeat it.

## Configuration worth knowing

`ng new` in Angular 22 does **not** turn on `strict`. It enables
`noImplicitOverride`, `noPropertyAccessFromIndexSignature`,
`noImplicitReturns` and `noFallthroughCasesInSwitch`, and leaves
`strictNullChecks` and `noImplicitAny` off.

So `tsconfig.json` here adds:

```jsonc
"strict": true,
"noUnusedLocals": true,
"noUnusedParameters": true,
"noUncheckedIndexedAccess": true,
"exactOptionalPropertyTypes": true,
"lib": ["ES2023", "DOM", "DOM.Iterable"],
```

```jsonc
"angularCompilerOptions": {
    "strictTemplates": true,
    "strictInjectionParameters": true,
    "strictInputAccessModifiers": true
}
```

Turning on `strict` broke the CLI's own generated `main.ts` immediately — its
`.catch((err) => ...)` is an implicit `any`. And `lib` had to be written out
because Day 44 needed `toSorted`, which produced the same error Day 24 did:
`lib` defaults from `target`, and the CLI sets only `target`.

**`strictTemplates` is the one that matters most.** It type-checks the HTML
against the class, including through component inputs, so `{{ book().titl }}`
does not compile. Without it a separate template file is a large blind spot;
with it, it is fine.

## What is better than React here

Honest list, after five days.

- **`computed()` has no dependency array.** Angular records which signals were
  read while the computation ran. `useMemo` needs the array written by hand,
  and a wrong array is a stale value with no error — a mistake I actually made
  on Day 32. Not expressible here.
- **`track` is mandatory.** React warns in the console about a missing `key`;
  Angular refuses to compile. Having demonstrated what a wrong `track` does
  (below), the mandatory version is obviously right.
- **`@empty` belongs to the loop.** React's
  `{list.length === 0 ? <Empty/> : list.map(...)}` states the condition and
  then the loop states it again by producing nothing.
- **A missing component import is a compile error** naming the unknown
  element. React gives a lowercase tag rendering silently.
- **Scoped component styles, with no configuration.** This is what I would
  reach for CSS Modules to get.
- **Smaller output.** 40 kB transfer against the Week 8 React app's 92 kB
  gzipped — not a fair comparison, since this app has no router and no tests,
  but nowhere near the difference Angular's reputation implies.

## What is worse

- **`@switch` has an optional `@default` and no exhaustiveness check.** Adding
  a sixth request phase renders silence rather than failing to compile, and
  `strictTemplates` does not help. The `never` check from Day 22 is strictly
  stronger, and the closed list has to live on the class instead.
- **Property against attribute is mine to know.** `[disabled]` sets a
  property; `disabled="false"` sets an attribute and disables the button
  permanently. React maps the names for me.
- **A template cannot narrow a type.** `$event.target` is
  `EventTarget | null` and there is no `instanceof` in an expression language,
  so the honest fix is always a method on the class. The project has exactly
  one `$any()`, next to the method that makes it unnecessary.
- **`:host` and `host: { class: ... }` exist because a component is an
  element.** `Stat` has to put its class on its own host because wrapping its
  spans in an `<li>` would nest an `<li>` inside an `<app-stat>` inside a
  `<ul>`. React renders no wrapper and has no such problem.
- **Dependencies are invisible.** The flip side of automatic tracking: reading
  a `computed` does not tell me what it depends on without following every
  call.

## The track demonstration

The thing I am most glad I built. Two lists, the same data, `track book.id` on
one and `track $index` on the other, with a text input in each row that Angular
never writes to — so the typed text lives only in the DOM node's identity.

Typed `MARK` into the first row of each, then reversed the list:

```text
track id    : An Undated Anthology=-    | Beloved=- | Things Fall Apart=MARK
track index : An Undated Anthology=MARK | Beloved=- | Things Fall Apart=-
```

The left list **moved the node** — the text followed its book to position 3.
The right list **kept the nodes and swapped the text**, so `MARK` is now
attached to a different book.

Three weeks of writing "an index breaks reordering" and this is the first time
I have watched it happen.

## Component communication

| Mechanism | Used for |
|-----------|----------|
| `input.required<T>()` | A value the child cannot work without |
| `input<T>(default)` | `showControls`, so one component serves two uses |
| `input<T, A>({ transform })` | `position`, so a static `"7"` arrives as a number |
| `output<T>()` | `statusChange`, `remove`, `edit` |
| `model<T>()` | `query`, where the child owns the value |

The rule I settled on:

> `model()` when the child owns the value and the parent just holds it.
> `input` + `output` when the parent does something with the change.

`query` is a `model()` and needs no handler on the parent — proven by the
parent's event log not moving when the query changes. `filter` and `sort` are
`input` + `output`, because `clearFilters` and `reset` need the parent to be
the one deciding.

And the status guard lives in the **card**, so its output emits a `Status`
rather than a string the parent would have to validate. A component that emits
`string` has moved the problem, not solved it.

## What I learned this week

- Angular 22 has no NgModule. `bootstrapApplication` plus per-component
  `imports` replaces it, and most Angular material online still starts with the
  module.
- A component is a class and a decorator. The template is separate, and can see
  the class's `protected` members — a visibility React has no use for.
- Selectors are global and matched by tag name, so the prefix is a real
  namespace.
- `<ng-content>` is a placeholder, not a value. A named slot with `select`
  replaces a prop entirely, and projected content is compiled in the
  **caller's** context.
- `:empty` collapsed an actions wrapper without the component needing to know
  whether anything was projected.
- Interpolation takes an expression, not a statement — which pushes logic onto
  the class, where it is type-checked.
- `[class.x]`, `[class]` and a static `class` are three independent sources
  that coexist. `[style.width.%]` appends the unit.
- `.update()` on a signal says "derived from the previous value".
- `[(x)]` is `[x]` plus `(xChange)`, and `model()` generates the output.
- `@let` is a declaration scoped to the rest of the template — a name for a
  condition.
- `$event` is the emitted payload on an output and the DOM event on a DOM
  event.

## Checks I ran

Every day type-checks (`tsc -b --force`) and builds (`ng build`) clean. Each
day's built bundle was then loaded into jsdom and driven through its real event
handlers:

- **Day 41** — the tree renders; the deliberately sparse record falls back to
  "Author unknown" / "Publication year unknown"; `_ngcontent-*` confirms style
  scoping
- **Day 42** — stats projected through `Panel` still read `App`'s fields; the
  `Clear` button landed in the named slot and the other two action wrappers
  are empty and collapsed; `Stat`'s class is on its host; `_nghost-*` present
- **Day 43** — all five bindings: the `disabled` property following in both
  directions, `aria-describedby` set via `attr.`, three coexisting class
  sources, `width` 40% → 75% via a style binding, a `KeyboardEvent` handler
  clearing the field on Escape
- **Day 44** — four sorts (undated last by year), status filter, author search,
  both empty states, `@switch` through five phases, nested `@for` with
  shadowed `$index`, and the `track` demonstration above
- **Day 45** — three outputs with typed payloads, `model()` updating the parent
  with no handler, `showControls={false}` removing the controls, and a static
  `position="7"` arriving as a number

No console errors at any point.

Two mistakes of my own that the checks caught: `toSorted` missing from the
default `lib` (Day 44), and a heredoc that silently wrote nothing, which is why
every file gets a line count after it is written.

## Week 9 completion checkpoint

- [x] Standalone components throughout, no NgModule anywhere
- [x] Modern template control flow — `@if`, `@for`, `@empty`, `@switch`, `@let`
- [x] `input()` and `output()`, typed, including a transform and a `model()`
- [x] Clear component boundaries, with controls living in the component they
      control
- [x] `strict` and `strictTemplates` on, over the CLI's defaults
- [x] Five daily commits

## Known limitations

- **No routing.** One screen. Week 11 in the course outline; not covered here.
- **No service layer.** All state is in the root component. Day 47 fixes it.
- **No forms.** The `edit` output records an event and opens nothing. Day 49.
- **No tests.** Angular's `ng test` target is configured (Vitest + jsdom) and
  unused. Week 11 in the outline.
- **Nothing persists.** Reload and the list resets to the seed data.
- **The author sort puts unknown authors first**, because the comparator is
  `(a.authors[0] ?? '')` and an empty string sorts before everything. The year
  comparator uses `?? -Infinity` and puts unknowns last. The year one is right;
  this is the same inconsistency the React app has carried since Day 30, and
  fixing it in one of four places would be worse than recording it.

## Next week

Week 10 is Angular's reactive model properly: `signal`, `computed` and
`effect`, dependency injection with `inject()`, a service owning the domain
logic, and a typed reactive form with validation.
