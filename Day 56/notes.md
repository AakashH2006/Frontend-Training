# Day 56 - guards, resolvers and interceptors

## Topics Covered

- `CanActivateFn`: a guard as a function, and returning a `UrlTree` rather than
  `false`
- `CanDeactivateFn<T>`: the only question in Angular that a component alone can
  answer
- A guard that waits on a person: an `Observable<boolean>` that a dialog
  completes
- `ResolveFn<string>`: a title decided before the component that fetches the
  record exists
- What a resolver that throws does to a navigation, and why this one catches
- `withInterceptors([...])` as a pipeline, and which of its ordering arguments
  survive measurement
- Eager versus `defer` inside an interceptor: once per request, or once per
  attempt
- `retry({ count, delay })` over a cold `HttpClient` observable, and what must
  never be retried
- `inject()` and the injection context, and what it looks like when it is lost
- Configuration (a token) versus state (a signal), stated properly at last

## Practical Work

`Day 56/Guards Resolvers and Interceptors/` — Week 12 opens by making the
router ask questions.

Day 55 left an app where every navigation always succeeded and every page was
titled before it knew anything. Three things change that, and each of them has
to live outside the component it affects:

| | Day 55 | Day 56 |
| --- | --- | --- |
| /settings | — | behind `canActivate: [signedInGuard]` |
| leaving a half-typed form | silent | `canDeactivate` asks, through a dialog |
| detail page title | the static word "Contact" | the record's name, resolved |
| edit page title | "Edit contact" | `Editing <name>` |
| interceptors | `[log, fakeApi]` | `[requestId, log, retry, fakeApi]` |
| a failed GET | an error on screen | retried twice, then an error |
| every request | — | carries `X-Request-Id`, printed in the shell's log |
| the fake server | eager, once per request | inside a `defer`, once per attempt |
| lazy routes | `about` | `about` and `settings` |
| tests | 168 in 9 files | 245 in 14 files |

There is also a settings page, which exists because the rest of the day is
invisible without it: a latency slider and a "fail the next N requests" queue.
A retry that works is a screen on which nothing happened.

## Two Guards, Two Different Questions

They are spelled similarly and they are not the same kind of thing at all.

`canActivate` asks **may this page be shown**, which is a question about the
app's state. The session service answers it. It runs before the component is
constructed and - the part worth knowing - before `loadComponent` downloads
anything.

`canDeactivate` asks **may this page be left**, which is a question about the
component's state. Nothing else in Angular can ask it. The router is about to
destroy a component; that component knows there is unsaved text in a field; the
guard is the only place where those two facts meet.

The second one is the reason the day is interesting. The first is a feature;
the second is a capability I had no equivalent for in nine weeks of React.

### A guard is not security, and the test says so out loud

`SessionService` is a name in `localStorage`. `session.service.spec.ts` has a
test called "is not a security boundary, and this is what that means" whose body
is two lines:

```ts
localStorage.setItem(KEY, 'Somebody Else');
expect(create().name()).toBe('Somebody Else');
```

That is the whole bypass, written as a passing test, because a comment saying
"this is not security" is easier to skip than an assertion demonstrating it. A
guard decides what to **render**. Data is protected by whatever answers the
request, which in this app is a fake server that would hand its rows to anyone.

## The Claim I Had To Take Back

`guards.ts` said, in a comment I wrote before testing any of it, that returning
a `UrlTree` is **one** navigation while `router.navigate(...)` plus
`return false` is **two**. I had read that somewhere and repeated it as if I
had seen it.

It is wrong. Both produce the same seventeen router events in the same order:

```
NavigationStart, RoutesRecognized, GuardsCheckStart, ChildActivationStart,
ActivationStart, NavigationCancel, NavigationStart, RoutesRecognized,
GuardsCheckStart, ChildActivationStart, ActivationStart, GuardsCheckEnd,
ResolveStart, ResolveEnd, ActivationEnd, ChildActivationEnd, NavigationEnd
```

Two `NavigationStart`s and a `NavigationCancel` either way. A redirect from a
guard is two navigations however it is expressed.

The real difference is sharper than the one I invented, and it is what the
router tells the **caller**:

| | `navigateByUrl` resolves | `NavigationCancel.code` |
| --- | --- | --- |
| returning a `UrlTree` | `true` | `Redirect` |
| `navigate()` then `false` | `false` | `SupersededByNewNavigation` |

The `true` is the important one. A redirect is a navigation that *succeeded*,
somewhere else, so anything awaiting the result carries on. The naive version
reports a failure for a redirect that worked perfectly, and
`if (!(await router.navigate(...)))` is a shape I have written - it would show
the user an error about a redirect they never noticed.

And the cancellation code is the router describing the bug exactly:
`SupersededByNewNavigation`, not `GuardRejected`, because a guard that starts
its own navigation is overtaking the one it was asked about.

Both rows are tests in `routes.spec.ts`. The practical reason for a tree still
holds regardless: a tree carries query parameters, so the `returnUrl` is part
of the destination rather than something the guard has to arrange separately.

## The Chunk That Is Not Downloaded

The second reason to guard a route rather than check inside the page, and the
one I could not measure any other way.

A real `loadComponent` is a dynamic import, and whether it ran is invisible
from the DOM. But the route table is **data**, so the loader can be replaced
with one that counts:

```ts
table = routes.map((route) =>
    route.path === 'settings'
        ? { ...route, loadComponent: async () => { loads += 1; … } }
        : route
);
```

Anonymous visitor: `loads` is **0**. The guard refused before the import was
reached. Signed in: **1**, and still 1 after a second navigation, because the
router caches a loaded component.

A page that checked its own session and redirected from its constructor would
have downloaded the whole chunk first, then thrown it away. This is the
measurement that turns "guard the route, not the component" from advice into a
number.

## The Dialog Has To Outlive The Page It Asks About

`<app-confirm-dialog />` is rendered once, by the shell, outside the outlet -
and that is structural rather than tidy.

The dialog's entire purpose is to ask "may I destroy this page?". A dialog
owned by that page dies with its subject. So the shell renders it, a service
holds the question, and the guard and the dialog never meet:

```
unsavedChangesGuard  →  ConfirmService.ask()  →  Observable<boolean>
                              ↑
                     ConfirmDialog (in the shell) → respond(true | false)
```

The router subscribes to that observable and the navigation sits unfinished
until something emits. `routes.spec.ts` asserts the in-between state, which is
the one I most wanted to see written down:

```ts
const navigation = router.navigateByUrl('/contacts');
await settle();

expect(router.url).toBe('/contacts/new');   // not moved
expect(q('form')).not.toBeNull();           // still on screen
expect(confirm.question()).not.toBeNull();  // waiting on a person
```

Nothing else in the framework can pause navigation on a human being.

Two details in `ConfirmService` are there because of what a hanging question
would mean. Asking while a question is open answers the old one `false` rather
than leaving it; and `respond` calls `complete()` as well as `next()`, because
an observable that emits and never completes leaves the router's subscription
open. A guard waiting on an observable that never emits is a navigation that
never finishes and a UI with no way out.

## `form.dirty`, And The Flag It Cannot Replace

`CanLeave` is two methods, and the page implements it by asking its child:

```
routes.ts            which pages may refuse to be left
ContactFormPage      which component holds the fields   (viewChild)
ContactForm          whether they were touched          (form.dirty)
```

Three layers to answer "has the user typed something", and each knows only its
own part.

`form.dirty` is Angular's own bookkeeping and it is exactly the right flag:
false until a control is changed **through the DOM**, and not set by
`setValue`. So `fillFrom` writing seven controls when an edit form opens does
not count as typing - which `routes.spec.ts` checks, because if it did, every
edit page would ask on the way out without anybody having touched it.

What `dirty` cannot cover is a **successful save**. The page navigates away and
the form is still dirty - the fields are deliberately left filled since Day 52,
because a save can fail - so without a second flag every save would ask
"discard your changes?" on the way out. That is the prompt that teaches people
to click through prompts.

So there is a `saved` signal, set when the form emits. And the first version of
`clear()` set it to **true**, which was wrong in a way worth keeping:

```ts
canLeave(): boolean {
    return this.saved() || !this.form.dirty;
}
```

It is an `or`, and nothing ever put `saved` back. A form that was cleared and
then typed into again could never warn. The flag has to mean "the user pressed
save", so everything that is not a save clears it.

### The message names the fields

A guard can only say "you have unsaved changes". The component can say

> Your changes to Name and Email will be discarded.

because it is the only thing that knows. The probe reads that exact sentence
off the real dialog. `listOf` builds it with an Oxford-less "and" rather than
`join(', ')`, because the second reads like a list in code and the first reads
like a sentence to a person.

## A Title Decided Before The Component Exists

Day 51 gave the detail route the static title `'Contact'`, and Day 54 wrote a
passing test called "still titles every contact page the same, which a resolver
will fix", designed to fail the day a resolver landed.

Today it did. That is the most satisfying failure in this repo so far: the
reminder arrived by itself rather than being something I had to remember.

```ts
{ path: 'contacts/:id', component: ContactDetailPage, title: contactTitleResolver }
```

`document.title` on `/contacts/c4`, read by the probe from the built app:

```
Jean Bartik | Day 56 | Guards Resolvers and Interceptors
```

A component could not have done this. By the time a page has a record to be
named after, the title has been set for a while - so Day 38's React version
(an effect in every page) was always setting it late, and I never noticed
because nobody watches a tab.

### A resolver that throws cancels the navigation

This is the part of the API I had wrong in my head. A failing resolver does not
render an error state: the router **abandons the whole navigation** and the URL
stays where it was. A 404 from the title resolver would leave a dead link that
does nothing at all when clicked - no page, no message, nothing.

Hence `catchError(() => of('Contact'))`, and a test that the navigation
completes and the page gets to show its own 404. Measured on the built app:

```
missing url    : /contacts/does-not-exist
missing title  : Contact | Day 56 | Guards Resolvers and Interceptors
missing message: shown
```

The router's job is to arrive; saying "no such contact" is the page's job.

### What it costs, measured twice

Two costs, and I am recording both rather than only the nice half.

**Two requests for one screen.** The resolver needs the name before the
component exists; the component needs the whole record. The probe sees both:

```
r3-8aoah GET /api/contacts/c4 200 135ms | r4-pq5dh GET /api/contacts/c4 200 134ms
```

Passing the resolver's copy to the page through `route.data` would remove the
second one and would also take away the page's own loading and error states -
the three things Day 55 spent a day getting right. A shared cache is the real
answer and it is Day 58's `httpResource`.

**The previous page stays on screen.** A resolver delays the navigation by one
request, and the probe reads the DOM in the middle of it:

```
url during resolve : /contacts
on screen during   : still the list
resolve took       : 144 ms from click to URL change
```

144ms of the old page after a click - the fake server's latency is 120ms. With
a loading state the user would see something happen immediately; with a
resolver they see nothing happen for a moment. That is the trade a title
resolver makes, and it is worth knowing which way round it is.

(The first version of that measurement said 1132ms, because it timed the
probe's own `wait(600)` along with the navigation. Polling in 10ms steps until
the URL changes is the honest version. Oldest mistake in performance
measurement, and apparently I still make it.)

## The Interceptor Chain, And A Prediction That Did Not Survive

```ts
withInterceptors([requestIdInterceptor, logInterceptor, retryInterceptor, fakeApiInterceptor])
```

A request walks down that array; the response walks back up. I wrote a
paragraph of ordering arguments in `app.config.ts` before writing a line of
`interceptors.spec.ts`. One of them is load-bearing and one of them was
invented.

**The id goes first, and that one is real.** `logInterceptor` prints
`X-Request-Id`, which it can only do because something above it put the header
on the request. Move the id interceptor to second and the log's id column goes
permanently blank *while everything else keeps working*, which is exactly how
an ordering mistake in a chain survives review. There is a test for that empty
column.

The retry re-sends a request that already carries the header, so three attempts
share one id - which is the only thing a correlation id is for: telling "asked
once, failed twice" from "asked twice".

**The log goes above the retry, for a reason I made up.** I claimed that a log
*below* the retry would record each attempt separately, so one request that
failed twice would be three lines. Measured:

```
below the retry:  1 entry, status 503, 1112ms
above the retry:  1 entry, status 503
```

One entry either way.

### Why, which is worth more than the prediction was

A functional interceptor's **body runs once per request**. Angular builds the
chain by calling each function to obtain an observable, so `log.start()` has
already happened before anybody subscribes. What a retry resubscribes to is the
**observable** each interceptor returned - which reaches the backend and
re-sends the request, without re-running any interceptor function.

So the rule, checked on four numbers rather than on my description of it. Two
counting interceptors, one eager and one wrapped in `defer`, placed below the
retry and then above it:

| | eager body | `defer` body |
| --- | --- | --- |
| below the retry | 1 | **3** |
| above the retry | 1 | 1 |

**Order decides what an interceptor can see. Eagerness decides how often it
runs.** Two different axes, and I could not have written that sentence before
measuring those four numbers.

## The Same Mistake, Immediately, In The Fake Server

I wrote the paragraph above and then made the mistake it describes, one file
over, within the hour.

The settings page queues one failure; the retry has two attempts; so a single
queued failure should be absorbed and nobody should notice. The probe measured:

```
GET /api/directory/size   503   1304ms
```

A 503 after three attempts and 900ms of backoff, from **one** queued failure.
The queue was not being emptied.

Same mechanism. `fakeApiInterceptor`'s body called `settings.shouldFail()`
once, decided yes, and returned a cold `timer().pipe(throwError)` - and the
retry resubscribed to *that*, replaying the same error for ever without ever
asking the server again. One queued failure became three, because the server
never got to answer twice.

The fix is `defer`, and everything the fake server does moved inside it:

```ts
return defer(() => answer(req, next, base, store, settings, directoryCache));
```

Which is also simply the right model of a server. A server does not decide once
what it will say to every attempt. After the change:

```
GET /api/directory/size   200   584ms     (one failure, one backoff, then served)
```

- against 155ms for the same request when nothing is failing. The retry
interceptor is finally visible in the running app, which was the entire purpose
of the settings page.

### And a dependency-injection bug wearing a network error's clothes

Moving the body inside a `defer` broke something else immediately, and the
symptom was nothing like the cause:

```
GET /api/directory/size   0   439ms
console.error: ERROR ApiError: Something went wrong searching the directory.
```

Status **0**, not 503. The directory handler called `inject(DirectoryCache)` on
its first line. `inject()` works in an interceptor because an interceptor runs
in an injection context - and the `defer` callback runs at **subscription
time**, by which point that context is long gone, so it threw NG0203. An
NG0203 is not an `HttpErrorResponse`, so the log interceptor's fallback
recorded 0 and `api-error.ts` mapped it to its generic message.

The rule: everything an interceptor needs from the injector must be taken
before it returns, whatever it does afterwards. `DirectoryCache` is now
injected in the interceptor and passed down as a parameter.

## What Must Never Be Retried

The more important half of `retryInterceptor`, and the half with no visible
behaviour at all.

- **Only GET.** A POST that timed out may well have succeeded, so re-sending it
  is how an app creates two contacts from one click - a bug that cannot be
  found by looking at the client. Idempotency is what makes a retry safe and
  only the method can tell us.
- **Only status 0 and 5xx.** A 404 will be a 404 next time; a 409 is a decision
  rather than a failure; a 400 is this client's bug. Retrying any of them
  spends latency to get the same answer, and for the 409 it is a second chance
  to confuse somebody.
- **Status 0 matters most.** Offline, DNS failure, connection refused. The case
  most worth retrying, and the one a check written from a table of HTTP status
  codes misses, because 0 is not an HTTP status.

`interceptors.spec.ts` has one test per refusal - a POST, a DELETE, and a
parameterised 400/404/409/422 - because a failing test should name what it was
protecting against rather than an index.

## Small Things

**The failure queue is global, and spent per attempt.** "Fail the next three"
is not "fail the next page". A fresh visit to `/contacts` makes two requests at
once, and three failures spread across them produced two slow successes and no
error at all. The probe now primes the directory cache first, so the second
visit makes exactly one request and all three failures land on it. Worth
knowing before trusting the button.

**`(ngSubmit)` on a form with no NgForm does nothing.** The sign-in page holds
its one field in a signal and imports neither `FormsModule` nor
`ReactiveFormsModule`, so there was no NgForm on the element - and an
unrecognised event name in a template is bound as a plain DOM listener rather
than reported. `(ngSubmit)` sat there waiting for a DOM event called
"ngSubmit" that nothing will ever fire. The form did not submit at all and
nothing said so; `sign-in-page.spec.ts` failed four tests on its first run with
`expected null to be 'Ada Lovelace'`. It is `(submit)` with an explicit
`preventDefault()` now. Every other form in this app uses reactive forms,
which is why six weeks went by without meeting this.

**A `returnUrl` is untrusted input.** It is a string in a URL somebody else may
have written, and it is read and then *navigated to* - which is the
open-redirect shape. `safeReturnUrl` is a whitelist of shapes rather than a
blacklist of bad ones:

```
/settings            allowed
/settings?tab=api    allowed
//evil.test/         rejected - protocol-relative, and the one that catches people
https://evil.test    rejected - absolute
javascript:alert(1)  rejected - no leading slash
settings             rejected - relative, and ambiguous
```

Day 51 put `javascript:alert(1)` in a query parameter and the answer was
"nothing happened, it was rendered as text". Reading a value is not navigating
to it.

**`state.url`, not `route.url`.** The activated route snapshot is the obvious
place to look for the URL and is the wrong one: for `/settings?tab=api` it is
the segment list `["settings"]` with no query string anywhere in it. A
`returnUrl` that loses `?page=3` sends people back to a different page than the
one they wanted. The guard's first parameter is now `_route`, with a comment
saying why it is unused - `noUnusedParameters` made that explicit, which is the
second time this week the compiler has forced a sentence I should have written
anyway.

**No backticks inside an inline template.** Day 55 learned this in the
pagination component. I did it twice more today - in the About page's comment
about `signedInGuard`, and in the sign-in page's comment about `(ngSubmit)` -
for three TS1005s each time. An inline template is a JS template literal and
one backtick ends it.

**A spec can make the suite slow.** Nineteen retry tests waiting on real
300ms backoffs took 10.2s of a 14.2s run. Fake timers would have been faster
and would have meant asserting my model of RxJS's scheduler rather than the
behaviour. So the backoff base became `API_RETRY_DELAY`, the spec asks for
20ms, and the timers stay real: 2.6s for that file, 7.3s for the suite. The
token belongs there on its own merits too - a retry delay is decided once per
environment and never by a person using the app.

**Configuration versus state, finally stated.** `API_LATENCY` is a token and
stays one. The settings page's slider is not configuration: a token's value
cannot change after injection, so a token read by the fake server could never
follow a slider. The token supplies the default, injected as the service's
initial value, and the signal owns what happens next. That distinction took
three days to be able to say in one sentence.

## What I Learned

**A guard is a function, and that changes how it is tested.**
`TestBed.runInInjectionContext(() => signedInGuard(route, state))` needs no
router, no navigation and no component. Call it; read what it returned. Through
a real router the answer is collapsed into a URL string that has been parsed,
navigated to and re-serialised; here it is the `UrlTree` the guard built, and
`serializeUrl` shows the encoding. Day 52's interceptors could have been tested
this way and were not, because I did not know this existed.

**"May I be destroyed" is a question only the thing being destroyed can
answer.** That is why `canDeactivate` exists and why it takes the component
instance. Every other routing decision can be made from the URL and the app's
state; this one cannot be made from anywhere else.

**A resolver moves work before the component, with everything that implies.**
It gets the title right, and it also delays the navigation, duplicates a fetch,
and cancels the whole navigation if it throws. Three consequences for one
feature, none of them in the API's shape.

**Eagerness is a property I now look for.** An interceptor body, a resolver, a
guard: all of them run when the router or the chain *calls* them, not when
somebody subscribes. Anything that must happen per attempt - a decision, a
counter, a clock - has to be inside a `defer`. I predicted the opposite in two
files and then found the bug in a third, which is the clearest evidence I have
had that a mechanism I can describe is not a mechanism I understand.

**Writing the prediction down is what made it correctable.** Both wrong claims
were in comments before the spec existed. If they had stayed in my head they
would still be there; because they were written as assertions about behaviour,
a test could disagree with them. The commit contains both the original claim
and its retraction, which is the format I want for the rest of the course.

**A test that is designed to fail later is worth writing.** Day 54's "still
titles every contact page the same" test cost one line and arrived exactly when
it was needed, two days later, with the explanation attached. Better than a
TODO, which cannot run.

## Verification

`npm test` — 14 files, no browser:

```
✓  src/app/domain.spec.ts (15 tests) 19ms
✓  src/app/session.service.spec.ts (7 tests) 97ms
✓  src/app/settings.service.spec.ts (7 tests) 113ms
✓  src/app/validators.spec.ts (34 tests) 45ms
✓  src/app/contacts.api.spec.ts (24 tests) 230ms
✓  src/app/directory.service.spec.ts (12 tests) 214ms
✓  src/app/contacts.service.spec.ts (24 tests) 332ms
✓  src/app/guards.spec.ts (13 tests) 164ms
✓  src/app/pagination.spec.ts (10 tests) 503ms
✓  src/app/contact-card.spec.ts (8 tests) 391ms
✓  src/app/pages/sign-in-page.spec.ts (15 tests) 396ms
✓  src/app/contact-form.spec.ts (20 tests) 1191ms
✓  src/app/routes.spec.ts (37 tests) 994ms
✓  src/app/interceptors.spec.ts (19 tests) 2596ms

Test Files  14 passed (14)
     Tests  245 passed (245)
  Duration  7.31s
```

Day 55 had 168 in 9 files. The 77 new ones are the two guards, the dialog
service, the resolvers, the chain's order, the retry's refusals, the session,
the settings and the open-redirect whitelist. `routes.spec.ts` grew from 21 to
37.

Nine of Day 55's tests failed the moment the resolver landed, all with
five-second timeouts. `await harness.navigateByUrl('/contacts/c1', …)` used to
be one step; it now waits for a resolver's request that nothing had answered.
The helper that fixes it is the clearest statement of the phase order in the
repo:

```ts
const navigateResolving = async (url, id, component, contact = ADA) => {
    const navigation = harness.navigateByUrl(url, component);
    await settle();          // a macrotask: the request is several microtasks deep
    answerOne(id, contact);  // the RESOLVER's request, with no component on screen
    return await navigation;
};
```

`npm run typecheck` (`tsc -b --force`) passes over both projects.

`ng build`:

```
Initial total | 393.04 kB | 104.08 kB
settings-page |   2.87 kB |   1.10 kB
about-page    |   2.43 kB |   1.12 kB
```

Day 55 was 383.04 kB / 99.62 kB, so two guards, two resolvers, two
interceptors, a dialog, a session and a settings page cost **10.00 kB raw /
4.46 kB transfer** on the initial bundle. The settings page itself is not in
that number: it is a lazy chunk, and the guard means an anonymous visitor never
downloads it.

### The probe: the built bundle, driven through its own dialog

The specs mock the backend and the router harness renders only an outlet, so
nothing in them has clicked the real dialog or watched a resolver delay a real
navigation. This drives `dist/`. One presentational liberty in what follows: the log lines
come from `textContent`, which runs the id, method, URL, status and duration
together with no separators (`r1-zvpn6GET /api/directory/size200583ms`), so
spaces have been inserted to make them readable. Nothing else is edited.

```
asked for             : /settings
landed on             : /sign-in?returnUrl=%2Fsettings
reason shown          : Sign in to reach /settings.
session line          : Not signed in. Sign in to reach the settings.
settings rendered     : no

after sign-in         : /settings
settings page         : Signed in as Ada Lovelace.
session stored        : {"day56.session":"Ada Lovelace"}

request ids           : r1-ycnqm, r2-cic3p
log line              : r2-cic3p GET /api/contacts?sort=added&page=1 200 183ms

failures queued       : 1 queued. One failure is absorbed by the retry
                        interceptor; three is an error on screen.
after 1 failure       : /contacts
list rendered         : Jean Bartik, Katherine Johnson
error on screen       : none
whole log             : r1-zvpn6 GET /api/directory/size 200 583ms
                      | r2-y7uwi GET /api/contacts?sort=added&page=1 200 132ms

primed with           : r1-hp4m5 GET /api/directory/size 200 155ms
                      | r2-mwuz6 GET /api/contacts?sort=added&page=1 200 133ms
after 3 failures      : /contacts?filter=work
error on screen       : The contacts could not be loaded The contacts service
                        failed (503). Nothing was saved. Try again
whole log             : … | r3-pvm4n GET /api/contacts?…&filter=work 503 1283ms

clicking              : Jean Bartik (/contacts/c4)
url during resolve    : /contacts
on screen during      : still the list
resolve took          : 144 ms from click to URL change
url after             : /contacts/c4
document.title        : Jean Bartik | Day 56 | Guards Resolvers and Interceptors
detail requests       : r3-8aoah GET /api/contacts/c4 200 135ms
                      | r4-pq5dh GET /api/contacts/c4 200 134ms

missing url           : /contacts/does-not-exist
missing title         : Contact | Day 56 | Guards Resolvers and Interceptors
missing message       : shown

untouched leave       : /contacts, dialog absent
dirty leave url       : /contacts/new
dialog body           : Your changes to Name will be discarded.
dialog buttons        : Discard and leave / Keep editing
form still there      : yes
after Keep editing    : /contacts/new
name field keeps      : Grace Hopper
after Discard         : /contacts

after save            : /contacts/srv-44f247a3
asked on save         : no question
saved heading         : Hedy Lamarr

sign-out question     : You will be sent back to the contacts and will need to
                        sign in again to change these settings.
after sign-out        : /contacts
session line          : Not signed in. Sign in to reach the settings.
settings again        : /sign-in?returnUrl=%2Fsettings

expected 503 errors   : 0
console errors        : none
probe wall time       : 31874 ms (excluding the build)
```

Three of those lines are the day:

- `error on screen: none` after one injected failure, with the directory
  request at 583ms instead of 155ms. The retry absorbed it and nothing on
  screen moved - which is the point of a retry and the reason it needed a
  settings page to be observable at all.
- `on screen during: still the list`, with the URL unchanged. A resolver's
  request happens while the destination does not exist yet.
- `after Keep editing: /contacts/new` with `name field keeps: Grace Hopper`.
  The navigation was refused by a person, through a dialog in the shell, and
  the typing survived.

The probe's own first run reported `expected 503 errors: 2` and a 503 for the
directory on every attempt. Both of those were bugs it found rather than noise
it tolerated.

## Day 56 Outcome

Week 12 opens with the router asking three questions it could not ask before:
may this be shown, may this be left, and what is this page called. Each answer
has to come from somewhere the component cannot reach - the app's state, the
component itself, and a request made before the component exists - which is why
all three are route configuration rather than code in a page.

Two of the day's written-down claims were wrong and both were corrected by
measurement: a `UrlTree` redirect is two navigations like any other (the
difference is `true` versus `false` to the caller), and an interceptor's body
runs once per request however it is ordered (the difference is eager versus
`defer`). The second mistake then appeared for real in the fake server, where
one queued failure became three, and `defer` fixed it - and immediately
produced an NG0203 disguised as a status 0, because `inject()` does not work at
subscription time.

Three bugs found by new specs: a sign-in form that never submitted, a `saved`
flag that could never be cleared, and a failure queue spent on an endpoint I
keep forgetting exists.

245 tests, 7.3s, no browser. Day 57 is the accessibility and quality pass:
route-change announcements, focus management after navigation, and the focus
trap this dialog deliberately does not have yet.
