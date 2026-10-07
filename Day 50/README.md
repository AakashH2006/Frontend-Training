# Week 10 — Angular Signals, Services and Forms

Local reactive state with signals, domain logic in services behind dependency
injection, and a typed reactive form with validation.

## What this is

Five days on Angular's reactive model, finishing with a create-and-edit flow
over a domain the previous nine days had not used.

The finished app for the week is:

`Day 50/Contact Manager Weekly Build/`

## How to run it

```bash
cd "Day 50/Contact Manager Weekly Build"
npm install
npm start          # ng serve
npm run build      # ng build
npm run typecheck  # tsc -b --force
```

No network needed. The list persists in `localStorage` behind a version
envelope.

## Folder layout

```text
Day 46/Signals and Computed State/        signal, computed, effect, untracked, linkedSignal
Day 47/Dependency Injection and Services/ @Injectable, inject, InjectionToken, scope
Day 48/Component Communication/           input/output/model/service, and choosing
Day 49/Reactive Forms and Validation/     typed FormGroup, 4 validators
Day 50/Contact Manager Weekly Build/      the week's build, on a new domain
```

Days 46–49 build on the reading list from Week 9. Day 50 changes domain
deliberately — see below.

## Architecture

```text
src/app/domain.ts              the model, 3 unions, 4 guards
src/app/contacts.service.ts    state, derived values, actions
src/app/storage.service.ts     the storage boundary and its 4 failure modes
src/app/tokens.ts              2 InjectionTokens
src/app/notifications.service.ts  a service with one signal and three methods
src/app/validators.ts          6 validators, incl. 1 group-level
src/app/contact-form.*         7 controls, 5 kinds
src/app/contact-card.*         inputs in, outputs out, injects nothing
src/app/app.*                  one signal: which contact is being edited
```

Every piece of state is in a service except `editingId`, which is a view
concern and belongs to the component that renders the form.

### The service shape

```ts
private readonly contactsSignal = signal<readonly Contact[]>(...);
readonly contacts = this.contactsSignal.asReadonly();
```

`.asReadonly()` is the line that makes it a store rather than a bag of signals.
A component can read it and cannot write it, so an action is the only way in —
Day 19's "export actions, not state", enforced by the type instead of by a
comment.

It has a visible cost: a readonly signal cannot be the target of `[(x)]`, so
two-way binding stops being available the moment state moves somewhere that
protects it. That is a good trade and a clean demonstration that `[(x)]` is
just `[x]` plus `(xChange)`.

## What signals do that the alternatives did not

Measured rather than asserted, on Day 46:

- **`computed` is lazy and cached.** Four reads, one evaluation — and cached
  globally, not per component as `useMemo` is.
- **It notifies on a changed *value*, not a changed dependency.** `count` 2 → 4
  stops at `isEven` and nothing downstream re-runs. React has no equivalent; a
  memo's consumers re-render with their component regardless.
- **Dependencies are tracked automatically.** No array, so the Day 32 mistake —
  `[state]` instead of the four fields it actually read — is not expressible.

That last two together are why Day 46 split one filter-search-sort computed into
three named stages: the graph caches each, so changing the sort does not redo
the filtering, and the split costs nothing because there are no arrays to keep
correct.

The trade is that **dependencies are invisible**. Reading a `computed` does not
tell you what it depends on without following every call.

### effect, used once

```ts
effect(() => { document.title = ...; });
```

One effect in the whole week's app, for the document title. Day 33's test holds
unchanged: *name the outside thing.* Everything else is a computed.

Angular **allows** writing signals from an effect, unlike from a computed, so
`untracked` around the write is my discipline rather than the framework's.
Worth knowing which guardrail is which.

## Dependency injection

| Thing | How |
|-------|-----|
| A service | `@Injectable({ providedIn: 'root' })` — registers it *and* makes it tree-shakable |
| Getting one | `inject()` in a field initialiser — works where a constructor does not |
| A value | `InjectionToken` with a `factory` default |
| Overriding it | `{ provide: TOKEN, useValue: ... }` in `app.config.ts` |
| A private instance | `providers: [X]` on a `@Component` |

A string cannot be injected by its type, because every string has the same
type — the token *is* the identity. And its value is resolved at runtime by
whoever configures the app, which an imported constant never is:

```text
injected opts : maxBooks = 50     (the app's override, not the token's 100)
```

Injection scope, demonstrated with visible instance ids:

```text
after A x2   : 3evc9 = 2 | 3evc9 = 2 | s13mi = 0
after own x1 : 3evc9 = 2 | 3evc9 = 2 | s13mi = 1
```

Two components share the root instance; the third has `providers` of its own.

## Choosing a communication mechanism

One question decides it:

> **Do the producer and the consumer have a useful common parent?**
> If yes, start with inputs and outputs. If no, it is a service.

| Mechanism | For |
|-----------|-----|
| `input()` | a value the child renders |
| `output()` | something happened, so the parent decides what it means |
| `model()` | the child owns the value |
| a service | no useful common parent |

Day 48 built the case that makes it obvious: a toolbar three levels down needing
two services, with three components in between that need neither. By props that
is twelve declarations to move two values; by injection the toolbar takes
nothing from its parents.

**And the opposite failure is easier to cause.** Prop drilling is the famous
problem; a service is so easy to inject that every component ends up coupled to
the application and nothing can be rendered on its own. The test:

> Could this component be rendered twice on one page, against different data?

`ContactCard` can — it injects nothing, takes a contact and emits three events.
It could call `contacts.remove(id)` directly and that would be fewer lines and
worse: untestable without the service, unusable against a second list, and the
parent could no longer raise a notice when a contact is removed, which is
exactly what it does.

## Reactive forms

```ts
interface ContactFormControls {
    name: FormControl<string>;
    favourite: FormControl<boolean>;
    group: FormControl<Group>;
    // ...
}
```

The form owns the value, so there is no `[value]` and no `(input)` anywhere —
and no draft object on the class. The cost is that the connection is by
**string**: `formControlName="nmae"` compiles and throws at runtime. Typed forms
type the class, not the template.

`nonNullable` removes `| null` from every control and makes `reset()` return to
the initial value rather than to null, which is what the types were already
claiming.

Six validators, and the interface is one function:

| Validator | Why it exists |
|-----------|---------------|
| `notBlank` | `Validators.required` **passes** a whitespace-only string |
| `looksLikeEmail` | deliberately permissive — see below |
| `looksLikePhone` | catches "no digits" and letters, permits every format |
| `emailOrPhone` | group-level: at least one of two optional fields |
| `uniqueEmail` | excludes the record being edited, or editing anything else fails |
| `maxTags` | a factory, because the limit is configuration |

The error **key** is the contract. Returning `{ maxTags: { limit, actual } }`
rather than a message keeps the wording in the template and the validator about
the rule.

### Permissive on purpose

The full email grammar is unmatchable by a sane regular expression, and a strict
pattern rejects addresses that work.

> A validator that rejects a valid value is worse than one that accepts an
> invalid one, because the user cannot argue with it.

So `looksLikeEmail` checks the shape a typo breaks and nothing else. That is the
opposite instinct from the year validator on Day 49, where the bounds are
genuinely knowable — and knowing which kind of rule you have seems to be the
whole skill.

### Showing errors

`touched` fires on **blur**, so it alone turns a form red before it has been
used. The rule is `invalid && (touched || submitted)`, plus
`markAllAsTouched()` on an invalid submit — without which an untouched submit
shows the summary and no inline errors.

And **not** `[disabled]="form.invalid"`. A disabled submit gives no reason,
cannot be focused to find out why, and is simply broken when the error is one
the user cannot see.

### The error summary

Day 38's pattern, now in its third framework: a focusable `role="alert"` region
listing every problem in field order, each linked to its field, with
`aria-invalid` and `aria-describedby` on every invalid control. It is the single
accessibility feature I have carried furthest, and it is the one I would add
first to any form.

## Value accessors

The sharpest thing I learned this week, and it came from a bug.

**An input's `type` selects a value accessor, which can change the control's
runtime type regardless of what it is declared as.**

```text
type="number"   -> NumberValueAccessor   -> writes a number
type="checkbox" -> CheckboxValueAccessor -> writes a boolean
type="email"    -> default               -> writes a string
type="tel"      -> default               -> writes a string
<select>        -> SelectValueAccessor   -> writes the option's value
```

On Day 49 a `type="number"` input was bound to a `FormControl<string>`, so
`raw.year.trim()` threw at submit — while the form reported itself **valid** and
the submit silently did nothing. The only evidence was a `console.error` the
probe happened to capture.

The fix was `inputmode="numeric"` without `type="number"`, which is Day 29's
conclusion that `type="number"` is a keyboard hint rather than a validator,
arriving with a sharper edge.

## Changing domain on the last day

The course suggests "task, contact or product" for Day 50, and taking it was
the right call. Nine days on the reading list meant I knew that problem too well
to tell which decisions were about Angular.

Four things the contact model has that the reading list did not, each of which
produced a rule I had not written:

- **two optional fields where at least one is required** — a group validator,
  and the commonest cross-field rule there is
- **a list inside a record** — `tags`, parsed from and joined into one text
  field, with the parsing shared between the validator and the submit handler
  so the two cannot disagree
- **a boolean** — a checkbox, and therefore a `FormControl<boolean>`
- **no natural unique key** — uniqueness on `email`, and only when one is given

And `storage.service.ts` came across with the type and the guard swapped and
nothing else, which is the clearest evidence in the week that the boundary logic
was never framework code.

## What I learned this week

- `computed` is lazy, cached, and notifies on a changed value rather than a
  changed dependency — so splitting a derivation into named stages is free.
- Writing a signal inside a computed throws; inside an effect it does not. One
  guardrail is the framework's, the other is mine.
- `untracked` reads without depending, which produces a deliberate stale value.
- `linkedSignal` is a writable value that resets when its source changes — one
  declaration where React needs a `useEffect` or a `key`.
- `providedIn: 'root'` registers a service and makes it tree-shakable; an entry
  in a `providers` array does neither.
- `.asReadonly()` turns a set of signals into a store, at the cost of `[(x)]`.
- A token's value is resolved at runtime by whoever configures the app.
- `providers` on a component creates a new injector for its subtree.
- Persisting belongs in the action that caused it, not in an effect watching the
  result.
- A service does not have to be a store — one signal and three methods is a
  service.
- `Validators.required` accepts whitespace.
- `getRawValue()` is fully typed; `.value` drops disabled controls and makes
  every field optional.
- A `computed` cannot track a `FormControl`, because a control's value is not a
  signal. It will cache once and never update.
- An input is not available during construction and is not updated until the
  next change detection — so anything a validator needs immediately must be
  owned by the component.

## Checks I ran

Every day type-checks (`tsc -b --force`) and builds (`ng build`) clean. Each
day's built bundle was loaded into jsdom and driven through its real handlers:

- **Day 46** — a computed evaluating once across four reads; `+2` leaving
  `isEven` unchanged so the effect stayed quiet; `untracked` producing a
  deliberate stale read; `linkedSignal` reset by its source; the document title
  following the filter
- **Day 47** — a token override the consumer cannot see; three counters showing
  two shared instances and one private; persistence across a reload; a corrupt
  row skipped with a notice; blocked storage still starting
- **Day 48** — a component three levels down writing to two services with no
  props, and the header updating
- **Day 49** — every validator, the error summary wiring, the edit flow, and
  three bugs found by driving it
- **Day 50** — fifteen scenarios including every validator, the cross-field
  rule, tag de-duplication, the favourite round-trip, four filters, search by
  tag, sort, removal mid-edit, a reload, a bad row and blocked storage

No console errors in any final run.

**Four bugs of mine that the probes caught**, none of which the type system
could have:

1. A `computed` over a `FormControl` that never updated (Day 49).
2. `type="number"` writing a number into a `FormControl<string>` — the form
   reported itself valid and the submit silently did nothing (Day 49).
3. A validator reading an input a render too early, so saving an edit without
   changing the key field was rejected as a duplicate of itself (Day 49).
4. A line copied from Day 49 that was correct there and wrong here, leaving the
   form in edit mode after a successful save (Day 50).

The fourth is the one worth remembering: **a fix in one place created a bug in
another, and copying a line that had been correct is how it travelled.**

## Week 10 completion checkpoint

- [x] Signals used where appropriate — four pieces of state, everything else
      derived, one effect
- [x] A service with dependency injection, provided at root, with readonly
      views and actions as the only way in
- [x] A validated typed reactive form, including a cross-field rule
- [x] A create and edit flow with validation, edit mode, reset and cancel
- [x] Clean service separation — no `localStorage` outside `storage.service.ts`
- [x] Five daily commits

## Known limitations

- **No routing.** One screen; the form and the list are panels. Week 11 in the
  course outline.
- **No HTTP.** The data is seeded and persisted locally. Week 11.
- **No tests.** `ng test` is configured (Vitest + jsdom) and unused — everything
  above was verified by driving the built bundle, which is slower and less
  precise than `TestBed`. Week 11.
- **No async validators.** `uniqueEmail` is synchronous over the local list; a
  real one would ask a server and need the `asyncValidators` slot.
- **The group filter and the favourites filter are one control**, so "work
  favourites" is not expressible. Two independent filters would be the fix and
  a bigger change than the day allowed.
- **`LIST_OPTIONS` is unused** in Day 50 — it was Day 47's demonstration of a
  token override and is carried for reference rather than consumed.

## Next week

Weeks 11 and 12 in the course outline are the Angular Router, `HttpClient`,
RxJS, Angular testing, and a final deployed capstone — beyond this 50-day run.
