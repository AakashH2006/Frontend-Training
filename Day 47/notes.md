# Day 47 - Dependency injection and services

## Topics Covered

- `@Injectable({ providedIn: 'root' })`, and what it replaced
- `inject()` against constructor injection
- `.asReadonly()`, and exposing state without exposing the setter
- `InjectionToken`, and why a string cannot be injected by type
- Overriding a token in `app.config.ts`
- Injection scope: `providers` on a component
- Why `[(x)]` stopped working
- `@if (x; as y)`

## Practical Work

The state moved out of the component.

```text
src/app/reading-list.service.ts   the state, the derivations and the actions
src/app/storage.service.ts        the four failure modes, injected
src/app/tokens.ts                 two InjectionTokens
src/app/injector-demo.ts          three counters, two instances
src/app/app.config.ts             a token override, and what is NOT here
src/app/app.ts                    1 injected service, 0 signals, 0 computeds
```

The headline:

```text
Day 46   4 signals, 6 computeds, 7 handlers, ~150 lines in App
Day 47   2 injected services, 0 signals, 0 computeds, 4 one-line forwards
```

Most of the template now calls the service directly — `(click)="list.reset()"`
— and the component is a view, which is what it was supposed to be.

This is Week 7's conclusion reached by a different route. The reducer and
context there, a service here, and in both cases the component stopped owning
something more than one component needs.

## providedIn: 'root'

```ts
@Injectable({ providedIn: 'root' })
export class ReadingListService { ... }
```

That is the entire registration. No providers array to edit, no module to
import it into — the decorator says where it lives and the injector creates it
the first time something asks.

Two consequences:

- **It is an application singleton.** Every injector below the root resolves to
  the same instance, which is what makes it a store.
- **It is tree-shakable.** A service nobody injects is removed from the bundle.
  An NgModule `providers` entry never was, because the module referenced it
  eagerly — which is why `app.config.ts` deliberately does *not* list these two
  services, and says so.

## inject() against the constructor

```ts
private readonly storage = inject(StorageService);
// vs
constructor(private storage: StorageService) {}
```

Both work. `inject()` is the current style and has one real advantage: it works
in places a constructor does not — field initialisers, `computed`, functional
route guards and HTTP interceptors. One way to get a dependency instead of two.

Constructor injection reads better when there are several, and it is what every
older tutorial shows, so it is worth being able to read both.

## asReadonly()

The thing that makes this a store rather than a bag of signals.

```ts
private readonly booksSignal = signal<readonly Book[]>(...);
readonly books = this.booksSignal.asReadonly();
```

`.asReadonly()` returns the same signal **without `set` or `update`**. A
component can read it and cannot write it, so the only way in is an action.

Without it, `list.books.set([])` from a template would compile. That is Day 19's
lesson — export actions, not the state — enforced by the type rather than by a
comment, which is the version I actually trust.

### And it broke the two-way binding

```html
<!-- Day 46 -->
<app-filter-bar [(query)]="query" ... />

<!-- Day 47 -->
<app-filter-bar [query]="list.query()" (queryChange)="onQueryChange($event)" ... />
```

`[(x)]` needs a **writable** signal to assign back into, and `list.query` is
readonly. So the two-way sugar stops being available the moment the state moves
somewhere that protects it.

That is the right trade, and it is a neat demonstration of what `[(x)]` really
is: `FilterBar` still declares a `model()` and nothing in the child changed —
only the parent's half of the binding, because a model's generated `xChange`
output is perfectly bindable on its own.

## InjectionToken

The DI concept I found least obvious.

```ts
export const STORAGE_KEY = new InjectionToken<string>('reading list storage key', {
    providedIn: 'root',
    factory: () => 'day47.readingList'
});
```

**You cannot inject a string by its type**, because every string has the same
type. The token is an object that exists purely to be an identity the injector
can key on. The string argument is a description for error messages — *not* the
identity, so two tokens with the same description are different tokens.

The `factory` gives it a default, so it does not have to appear in any providers
array. Without one, every injector needing it would have to provide it and
forgetting would be a runtime `NullInjectorError`.

### Why not just import a constant

This is the question I had, and the answer is layering:

```ts
// app.config.ts
{ provide: LIST_OPTIONS, useValue: { seedWhenEmpty: true, maxBooks: 50 } }
```

```text
injected opts : seedWhenEmpty = true, maxBooks = 50
```

50, not the token's own default of 100 — and **nothing that injects it knows
which one it got.**

An import is resolved at build time by the file that uses it. A token is
resolved at runtime by whoever is configuring the app. That difference is the
whole argument, and it is what makes a service testable without touching the
service.

## Injection Scope

The part that only made sense once I could see it. Three counters, one class:

```ts
@Component({ ..., providers: [CounterService] })   // on App - the root instance
<app-counter label="Shared A" />
<app-counter label="Shared B" />
<app-counter-own label="Its own injector" />       // has its own providers
```

```text
before       : 3evc9 = 0 | 3evc9 = 0 | s13mi = 0
after A x2   : 3evc9 = 2 | 3evc9 = 2 | s13mi = 0
after own x1 : 3evc9 = 2 | 3evc9 = 2 | s13mi = 1
instance ids : 3evc9, 3evc9, s13mi | A===B: true | A===own: false
```

`providers` on a `@Component` creates a **new injector** for that component and
everything below it. So the first two share, the third does not, and the
instance ids make it visible rather than inferred from the counts.

The real use is a component that must **not** share state with another instance
of itself — a dialog, a wizard step, a row editor. Which is the opposite of the
usual DI mistake: not "two things sharing by accident" but "two things that must
not share, sharing".

## Persisting In The Action, Not An Effect

```ts
private commit(change: (books: readonly Book[]) => readonly Book[]): void {
    this.booksSignal.update(change);
    this.storage.save(this.books());
}
```

One place that writes the books and one place that persists them.

The alternative is an `effect` watching `books` and writing storage, which is
what Day 35 used in React and which works. This is simpler: persisting is
**caused by an action**, so it belongs in the action path rather than in a
reaction to it. Day 34's rule about events not being effects, applied to a
service.

## @if (x; as y)

```html
@if (storage.problem(); as problem) {
    {{ problem }}
} @else if (storage.available) { ... }
```

Binds the narrowed value to a name — so the signal is read once and the bound
value is non-null inside the block. The alternative is a `@let` plus a nested
`@if`, which is two lines for the same thing.

## What I Learned

`providedIn: 'root'` is the whole registration and makes a service
tree-shakable, which an entry in a providers array is not.

`inject()` works in field initialisers, computeds, guards and interceptors —
places a constructor does not reach — so it is one mechanism instead of two.

`.asReadonly()` exposes state without the setter, which turns a set of signals
into a store and makes "actions only" a type-level guarantee.

A readonly signal cannot be the target of `[(x)]`, which is a clean
demonstration that two-way binding is just an input plus an output.

A string cannot be injected by type; an `InjectionToken` is the identity. Its
value is resolved at runtime by whoever configures the app, which an imported
constant never is.

`providers` on a component creates a new injector for its subtree — the way to
say "this instance must not share".

Persisting belongs in the action that caused it, not in an effect watching the
result.

## Verification

```text
npm run typecheck   ->  tsc -b --force, 0 errors
npm run build       ->  139.85 kB raw, 41.81 kB transfer
```

Driven through jsdom across four page loads sharing one `localStorage`:

```text
storage note  : Saved in this browser. The list will still be here after a reload.
injected opts : maxBooks = 50            (the override, not the token's 100)
query via svc : Showing 2 of 7. | Song of Solomon, Beloved
status via svc: Finished
after remove  : 6 books
persisted     : 6 books, version 1

injection scope:
  after A x2  : 3evc9 = 2 | 3evc9 = 2 | s13mi = 0
  after own x1: 3evc9 = 2 | 3evc9 = 2 | s13mi = 1
  ids         : A===B true, A===own false

=== reload ===         restored 6 books
=== one bad row ===    "1 saved entry could not be read and was skipped." kept 6 of 7
=== storage blocked === notice shown, 7 seed books, app still works
```

The bundle got **smaller** than Day 46 (41.81 kB against 42.52 kB) despite
gaining two services and a token file, because Day 46's signals lab came out.
Worth noting only because I expected moving state into a service to cost
something and it did not.

## Day 47 Outcome

Two injected services: one owning the list's state behind `.asReadonly()`
views with actions as the only way in, and one owning the storage boundary with
all four failure modes and a guard over untrusted stored data. Two injection
tokens, one of them overridden in `app.config.ts` to show that the consumer
cannot tell. A three-counter demonstration of injection scope with visible
instance ids.

`App` went from four signals, six computeds and seven handlers to two
injections and four one-line forwards.

Day 48 is the question this raises: with inputs, outputs, a shared service and
signals all available, which one does a given piece of communication want.
