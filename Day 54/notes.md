# Day 54 - Angular testing

## Topics Covered

- `ng test` with the `@angular/build:unit-test` builder and Vitest as the runner
- `TestBed.configureTestingModule`, `TestBed.inject`, `TestBed.resetTestingModule`
- `TestBed.createComponent`, `componentRef.setInput`, `fixture.whenStable`
- `HttpTestingController`: `expectOne`, `expectNone`, `match`, `flush`, `verify`
- Overriding an `InjectionToken` in a test
- `RouterTestingHarness` and `navigateByUrl`
- `vi.useFakeTimers()` and `TestBed.tick()` in place of `fakeAsync`/`tick` in a
  zoneless app
- Testing a route table as data, separately from testing it as behaviour
- Cold observables and what "no request happened" is worth asserting

## Practical Work

`Day 54/Angular Testing/` — the Day 53 app with no feature added and 134 tests
across eight spec files.

Nothing in `src/` changed except the day's metadata and one tsconfig. That is
the point: the app was finished on Day 53, every claim in its comments was
verified by a probe, and today's work is turning those probes into something
that runs on every save.

| spec | tests | what it covers |
| --- | --- | --- |
| `domain.spec.ts` | 15 | the four type guards |
| `validators.spec.ts` | 34 | six validators and `parseTags` |
| `contacts.api.spec.ts` | 15 | the HTTP boundary and error mapping |
| `contacts.service.spec.ts` | 15 | states, `defer`, busy counting, derived state |
| `directory.service.spec.ts` | 12 | the RxJS pipeline, including the race |
| `contact-card.spec.ts` | 8 | a presentational component, inputs and outputs |
| `contact-form.spec.ts` | 20 | the form through the DOM |
| `routes.spec.ts` | 15 | the route table as data, and as behaviour |

134 tests, 3.50 s, no browser and no build of the application.

## What `ng test` Actually Is Now

`angular.json` had no test target until today. Week 9 generated the project
with `--skip-tests`, so the builder had to be written by hand:

```json
"test": {
  "builder": "@angular/build:unit-test",
  "options": {
    "tsConfig": "tsconfig.spec.json",
    "runner": "vitest",
    "buildTarget": "::development",
    "watch": false,
    "reporters": ["default"]
  }
}
```

Three things in there are worth knowing.

`runner: "vitest"` — Karma is gone and Jasmine is no longer assumed. Vitest was
already in `devDependencies` from Day 41 and unused for thirteen days.

`buildTarget: "::development"` is the part I did not expect. The unit-test
builder **builds the application** and runs the specs against that build, which
is why the output starts with `✔ Building...` and why a TypeScript error in a
spec is reported as a build failure by `plugin angular-compiler` rather than by
the test runner. It also means the specs are checked by the same compiler
options as the app — `strict`, `noUnusedLocals`, `exactOptionalPropertyTypes`
and all. Twice today a spec failed to run because of `TS6133: 'switchMap' is
declared but its value is never read`, which is the app's rules applying to
test code.

`jsdom` is the environment, so there is a DOM but no real browser. The probe
harness has been using jsdom for four days; the difference is that it loaded a
*bundle* into jsdom, and this loads *modules*.

### `types: []`, and a thirteen-day-old error

`tsconfig.spec.json` has said this since Day 41:

```json
"types": ["vitest/globals", "node"]
```

The first time anything ran it failed with

```
error TS2688: Cannot find type definition file for 'node'.
```

because `@types/node` was never installed. A `types` entry naming a package
that is not there is an error, not a no-op — and nothing noticed for thirteen
days because `tsconfig.spec.json` had no files to check.

I set it to `[]` rather than installing `@types/node`, and every spec imports
`describe`, `it` and `expect` from `vitest` by name. Globals save four
characters per file and cost a reader the ability to see where `expect` comes
from. The app's own tsconfig has had `types: []` since Day 41 for the same
reason.

### The include pattern the CLI generates does not survive use

`ng test` was happy with `"include": ["src/**/*.spec.ts", "src/**/*.d.ts"]`,
because the builder assembles the program itself. Running the compiler over
that project directly was not:

```
error TS6307: File 'src/app/title-strategy.ts' is not listed within the file
list of project 'tsconfig.spec.json'. Projects must list all files or use an
'include' pattern.
```

`composite: true` requires every file in the program to be listed, and a spec
that imports the thing it tests pulls in the whole application. Widened to
`src/**/*.ts`, which is the mirror image of what `tsconfig.app.json` already
does by excluding the specs.

Writing the comment that explains this broke the file: a glob with a star
followed by a slash contains `*/`, which closes a block comment early. Ten
`TS1005`s, none of them mentioning comments. The comment is now line comments.

## What A Test Proves That A Probe Cannot

Four days of "Verification" sections have been probes: build the app, serve the
`dist`, load the bundle into jsdom, click things, read the DOM. That approach
found three real bugs (Day 52's cleared form, Day 52's premature "no such
contact", Day 53's uncancelled write) and I would not give it up. But there is
a whole category it cannot reach.

**A probe cannot assert that something did not happen.** `expectNone` is the
operator this day is really about:

```ts
it('makes no request until something subscribes', () => {
    const request$ = api.list();
    http.expectNone('/api/contacts');
    request$.subscribe();
    http.expectOne('/api/contacts').flush({ contacts: [] });
});
```

Day 52 reasoned about cold observables for half a page and demonstrated them by
printing a request log. This is the same claim as an assertion. The same goes
for "filtering and sorting do not ask the server again", which was previously a
sentence in a comment and is now a test whose entire content is that
`http.verify()` passes afterwards.

**`verify()` finds requests I did not know about.** The very first router test
failed with

```
Error: Expected no open requests, found 1: GET /api/directory/size
```

— Day 53's directory search sits above the contacts list and asks for the
directory size, and the About page is its second consumer. I had forgotten. On
screen that is one line in a request log that I would never look at twice.

**A test can hold a request open and decide who wins.** Day 53 proved
`switchMap` with a stopwatch: a fake server made deliberately slower for broad
queries, two keystrokes 300 ms apart, and the DOM sampled every 120 ms. It took
three attempts to make deterministic, and the first version passed for the
wrong reason because the latency spread was narrower than the debounce. Today:

```ts
type('do');     settle();  const broad   = http.expectOne('/api/directory?q=do');
type('doudna'); settle();  const precise = http.expectOne('/api/directory?q=doudna');

expect(broad.cancelled).toBe(true);
expect(precise.cancelled).toBe(false);
```

No timing at all. The race is not simulated; it is constructed.

**And a test tells you where the failure is.** A probe reports "the screen
showed the wrong name". The suite, when I broke it on purpose, named the two
assertions that failed.

### What a test cannot do, which matters just as much

`RouterTestingHarness`'s template is a single `<router-outlet>`. There is no
shell: no nav, no `routerLinkActive`, no `aria-current`, no layout. The
`app.html` built on Day 51 is not covered by any of these 134 tests.

And nothing here runs the built bundle. The lazy chunk, the `<base href>`, the
interceptor chain in `app.config.ts` and the `index.html` title are all
production concerns that a `TestBed` fakes away. The probe is still the only
thing that has ever loaded `dist/` and clicked on it.

So they are complements, and today's mistake would be to think either replaces
the other. The probe answers "does the thing I ship work"; the suite answers
"does this unit do what I said it does, and nothing else".

## `HttpTestingController`

The whole API that matters:

```ts
providers: [provideHttpClient(), provideHttpClientTesting()]
```

`provideHttpClientTesting()` replaces the **backend** and nothing else. The
interceptors, the parsers and the error mapping are the real ones; only the
network is gone. That is a much better boundary than mocking `ContactsApi`
would have been, because `toApiError` is exactly the code I want tested.

```ts
http.expectOne('/api/contacts')      // one request matching, and return it
http.expectNone('/api/contacts')     // assert none matched
http.match(r => r.method === 'PATCH')// all matching, for overlapping requests
request.flush(body, {status, statusText})
http.verify()                        // nothing left unanswered
```

`expectOne` *fails* when two requests match, which is how the cold-observable
test is written: two subscribes, then `match` and assert a length of 2. Had I
reached for `expectOne` there I would have learned the same fact by accident.

`flush` is where the error table lives. Each row is something a server can do
and the kind the rest of the app is allowed to see:

| flushed status | `ApiError.kind` |
| --- | --- |
| 0 | `offline` |
| 404 | `notFound` |
| 409 | `conflict` |
| 500 | `server` |
| 418 | `server` |
| 200 with the wrong shape | `malformed` |

That last row is the one worth having. `http.get<ContactList>()` is a *claim*,
not a check, and flushing `{ contacts: 'nope' }` with a 200 is the failure the
generic waves through. The test asserts an `ApiError` of kind `malformed`
arrives instead.

### Overriding a token, finally

Day 47 said injection tokens exist partly so a test can replace them, and until
today that was an assertion:

```ts
TestBed.resetTestingModule();
TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting(),
                { provide: API_BASE, useValue: '/v2' }]
});
TestBed.inject(ContactsApi).list().subscribe();
scopedHttp.expectOne('/v2/contacts');
```

Nothing in `contacts.api.ts` changes and the URL does. `resetTestingModule()` is
needed because the outer `beforeEach` has already configured one — which is
also the answer to "can one spec file have two configurations".

## Component Tests

```ts
const fixture = TestBed.createComponent(ContactCard);
fixture.componentRef.setInput('contact', ADA);
await fixture.whenStable();
fixture.nativeElement.querySelector('h3');
```

`setInput` has no React equivalent. In React a component is rendered with props
and re-rendered with different ones; here the instance persists and its inputs
are set, which is much closer to what the framework does at runtime.

`ContactCard` was written on Day 48 with a rule attached — "inputs in, outputs
out, injects nothing" — and an argument I could not then check: *a test would
need the whole service to render one card*. Its spec has
`TestBed.configureTestingModule({})`. No providers at all. Eight tests.

The exception is instructive. The card imports `RouterLink` for its title, so
rendering it **with** a link in a bare TestBed fails:

```
ERROR ɵNotFound: NG0201: No provider found for `ActivatedRoute`.
Source: DynamicTestModule.
```

`Router` is `providedIn: 'root'` and resolves on its own; `ActivatedRoute` is
not, and only `provideRouter` supplies it. That is the measured price of Day
51's decision to render the title as a real `<a>`, and the reason `detailLink`
defaults to `null`. The test asserts the message rather than just `.toThrow()`,
because "it threw" would also pass if the card broke for an unrelated reason.

### What `whenStable` is for, measured

Zoneless Angular does not run change detection because a test did something; it
runs it when the scheduler gets a turn. I printed the DOM either side of the
`await`:

```
BEFORE len 706 name? false h3: ""
AFTER  len 771 name? true  h3: " Ada Lovelace "
```

The template structure is already there — `createComponent` renders it — and
every interpolated value is missing. So a forgotten `await` does not give an
empty fixture, which would be obvious. It gives a rendered page with no
content, and an assertion like `expect(h3.textContent).toContain('Ada')` fails
with an empty string.

### The form, through the DOM and only through the DOM

`ContactForm` has a `form: FormGroup` on it, and
`form.controls.name.setValue(...)` would make every test shorter. It would also
stop testing the component: `ReactiveFormsModule`, the value accessors, the
`formControlName` wiring and every `showError` branch in the template are
exactly the parts that would go uncovered.

So nothing in those 20 tests touches `form`. Values are set by dispatching real
events at real elements, errors are read out of the rendered DOM, and
submitting dispatches `submit` at the `<form>`. The only members used are the
ones a parent uses: four inputs, two outputs, `fillFrom`, `clear`.

Which the compiler enforces, because `form` and `submitted` are `protected`.
Day 48 made them protected for the template's sake; it turns out to be the
right boundary for a test too.

Two events, not interchangeable: text inputs and textareas are written on
`input`, while the select and checkbox accessors listen for `change`. Getting
that wrong gives a control that never updates and a test that fails with no
explanation, which is how I learned it on Day 49.

The tests worth naming:

- **Day 52's bug as a test.** Submit a valid form, then assert the fields still
  hold what was typed. Day 50's version called `clear()` in `onSubmit`, and a
  409 arriving afterwards left an empty form under the words "Another contact
  already uses margaret@example.com". A probe found that; this would have found
  it in 40 ms.
- **The round trip.** `fillFrom(ADA)`, submit, and assert the emitted draft
  equals `ADA` minus `id` and `addedAt`. It fails for any change to either
  direction of the mapping, which is more than the sum of the field tests.
- **Absent, not undefined.** `toEqual` treats `{email: undefined}` as equal to
  `{}`, so the draft is checked with `expect('email' in draft).toBe(false)`.
  With `exactOptionalPropertyTypes` those are different states and the whole
  point of the conditional spreads.
- **The error summary's three invisible attributes** — `role="alert"`,
  `tabindex="-1"`, and the first link's `href="#name"`. A restyle cannot break
  them; a rewrite can, and nothing else would notice.
- **Problems in field order.** Fill the note last and the email second, and the
  summary still lists name, email, note. That is Day 38's rule and the only
  reason `fieldOrder` exists.
- **A list that arrives after construction.** `uniqueEmail` takes getters
  because the form is built before `existing` is set. Setting the input after
  the fact and watching the same address become invalid is Day 49's bug
  prevented rather than described.

## The Route Table, Twice

Day 51's first note says "a route is data, not markup", and the argument given
was that routes "can be read, filtered and tested without rendering anything".
That claim gets cashed in here:

```ts
expect(routes[0]?.pathMatch).toBe('full');
expect(pathOf('contacts/new')).toBeLessThan(pathOf('contacts/:id'));
expect(routes[routes.length - 1]?.path).toBe('**');
```

No TestBed, no DOM, no navigation, under a millisecond. First-match-wins is the
whole difference between this router and React Router's specificity ranking,
and it is now one assertion. React Router's routes are JSX elements; there is
nothing to assert against.

Then the same table as behaviour, with `RouterTestingHarness`:

```ts
const harness = await RouterTestingHarness.create();
const page = await harness.navigateByUrl('/contacts/c1', ContactDetailPage);
expect(page.id()).toBe('c1');
harness.routeNativeElement; // the DOM the route rendered
```

`page.id()` is the assertion I wanted most. `withComponentInputBinding()` is
configured once in `app.config.ts` and every page depends on it; this asserts
it on the component instead of inferring it from the screen. The spec provides
the same two arguments as the real config, so it also fails if the app stops
being configured the way the pages assume.

Day 52's bug is three lines here:

```ts
await harness.navigateByUrl('/contacts/c1', ContactDetailPage);
expect(q('#detail-loading')).not.toBeNull();
expect(q('#no-such-contact')).toBeNull();
```

Before the request is answered, the page must not claim the contact does not
exist. A probe found that by watching the screen for 120 ms.

### Day 51's experiment, made permanent

That day I swapped two routes by hand, rebuilt, drove a probe to
`/contacts/new` and read the screen. It took a few minutes and left nothing
behind. Here the wrong table is a value:

```ts
const wrong = [...routes];
[wrong[newIndex], wrong[idIndex]] = [wrong[idIndex]!, wrong[newIndex]!];
```

and the detail page renders for the word "new", with `page.id() === 'new'`, no
`<form>`, and the title "Contact | …" — which is the detail I missed when I
only looked at the screen.

### A wart written as a passing test

A route's `title` is static, so every contact's page is called "Contact". The
record's name is what a tab should say.

```ts
it('still titles every contact page the same, which a resolver will fix', ...)
expect(Title.getTitle()).toBe('Contact | Day 54 | Angular Testing');
expect(Title.getTitle()).not.toContain('Ada');
```

A comment cannot tell me when it is fixed. When Day 56's resolver lands, this
test fails, and the failure is the reminder.

## Time, In A Zoneless App

Every Angular testing guide reaches for `fakeAsync` and `tick`. Both are
zone.js APIs, and this app has had no zone.js since Day 41 — Angular 22 is
zoneless by default. So:

```ts
vi.useFakeTimers();                       // controls debounceTime
service.setQuery(value); TestBed.tick();  // runs the effect behind toObservable
vi.advanceTimersByTime(250);              // expire the debounce
```

Simpler than `fakeAsync`, and it works on whatever the runner has patched.

`TestBed.tick()` is the one that is easy to leave out. `toObservable` watches
its signal with an **effect**, so `setQuery` does not reach the stream until
effects run. Taking the `tick()` out to see what it bought: four of the twelve
tests fail, all with

```
Error: Expected one matching request for criteria
"Match URL: /api/directory?q=jennifer", found none.
```

and the eight that still pass are the ones asserting that **nothing** was
requested — which pass whether or not the code works. A missing `tick()` does
not break a suite loudly. It quietly turns half of it into a tautology.

`http.verify({ ignoreCancelled: true })` in that file's `afterEach`, because
the point of `switchMap` is that there *are* cancelled requests. Without the
flag it is a failing assertion in every test that changes its mind — a good
default and the wrong one there.

## What I Learned

**The builder builds the app.** A spec is compiled with the application's
tsconfig, by the application's compiler, as part of the application's build.
`noUnusedLocals` applies to test code. This is stricter than any JS test setup
I have used and it caught two of my own mistakes today before any test ran.

**`expectNone` is the operator that justifies the day.** Everything else here
has a probe equivalent that is slower and more awkward. "No request happened"
has none at all, and it is what most of Week 10's and Week 11's careful
reasoning was actually about — cold observables, `defer`, `distinctUntilChanged`,
derived state over re-fetching.

**`verify()` in an `afterEach` is free and finds things.** An extra request is
invisible on screen and a failing test here. It found a request I had forgotten
existed within a minute of the router spec being written.

**A test's job is to fail for one reason.** My router spec reported ten failures
from one real problem: `http.verify()` threw in the `afterEach`, which stopped
Angular's own reset hook running, so the next test met an already-instantiated
TestBed and died with "Cannot configure the test module when the test module has
already been instantiated". A `TestBed.resetTestingModule()` at the top of the
configure helper fixed all nine of the fake ones. Ten failures for one cause
wasted more of today than any real bug did.

**Protected members are a test boundary, not just a template one.** The form
spec could not reach into `form` even if I wanted it to, and that constraint
made it a better spec than the one I would have written freely.

**The probe is not obsolete and I nearly decided it was.** Nothing in 134 tests
renders `app.html`, exercises `routerLinkActive`, or loads the built bundle. The
honest division is: tests for units and their contracts, probe for the artefact
that ships.

## Verification

`npm test`, which is `ng test` — build, then run:

```
✓  contacts  src/app/domain.spec.ts (15 tests) 13ms
✓  contacts  src/app/validators.spec.ts (34 tests) 25ms
✓  contacts  src/app/contacts.api.spec.ts (15 tests) 113ms
✓  contacts  src/app/contacts.service.spec.ts (15 tests) 125ms
✓  contacts  src/app/directory.service.spec.ts (12 tests) 124ms
✓  contacts  src/app/contact-card.spec.ts (8 tests) 220ms
✓  contacts  src/app/routes.spec.ts (15 tests) 288ms
✓  contacts  src/app/contact-form.spec.ts (20 tests) 972ms

Test Files  8 passed (8)
     Tests  134 passed (134)
  Duration  3.50s
```

`npm run typecheck` (`tsc -b --force`) passes over both projects, and
`tsc -p tsconfig.spec.json --noEmit` passes after the include was widened.

`ng build`:

```
Initial total | 376.11 kB |  97.88 kB
about-page    |   1.63 kB | 805 bytes
```

Day 53 was 376.10 kB / 97.87 kB — the same bundle to within 10 bytes, and the
only source changes were the day's metadata: the footer sentence, the title
suffix and the fake server's storage key. **134 tests add nothing to the
bundle**, which is obvious and worth stating once: specs are not imported by
anything the app ships, and `tsconfig.app.json` excludes them from the build.

### The app still runs

A probe against the built bundle, to be sure the metadata change broke nothing:

```
title             : Contacts | Day 54 | Angular Testing
contacts          : 4
first             : Jean BartikFavourite
detail title      : Contact | Day 54 | Angular Testing
detail heading    : Jean Bartik
no-such-contact   : absent
console errors    : none
probe wall time   : 2476 ms (excluding the build)
```

2476 ms for two page loads and the readings above, on top of a 2.8 s build. The
whole suite — 134 tests, including the assertions a probe cannot make — is
3.50 s including its own build.

### Experiment: does the suite catch the Day 53 bug?

A test suite nobody has watched fail is a guess. I changed one word in
`directory.service.ts`, `switchMap` to `mergeMap`, which is exactly the bug Day
53 spent an afternoon demonstrating.

First attempt failed to compile: `TS6133: 'switchMap' is declared but its value
is never read`. `noUnusedLocals` catching a half-done edit is a small thing and
a genuinely useful one.

With the import removed:

```
FAIL  directory.service.spec.ts > abandons the request for a query the user has moved on from
AssertionError: expected false to be true

FAIL  directory.service.spec.ts > cannot be given a stale answer, because nothing is listening for one
AssertionError: expected [Function] to throw an error

Test Files  1 failed | 7 passed (8)
     Tests  2 failed | 132 passed (134)
  Duration  3.50s
```

Exactly the two tests about the race, named, in three and a half seconds. Day
53 found the same bug by building the app, serving it, typing two queries 300 ms
apart and sampling the DOM every 120 ms — and the first version of that probe
passed anyway, because the latency spread was narrower than the debounce.

Restored from a copy and the suite is green again.

### Experiment: the missing `tick()`

Recorded above and in the header comment of `directory.service.spec.ts`:
removing `TestBed.tick()` from the `type()` helper fails 4 of 12 tests, and the
8 that pass are the `expectNone` ones, which would pass against broken code.

## Day 54 Outcome

134 tests over the app Day 53 finished, in 3.50 s, with no browser: the guards
and validators as pure functions, the HTTP boundary with its whole error table
including a malformed 200, the service's three states and its cold mutations,
the RxJS race decided by the test instead of by a stopwatch, a component with
no providers at all, a form driven entirely through its DOM, and the route table
asserted twice over — once as an array and once as navigation.

Three things that were prose in earlier days are now assertions that fail: Day
49's validator timing bug, Day 52's self-clearing form, and Day 52's premature
"no such contact". One thing that is still wrong — the static title on the
detail route — is a passing test that will fail the day it is fixed.

Day 55 is the week's build: the contacts app with everything Week 11 added, and
the Week 11 README.
