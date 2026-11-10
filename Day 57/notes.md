# Day 57 - Accessibility and Quality Pass

## Topics Covered

- Live regions: `aria-live`, `role="status"`, `role="alert"`, and the one rule
  that decides whether any of them do anything
- One announcer service for the whole app, and why four `aria-live` attributes
  were worth less than one
- Managing focus across a navigation in a single-page app
- A skip link, and `tabindex="-1"` on a container that is never tabbed to
- A focus trap for the confirm dialog: focus in, wrap at both ends, focus back
- `.sr-only`, `prefers-reduced-motion`, focus rings, and WCAG 2.2's target size
- `untracked`, and what happens when a service writes a signal that its
  caller's effect reads
- A quality bug the accessibility work exposed: a typeahead that showed - and
  then said out loud - the wrong number for 250ms at a time

## Practical Work

`Day 57/Accessibility and Quality Pass/` is Day 56's contacts app with an
accessibility pass over it. Nothing new appears on screen. The diff against
Day 56 is three new services, three new spec files, one new component, 102
lines of CSS, and the removal of four `aria-live` attributes - which is the
opposite of what an accessibility pass looks like it should do, and is most of
what today was about.

```
src/app/announcer.service.ts     NEW   one live region, one way to write to it
src/app/announcer.ts             NEW   the region itself, 4 lines of template
src/app/route-focus.service.ts   NEW   focus after a navigation
src/app/announcer.spec.ts        NEW   15 tests
src/app/route-focus.spec.ts      NEW   16 tests
src/app/confirm-dialog.spec.ts   NEW    9 tests
src/app/confirm-dialog.ts        focus in, trapped, and given back
src/app/app.html                 skip link, the region, <main id="main">
src/app/app.ts                   starts RouteFocus
src/app/title-strategy.ts        announces the page on a path change
src/app/notifications.service.ts announces every notice
src/app/notice-bar.ts            role="status" REMOVED
src/app/contacts-page.html       role="status" REMOVED (twice)
src/app/contacts-page.ts         announces its own result count
src/app/directory-search.html    role="status" REMOVED, role="alert" kept
src/app/directory-search.ts      announces its own result count
src/app/directory.service.ts     results now carry the query they answer
src/styles.css                   .sr-only, .skip-link, reduced motion, 24px
```

The app still runs against the fake API from Day 51, still stores its session
in `localStorage`, and still has no server. The directory fixture is still
invented addresses at example.com and example.org.

## Before: nine days of "it looks fine"

I wrote a small script (`dbg-a11y.mjs`) that loads Day 56's built bundle in
jsdom and asks ten questions. This is what it found, and I am writing it down
in full because every line of it is a thing I thought was handled:

```
live regions at rest      : skipped
#notice present           : no
activeElement             : body
after nav activeElement   : body
skip link                 : absent
main tabindex             : (none)
dialog activeElement      : body
autofocus attr            : present
outside still focusable   : YES - reachable
page behind inert         : not inert
```

Line by line:

- **live regions at rest: skipped.** The count of elements with `aria-live` or
  `role="status"` present on a resting page. The honest answer was one, and
  that one only because a deliberately malformed row in the fixture made an
  `@if` true. Every other live region in the app was inside a branch that was
  false.
- **activeElement: body** after a navigation. A keyboard user who follows a
  link is left at the top of the document, so their next Tab starts from the
  skip link that did not exist.
- **dialog activeElement: body.** The confirm dialog from Day 56 had
  `autofocus` on its cancel button and focus never went there.
- **outside still focusable: YES.** The dialog claimed `role="dialog"` and
  `aria-modal="true"` and the page behind it was fully tabbable.

The pattern is the thing worth keeping. Every one of these is invisible on
screen: the app looked right, the markup read right, and the attributes were
the ones the checklists ask for. What was missing was any check that they
*did* anything, and nine days is how long that lasted.

## One live region, and why four did nothing

A live region is an element a screen reader watches. When its contents change,
the change is read out. The important word is CHANGES. What is announced is a
mutation of something that was already being observed.

This app had four of these:

```html
@if (notifications.latest(); as notice) {
    <p role="status" id="notice">{{ notice.message }}</p>
}
```

The element and its text arrive together, in the same render, as a brand new
node. There was nothing to mutate. A screen reader that was not already
watching that element - because it did not exist a moment ago - has nothing to
report.

So Day 57 deletes all four and adds one, in the shell, rendered once, never
removed:

```html
<p class="sr-only" role="status" aria-live="polite" id="announcer">
    {{ announcer.message() }}
</p>
```

and the only way to change its text is `Announcer.announce(...)`. The argument
is Day 48's argument for `NotificationsService`, one level further down: a
thing with no common parent needs a service, and a region that must outlive
every page cannot live on a page.

That also removes the duplicate problem the naive fix creates. If I had kept
the four attributes and added this region, a working app would announce every
notice twice. With one region, nothing can be announced twice by two different
mechanisms, and the visible status paragraphs go back to being what they always
really were: ordinary text.

The one exception is kept and is worth knowing precisely:

```html
<p class="status status--error" id="directory-error" role="alert">{{ problem }}</p>
```

`role="alert"` is announced when the element is INSERTED, not when its text
changes. It is the one pattern that works from inside an `@if`. It is also
assertive - it interrupts - which is right for a failed search and wrong for a
result count. The failure is therefore said twice on purpose: assertively by
the alert, politely by the announcer.

## The invisible character, and two bugs it hid

Two searches with the same outcome are two pieces of information. "No matches
for ada" announced, and then the same thing again after a second search: the
text is identical, so the DOM does not change, so there is no mutation, so
nothing is read. The user searched and heard silence, which is
indistinguishable from the app being broken.

The fix is one no-break space on the end. The text differs by one character, so
the DOM changes; a screen reader reads U+00A0 as nothing at all.

Writing the escape rather than the character is not a style preference:

```ts
const PAD = ' ';
```

The first version of this file had the character itself inside the string
literal. It worked, and it is unreviewable - an NBSP in source looks exactly
like a space, or like an empty string, to everybody reading it, including me
three minutes later. A named constant with an escape says what it is. The same
mistake turned up again in the spec file, where `second.replace(' ', '')` had
an invisible character as its first argument; it is now
`second.replace(/ /g, '')`.

### From a counter to a comparison

The first implementation alternated a counter:

```ts
private readonly nonce = signal(0);

readonly message = computed(() =>
    `${this.messageSignal()}${this.nonce() % 2 === 0 ? PAD : ''}`
);
```

Pad on the even values, so the first announcement is clean and an immediate
repeat is padded. Fifteen tests passed. The probe disagreed:

```
same search again       : IDENTICAL - silent
```

Because the parity depends on how many announcements have been made, not on
what the region currently says. Put one different message in between and the
two identical ones land on the same parity:

```
ada -> "1 match for ada."     (odd, clean)
ad  -> "6 matches for ad."    (even, padded)
ada -> "1 match for ada."     (odd, clean - identical to the first)
```

The property that actually matters is local: every announcement must differ
from the text that is already there. That is a comparison, not a counter:

```ts
const repeat = text === this.messageSignal();
this.padded.set(repeat ? !this.padded() : false);
```

A different message needs no padding, because it is already a change. Only a
repeat of what the region currently holds needs the invisible character.

I had to write the test for this twice as well. The first version asserted
that the third message above differs from the first, which is both false and
the wrong question - a screen reader reads changes in order and never compares
a region's text with what it said two changes ago. What has to hold is that
consecutive renderings differ, and that is now asserted over a whole sequence
rather than as four separate cases.

### untracked, or an effect that announces forever

The comparison version type-checked, passed 281 tests, built, and hung the
application on the first keystroke in the search box. The probe stopped dead
after step 4 and the run had to be killed.

Everything that announces in this app does it from an `effect`, because the
thing worth announcing is a signal changing - a result count, a status, a page
title. So `announce` runs INSIDE a reactive context, and this line:

```ts
const repeat = text === this.messageSignal();
```

is not a read. It is a subscription. The calling effect now depends on the
signal that `announce` is about to write, so the effect re-runs, announces
again, writes again, and never stops.

The counter version was accidentally safe. `signal.update` reads the current
value without registering a dependency, so nothing was ever tracked. Swapping
a counter for a comparison introduced a tracked read in the same breath.

```ts
const repeat = text === untracked(this.messageSignal);
this.padded.update((padded) => (repeat ? !padded : false));
```

`untracked` for the read, `update` rather than `set(!this.padded())` for the
write, for the same reason in the same line.

Two things about how this surfaced are worth keeping. First, half the app
survived it: `contacts-page.ts` has a `lastAnnounced` guard that returns early
when the summary has not changed, so its effect looped exactly once more and
stopped. The typeahead had no such guard and looped forever. Second, the
regression test for it does not look like a test for an infinite loop:

```
AssertionError: expected '1 matches.[NBSP]' to be '1 matches.'
```

A test fixture bounds the number of effect re-runs, so the symptom in the
suite is one extra announcement and therefore one invisible character. In the
built app the same bug is a frozen page. I measured that failure by putting
the tracked read back and running the suite, so the comment above the
assertion quotes it rather than guessing at it.

## Two messages in one tick

The probe's last finding was the best one. Removing a contact shows a notice
and then navigates, and the navigation announces the page it lands on. Two
calls to `announce`, one change detection cycle. The MutationObserver on the
region recorded exactly one change:

```
announced in order      : "Contacts"
```

The sentence the user needed - "Removed Jean Bartik." - was overwritten before
it was ever in the document. A live region announces mutations, so a message
that never renders was never said.

This one is interesting because the mechanism that lost the message is the
mechanism that makes the rest of the app correct. Signals are glitch-free on
purpose: intermediate values do not render. Everywhere else in this app that
is exactly what I want. Here it silently drops information.

So the announcer has a queue. The first message renders at once, and anything
that arrives while it is current waits:

```ts
announce(message: string): void {
    const text = message.trim();
    if (text.length === 0) return;

    if (this.timer === null && this.queue.length === 0) {
        this.show(text);
        this.hold();
        return;
    }

    this.queue.push(text);
}

private hold(): void {
    this.timer = setTimeout(() => {
        this.timer = null;

        const next = this.queue.shift();
        if (next === undefined) return;

        this.show(next);
        this.hold();
    }, this.gap);
}
```

`hold()` is armed even when nothing is waiting, which looks wasteful and is
the whole point: without it, a message arriving a millisecond later would find
`timer === null`, decide nothing is current, and overwrite a message that has
not been read yet. The timer IS the "something is current" flag.

The gap is an injection token, following Day 56's `API_RETRY_DELAY`:

```ts
export const ANNOUNCE_GAP = new InjectionToken<number>('ANNOUNCE_GAP', {
    providedIn: 'root',
    factory: () => 150
});
```

The specs and the probe set it to 0 rather than spending real seconds proving
an ordering property. 150ms is a guess with a reason - long enough that two
messages are two mutations of the accessibility tree rather than one, short
enough that somebody who deletes a contact and lands on the list is not
waiting for the second sentence. **What I cannot tell you is what a particular
screen reader does with two changes 150ms apart.** jsdom has no accessibility
tree and no assistive technology attached to it. What I measured is that the
DOM now changes twice, in order:

```
announced in order      : "Removed Jean Bartik." then "Contacts"
```

That is a necessary condition for both being read, and it is as far as this
setup can go.

## Focus after a navigation

In a server-rendered app, following a link loads a document and the browser
resets focus. In a single-page app nothing happens: the DOM changes under a
focus position that is still wherever the user left it, or on the body if the
link they clicked has been destroyed with the old page. The measured before
state was `activeElement: body` after every navigation.

`RouteFocus` subscribes to `NavigationEnd` and moves focus to `<main>`, which
carries `tabindex="-1"` so that it can be focused programmatically while
staying out of the tab order. Three details took the time.

**`takeUntilDestroyed()` with no argument throws.** `start()` is called from
the shell's constructor in the app, and from `beforeEach` in the spec, and the
second one is not an injection context:

```
NG0203: takeUntilDestroyed() can only be used within an injection context
```

So the service injects `DestroyRef` as a field - which IS in an injection
context - and passes it: `takeUntilDestroyed(this.destroyRef)`. Worth
remembering that the no-argument form is the special case, not the normal one.

**The initial load must be left alone.** Focus belongs where the browser put
it; stealing it on arrival breaks "open a link and start reading" and fights
the browser's own fragment handling.

**A focus ring around the whole page is not wanted.** Day 10 already gave
every control a `:focus-visible` ring, and `#main` is the one element focused
programmatically, by the app rather than by the user:

```css
#main:focus,
#main:focus-visible {
    outline: none;
}
```

The focus is real and useful - it is where the next Tab starts and where a
screen reader begins reading - but it is not something the user did, so it is
not something to draw.

### The path is the page

Day 55 made the URL the query. Choosing a filter, typing in the list search
and turning a page are all navigations to `/contacts?something`. So "a
navigation happened" is the wrong trigger for both of today's behaviours, and
getting it wrong is worse than not doing them at all:

- Moving focus to `<main>` when somebody clicks the Work filter takes focus off
  the button they are using. Their next Tab starts at the top of the page and
  the filter they were adjusting is six presses away.
- Announcing "Contacts" again after a filter click says nothing about what
  changed. The thing that did change is the count, and the only component that
  knows the count is the page.

One exported helper, in `route-focus.service.ts`:

```ts
export function pathOf(url: string): string {
    const query = url.indexOf('?');
    const fragment = url.indexOf('#');

    const cut = [query, fragment].filter((index) => index >= 0);

    return cut.length === 0 ? url : url.slice(0, Math.min(...cut));
}
```

Two consumers use it - `RouteFocus` and `AppTitleStrategy` - and each keeps its
own copy of the last path. Shared state would mean whichever ran first decided
what the other saw. Both record the new path BEFORE their early returns, so a
query-only navigation still updates what "the current page" is; without that,
`/first` then `/first?page=2` then `/second` would compare against `/first`
and work by accident.

The measured result, which is the pair of lines I wanted most:

```
url after nav           : /about
activeElement after     : main#main
announced after         : About this build

url after filter        : /contacts?filter=work
activeElement after     : button
announced after         : 3 contacts matched, page 1 of 1
```

A new page takes focus and is announced by name. A new query leaves focus on
the button and is announced by count.

## The skip link and `<main>`

```html
<a class="skip-link" href="#main">Skip to the contacts</a>
```

First element in the document, off-screen until focused, and then
unmistakable:

```css
.skip-link { position: absolute; top: -3rem; /* ... */ }
.skip-link:focus, .skip-link:focus-visible { top: 0; }
```

`top: -3rem` rather than `.sr-only`, because this one has to be SEEN when it is
focused. A skip link that stays invisible while focused is worse than none: the
user's focus has gone somewhere they cannot find.

`.sr-only` itself is the pattern for the announcer region, and the three wrong
ways to write it are all things I have written before:

```
display: none         removed from the accessibility tree; a live region here
                      announces nothing - the exact bug .sr-only avoids
visibility: hidden    same
width: 0; height: 0   some screen readers skip zero-sized boxes
```

A 1px clipped box is still a rendered box; it is just somewhere nobody looks.
`white-space: nowrap` is the detail that gets dropped: without it a long
announcement wraps inside a 1px box and some readers read the fragments as
separate lines.

## The dialog: in, trapped, and back out

Day 56's confirm dialog asked the right question and returned the right
answer. All three of its focus behaviours were missing.

**Focus in.** `autofocus` is processed when a document is parsed. This element
is inserted long afterwards, so the attribute did nothing - measured as
`dialog activeElement: body`. It is now imperative: a `viewChild` on the
dialog element and `focus()` on the cancel button when the question appears.
The attribute is gone, and the probe confirms it is gone and the behaviour is
not:

```
focus on open           : button#dialog-cancel
autofocus attr          : absent (set in code)
```

Cancel rather than confirm, which is Day 56's stated reasoning finally made
true: a focused "Discard and leave" plus a stray Enter should not throw away
somebody's work.

**Trapped.** A `keydown` handler that wraps at both ends, and only at the ends:

```
Tab from last           : button#dialog-confirm, default prevented
Shift+Tab wraps         : button#dialog-cancel, default prevented
```

Tab in the middle of the dialog is deliberately left alone. A trap that
`preventDefault`s every Tab has to re-implement focus order, and
re-implementing focus order is how you end up skipping a control somebody
needed.

**Back out.** The element that opened the question is recorded and focused
again when it closes, with `??=` so that a second question opening while the
first is up cannot record the dialog's own button as the return target - and
with a fallback to `#main` for the case that matters most, where the answer was
"discard and leave" and the page holding the opener has been destroyed.
Focusing a detached node silently does nothing, so there has to be somewhere
else to go.

```
after Keep editing      : /contacts/new
focus restored to       : a
name field keeps        : Grace Hopper
after Discard           : /contacts
focus after leaving     : a
```

### The effect that focused `<main>` on every page load

The dialog's focus restoration is driven by an effect that reads the current
question. An effect runs once when the component is created, and at that point
there is no question and no dialog element - which is indistinguishable from
"the dialog has just closed" unless something remembers that it was never open.
It did not, so "restore focus" ran on startup, found no recorded opener, took
the `#main` fallback, and every page in the app loaded with:

```
activeElement on load   : main#main
```

A `hasBeenOpen` flag fixes it, and `confirm-dialog.spec.ts` has a test called
"does not touch focus before it has ever been opened" that would have caught
it - except that every other test in that file opens the dialog first, so none
of them could. This is the second time today that a bug lived in the gap
between "every test sets this up" and "the application does not".

```
activeElement on load   : body
```

## What making it speak found: the typeahead was lying

This is the part of the day I did not expect, and it is the reason the folder
is called a quality pass and not just an accessibility pass.

Once the search box announced its result count, the live region produced this:

```
region mutations        : 6
  heard 1               : "No matches for ada."
  heard 2               : "1 match for ada."
  heard 3               : "1 match for ad."
  heard 4               : "1 match for ad.[NBSP]"
  heard 5               : "1 match for ada."
  heard 6               : "1 match for ada.[NBSP]"
```

Every search announced twice, and the first of each pair was wrong. "No
matches for ada" when there is one. "1 match for ad" where the 1 is ada's
count.

The cause is a gap in the service's own state. `query` is a signal written on
every keystroke; `results` comes out of a pipeline with `debounceTime(250)` in
it. Between a keystroke and the debounce expiring, `results` holds the previous
query's rows while `query` holds the new text - and `searching` is FALSE,
because it is set when the request starts, which is after the debounce. So
anything that combined the two described neither.

That paragraph had been on screen since Day 53 doing exactly the same thing,
and I had never once noticed. A wrong count shown for a quarter of a second
looks like a render. A wrong count read out is a sentence.

The fix is to make the answer self-describing. The pipeline emits a pair
instead of an array:

```ts
interface Answer {
    readonly query: string;
    readonly entries: readonly DirectoryEntry[];
}

readonly results = computed(() => this.answer().entries);
readonly answeredQuery = computed(() => this.answer().query);
readonly settled = computed(() => this.answeredQuery() === this.query().trim());
```

The query goes into the `catchError` branch too, so a failed search is settled -
the error belongs to that query and may be shown against it. Without that the
"searching" branch would win forever after one bad request and the box would
sit saying "Searching..." for the rest of the session.

Both the announcement and the visible paragraph now check `settled`, and both
read `answeredQuery()` rather than `query()` when they print the query back.
After the fix, one mutation per search, and the two cases of the padding
visible side by side:

```
status mid-keystroke    : Searching…
status once settled     : 0 matches for “hopper”.
region mutations        : 4
  heard 1               : "1 match for ada."
  heard 2               : "1 match for ad."
  heard 3               : "1 match for ada."
  heard 4               : "1 match for ada.[NBSP]"
identical in a row      : none
```

`heard 3` is a repeat with a different message in between, so it is plain text.
`heard 4` is the same search again with the box emptied in between - emptying
announces nothing, so those two are consecutive - and the invisible character
is the only thing that makes it a mutation.

The MutationObserver is worth a note of its own. Counting mutations of the
region is not a proxy for "what was read out"; a change to a watched region is
the event a screen reader responds to, so it is the closest thing to a direct
measurement available here. It also cannot be fooled the way my first attempt
fooled itself: comparing two snapshots either side of an intervening message
says IDENTICAL when the region changed twice.

## What CSS can and cannot promise here

Two rules went in that I cannot verify in this setup, and both say so in the
stylesheet rather than in a commit message.

```css
@media (prefers-reduced-motion: reduce) { /* ... */ }
```

There is not much animation in this app - the skip link slide, the notice bar -
and "not much" is not a reason to ignore the preference. The blanket rule is
deliberate: it is a promise that holds for animations added later by somebody
who has not read the file.

```css
.button--small { min-height: 24px; }
```

WCAG 2.2 asks for 24x24 CSS pixels. `.button--small` is 13px text with 4px of
vertical padding, which computes to roughly 28px once line height is included,
so it probably already passed. "Probably" is as far as I can get: **jsdom has
no layout engine**, so the probe cannot measure a rendered height. The
`min-height` costs nothing, changes nothing today, and means a later tightening
of the padding cannot quietly drop these below the threshold.

The same limit applies to the skip link. Whether it is visible when focused is
a CSS question, and `getComputedStyle` in jsdom does not resolve `top` through
a `:focus` rule. The probe checks that the link exists, is the first anchor in
the document, and points at `#main`. The rest is a thing to look at in a real
browser, and the notes say so rather than implying a measurement.

The third limit is the tab key. jsdom does not implement tab traversal, so
pressing Tab there does not move focus the way a browser does. The dialog trap
is therefore measured by dispatching the `keydown` the component listens for.
That is a fair test of this implementation - the mechanism under test is the
handler - and it is explicitly not a test of the browser's focus order.

## What I Learned

**A live region has to exist before the message does.** Four `aria-live`
attributes inside `@if` blocks announced nothing for nine days, and nothing on
screen looked wrong. "Add `aria-live`" is not the fix; one region that outlives
every page, with one way to write to it, is.

**`role="alert"` is the exception, because it fires on insertion.** That is why
it is the one thing in this app that worked from inside an `@if`, and why it is
kept for the search failure and used nowhere else.

**An identical message is silence.** The DOM did not change, so nothing is
read. One no-break space fixes it; whether to add that space is a comparison
against the text in hand, never a counter of calls.

**Writing a signal inside an effect that reads it is an infinite loop, and
`signal.update` is what hides it.** `update` does not register a dependency, so
a counter version of the same code was accidentally safe. The moment the
comparison introduced a tracked read, the built app froze on the first
keystroke - with every test still green, because a spec calls the service
directly and there is no effect to re-run.

**Signals being glitch-free loses announcements.** Two messages in one change
detection cycle render once. Everywhere else in this app that is the behaviour
I want; for a live region it drops information, and the only fix is to make the
messages happen at different times.

**A navigation is not a new page.** Once the URL carries the query, "focus the
main region on NavigationEnd" steals focus from the control the user is using,
and "announce the title on NavigationEnd" says the page name when the count is
what changed. The path is the page; the query is the state of it.

**`takeUntilDestroyed()` with no argument needs an injection context.** The
no-argument form is the special case. A service that can be started from
anywhere - a constructor, a `beforeEach` - injects `DestroyRef` as a field and
passes it.

**`autofocus` is a parse-time attribute.** For anything inserted later it is
decoration. Focus has to be moved in code, and then it has to be given back,
and the hard part of giving it back is the case where the thing that asked no
longer exists.

**An effect's first run is not an event.** The dialog's restore-focus effect
ran once on creation, read "no dialog open" as "just closed", and put focus on
`<main>` on every page load in the app. A flag for "has this ever been open"
is the difference between a state and the absence of one.

**Making an app speak is a quality audit.** The typeahead had been showing the
previous query's count for 250ms after every keystroke since Day 53. I read
that paragraph hundreds of times and never saw it. The announcement said it in
words and it was obvious immediately.

**`npm test`, not `npx vitest run`.** `npm run typecheck` emits compiled specs
into `out-tsc/`, and running vitest directly picks them up alongside the
TypeScript ones: 34 files instead of 17 and 206 failures reading
`ReferenceError: localStorage is not defined`, because the compiled copies run
without the Angular builder's jsdom environment. `ng test` knows which files
are the sources.

## Verification

Type checking, from `Day 57/Accessibility and Quality Pass/`:

```
> npm run typecheck
> tsc -b --force
(no output)
```

The suite - 288 tests in 17 files, up from Day 56's 245 in 14:

```
> npm test

 ✓ src/app/session.service.spec.ts      (7 tests)    78ms
 ✓ src/app/settings.service.spec.ts     (7 tests)    81ms
 ✓ src/app/domain.spec.ts               (15 tests)    8ms
 ✓ src/app/validators.spec.ts           (34 tests)   27ms
 ✓ src/app/contacts.api.spec.ts         (24 tests)  201ms
 ✓ src/app/announcer.spec.ts            (15 tests)  462ms
 ✓ src/app/guards.spec.ts               (13 tests)  157ms
 ✓ src/app/directory.service.spec.ts    (15 tests)  213ms
 ✓ src/app/contacts.service.spec.ts     (24 tests)  299ms
 ✓ src/app/contact-card.spec.ts         (8 tests)   491ms
 ✓ src/app/confirm-dialog.spec.ts       (9 tests)   656ms
 ✓ src/app/pagination.spec.ts           (10 tests)  502ms
 ✓ src/app/pages/sign-in-page.spec.ts   (15 tests)  339ms
 ✓ src/app/route-focus.spec.ts          (16 tests)  461ms
 ✓ src/app/routes.spec.ts               (37 tests)  809ms
 ✓ src/app/contact-form.spec.ts         (20 tests) 1197ms
 ✓ src/app/interceptors.spec.ts         (19 tests) 2514ms

 Test Files  17 passed (17)
      Tests  288 passed (288)
   Duration  6.62s
```

One stderr line in that run is expected: `contact-card.spec.ts` has a test
called "needs a router only when it is given a link" which asserts that
NG0201 is thrown, and the thrown error is logged on the way past.

The production build:

```
> npx ng build

                    | Initial total | 397.92 kB |  105.38 kB

Lazy chunk files    | Names         |  Raw size | Estimated transfer size
chunk-76IEPR6E.js   | settings-page |   2.87 kB |    1.10 kB
chunk-6QFASJPJ.js   | about-page    |   2.52 kB |    1.12 kB
```

Day 56 was 393.04 kB raw and 104.08 kB transfer, so the whole pass costs
**4.88 kB raw and 1.30 kB over the wire** - three services, a focus trap, a
queue and 102 lines of CSS. The lazy chunks are unchanged apart from the About
page, which gained 0.09 kB because its paragraph now describes this day
instead of Day 56.

The probe against the built bundle, in full. Every line of it is one of the
"before" measurements taken again:

```
> node probe-57.mjs .../dist/contacts/browser

skip link               : #main
skip link is first      : skip-link
main tabindex           : -1
live region at rest     : present
region text at rest     : (empty)
region role             : status / polite
region hidden how       : sr-only
live regions now        : #announcer
activeElement on load   : body
announced on load       : (empty)
url after nav           : /about
activeElement after     : main#main
announced after         : About this build
document.title          : About this build | Day 57 | Accessibility and Quality Pass
before filter click     : button
url after filter        : /contacts?filter=work
activeElement after     : button
announced after         : 3 contacts matched, page 1 of 1
before dialog           : a
dialog open             : yes
focus on open           : button#dialog-cancel
autofocus attr          : absent (set in code)
Tab from last           : button#dialog-confirm, default prevented
Shift+Tab wraps         : button#dialog-cancel, default prevented
after Keep editing      : /contacts/new
focus restored to       : a
name field keeps        : Grace Hopper
after Discard           : /contacts
focus after leaving     : a
directory status        : 1 match for “ada”.
announced result        : 1 match for ada.
status is live          : no, the region is
status mid-keystroke    : Searching…
status once settled     : 0 matches for “hopper”.
region mutations        : 4
  heard 1               : "1 match for ada."
  heard 2               : "1 match for ad."
  heard 3               : "1 match for ada."
  heard 4               : "1 match for ada.[NBSP]"
identical in a row      : none
favourite pressed       : true
pressed after click     : true
favourite label         : Unfavourite
notice after toggle     : (none)
announced after toggle  : (empty)
url after remove        : /contacts
announced in order      : "Removed Jean Bartik." then "Contacts"
notice on screen        : Removed Jean Bartik. Dismiss
notice is live          : no, the region is
announced notice        : Contacts
console errors          : none
probe wall time         : 31075 ms (excluding the build)
```

Side by side with the "before" column:

| measurement | Day 56 | Day 57 |
| --- | --- | --- |
| live regions at rest | effectively none | `#announcer`, present and empty |
| `#notice` is live | `role="status"`, announced nothing | plain text; the region speaks |
| focus after a navigation | `body` | `main#main` |
| focus on a query-only navigation | `body` | left on the control |
| skip link | absent | `#main`, first anchor |
| `main` tabindex | none | `-1` |
| focus when the dialog opens | `body` | `button#dialog-cancel` |
| `autofocus` | present, did nothing | removed; focus set in code |
| Tab out of the dialog | reachable | wrapped, default prevented |
| focus when the dialog closes | `body` | the opener, or `#main` |
| focus on page load | `main#main` (a bug) | `body` |
| two announcements in one tick | second only | both, in order |
| typeahead count mid-keystroke | previous query's count | `Searching…` |

Three lines in there need stating plainly rather than being quietly left out.

The favourite toggle is in the probe for one reason: to check that the control
exposes `aria-pressed`, because it is the one state change on the detail page
that is deliberately NOT announced. It is a toggle button and focus is on it,
so a screen reader reads the state from the control itself and an announcement
would say the same thing twice. `aria-pressed` is present, and that is what
those lines confirm.

What they also show is that **the value did not change when the button was
clicked**. Jean Bartik is `"favourite": true` in the fixture, the label reads
"Unfavourite" before and after, and there is no error notice either. I gave it
2.6 seconds rather than 0.9 in case the retry interceptor was involved, and
nothing changed. Clicks on that page do reach their handlers - `#detail-remove`
is clicked three lines later and works - so the gap is somewhere between the
PATCH and what the page shows afterwards.

**I have not established which, and I am not going to guess in a notes file.**
It is not an accessibility finding and nothing in today's pass touched that
path, so it goes down as a lead rather than a fix: the detail page is already
Day 58's business, because it fetches every record twice and the plan is to
replace both fetches with `httpResource`. That rewrite has to make the toggle
demonstrably work, and this measurement is the test it has to pass.

## Day 57 Outcome

The app does nothing new and says a great deal more. Four live regions that
announced nothing are gone, replaced by one that does, and the two things that
only a screen reader user experiences - where focus is, and what changed - are
now handled on every navigation, in every dialog, and on every search.

Five bugs were found today, and only one of them was a bug I set out to find:

1. `autofocus` on the dialog never worked (found by the "before" script).
2. The dialog's effect focused `<main>` on every page load in the app (found by
   the probe, now a regression test).
3. The padding counter made a repeated message silent when a different message
   came between them (found by the probe, now a sequence test).
4. The comparison that fixed it froze the app on the first keystroke, because
   it read a signal inside its caller's effect (found by the probe hanging;
   now `untracked`, with a test).
5. The typeahead had been showing the previous query's result count for 250ms
   after every keystroke since Day 53 (found by hearing it said out loud).

And one that is written down without a fix: clicking Favourite on the detail
page does not change `aria-pressed`, the button's label, or produce an error.
The probe measures it, the notes say it is unexplained, and Day 58 inherits it
along with the duplicated fetch it probably belongs to.

The thing I will take forward from the week is that none of those five is
visible on screen, and all five are obvious the moment something is asked to
report what it is doing. Day 58 is performance and deferred loading, which is
the same discipline pointed at a different target - and it has a specific job
waiting for it, because the detail page still fetches every record twice and
Day 56's notes promised `httpResource` as the fix.
