# Day 38 - Accessibility and quality pass

## Topics Covered

- What a client-side route change announces by default (nothing)
- A polite live region, and why it must start empty
- Focus management after navigation, and where the hook has to live
- `tabIndex={-1}`: the one correct use of a negative tabindex
- An error summary, focused on a failed submit
- Measuring contrast instead of guessing
- Keeping a dead code and `any` sweep honest
- Tests for things that are invisible to a mouse

## Practical Work

Day 37's app, with the accessibility gaps closed and tests for each one.

```text
src/components/RouteAnnouncer.tsx   new - live region + focus hook
src/routes/Layout.tsx               announces, and owns focus
src/components/BookForm.tsx         an error summary
src/components/Panel.tsx            unchanged, in the end
src/styles.css                      summary styles, one colour change
src/routes/accessibility.test.tsx   new - 23 tests
```

**83 tests**, up from 60.

## Routing Announces Nothing

The biggest problem, and it is invisible if you only use a mouse.

In a server-rendered site, following a link loads a new document: the screen
reader announces the new page and focus returns to the top. A client-side
router does **neither**. The URL changes, the DOM is swapped, and from an
assistive technology's point of view nothing happened — focus is still on the
link that was clicked, which may no longer exist, and no new content was
announced.

So a routed app has to do by hand what the browser used to do for free.

### The live region

```tsx
<div className="visually-hidden" role="status" aria-live="polite" id="route-announcer">
    {message}
</div>
```

Three decisions in that one element:

**It starts empty.** A live region announces *changes* to its contents, so text
that was there on mount is never read out. Rendering the page name immediately
would do nothing at all.

**`polite`, not `assertive`.** The announcement waits for a gap rather than
interrupting whatever is being read. `assertive` is for something that cannot
wait — a session about to expire, not a navigation the user just asked for.

**Nothing on the first render.** The browser has already announced the
document; a duplicate is noise.

```tsx
useEffect(() => {
    if (first.current) { first.current = false; return; }
    setMessage(`${title} page`);
}, [location.key, title]);
```

`location.key`, not `location.pathname` — so navigating to the same path twice
(resubmitting a search, clicking the current nav link) still announces. The key
changes on every history entry.

And the page name comes from a lookup, not from the pathname:

```tsx
if (pathname.startsWith("/book/")) return "Book details";
```

Otherwise `/book/OL45804W` announces an id.

## The Bug A Test Found

The best thing that happened today.

My first focus implementation was a hook called **inside each route
component**, returning a ref for that route's heading:

```tsx
// in SearchRoute, ListRoute, AddRoute, BookRoute, NotFound
const headingRef = useFocusOnRouteChange();
<Panel headingRef={headingRef} ... />
```

It read correctly and it never fired once. The test said so:

```text
× focus management > moves focus to the new route's heading
  → expect(element).toHaveFocus()
```

**A route component is unmounted and remounted when the route changes.** So its
`first.current` ref was a fresh `true` on every navigation, and the
"skip the first render" guard skipped *every* render. The feature was dead on
arrival, and clicking around by hand would never have told me — focus moving or
not moving is not visible.

The fix is a different shape, not a patch:

```tsx
// in Layout, which survives the navigation
const mainRef = useFocusMainOnRouteChange();
<main id="main" ref={mainRef} tabIndex={-1}>
```

The layout persists across route changes, so its ref persists too. Focusing
`<main>` rather than each route's heading also deleted the per-route plumbing
from five files — one component owns focus, and routes do not have to opt in.

The lesson underneath it: **a ref that is meant to persist across navigation
has to live in a component that persists across navigation.** Obvious written
down, and I got it wrong in five files.

### tabIndex={-1}

```tsx
<main id="main" ref={mainRef} tabIndex={-1}>
```

`<main>` is not focusable by default. A negative tabindex makes it focusable
**by script and not by Tab**, which is the one correct use of the attribute —
a zero or positive value would add a pointless tab stop on every route.

And not on arrival. Pulling focus out of the address bar when someone has just
typed a URL is worse than the problem being solved.

## The Error Summary

Day 29's form reported errors beside each field. That works for someone
looking at it. For a screen reader user, a failed submit changed a line of text
near the bottom and left focus on the submit button — **nothing announced, and
no indication why nothing happened.**

```tsx
{submitted && hasErrors && (
    <div className="error-summary" ref={summaryRef} tabIndex={-1} role="alert" ...>
        <h3>There are 2 problems with this form</h3>
        <ul>{listedErrors.map(({ name, message }) => (
            <li key={name}><a href={`#${fieldId(name)}`}>{message}</a></li>
        ))}</ul>
    </div>
)}
```

The pattern from the GOV.UK Design System, and the thing that makes a long form
usable without sight: a focusable region listing every problem, with a real
link to each field.

**The messages are listed in field order**, not in whatever order the keys
happen to be in:

```tsx
const ORDER: readonly (keyof Fields)[] = ["title", "authors", "year", "status", "note"];
```

So the summary reads in the same order as the form.

### Focusing it is an effect

```tsx
useEffect(() => {
    if (submitCount > 0 && hasErrors) summaryRef.current?.focus();
}, [submitCount, hasErrors]);
```

One of the few places focus management genuinely *is* an effect rather than an
event: the element has to exist before it can be focused, and it does not exist
until this render has committed. Day 33's definition — synchronising with
something outside React, here the document's focus.

`submitCount` rather than depending on `errors` alone, because submitting the
same broken form twice produces a new-but-equal errors object, and the effect
would not re-fire.

## The Duplicated Message

Adding the summary broke five existing tests:

```text
→ Found multiple elements with the text: A title is required.
```

Every message now appears **twice on purpose** — once at the top for a screen
reader to land on, once beside the field for someone looking at it.

That is the test suite doing exactly its job: the DOM changed and the tests
said so. The fix is for each test to say which copy it means, not to remove the
duplication, which is the whole point of the pattern.

```tsx
expect(titleField()).toHaveAccessibleDescription("A title is required.");
expect(summaryMessages()).toEqual(["A title is required."]);
```

`toHaveAccessibleDescription` resolves `aria-describedby`, so it asserts the
message a screen reader hears when focus is on the field — which is a better
assertion than "this text is somewhere on the page" was.

## Measuring Contrast

I added a darker muted colour and wrote a comment claiming the old one failed.
Then I calculated the ratios properly, and I was wrong:

```text
text-muted  #5a646e on #ffffff   6.03:1    (I had guessed 4.98)
text-muted  #5a646e on #eef3f9   5.40:1    (I had guessed 4.58)
body        #1c2126 on #ffffff  16.22:1
brand       #17457f on #ffffff   9.57:1
white on brand button            9.57:1
white on the unread badge        6.03:1
white on the finished badge      6.51:1
danger on the error box          7.18:1
```

**Everything already passed AA**, including the two I was sure were the
problem. So the change stayed — `.summary__label` is 0.8125rem and the muted
tone at that size was the one thing I could not read comfortably at arm's
length, and 4.5:1 is a floor rather than a target — but the comment in the
stylesheet now says that, rather than claiming a fix that was not needed.

```text
text-muted  #4a535c on #ffffff   7.83:1
text-muted  #4a535c on #eef3f9   7.02:1
```

The thing worth recording: I only know the old values were fine because I
calculated them instead of guessing, and my guess was out by more than a point.

## The Quality Sweep

```text
console.* in app source      only one, inside a comment
: any / as any               none
@ts-ignore / @ts-expect-error none
TODO / FIXME / XXX           none
outline: none                nowhere (only a comment saying so)
positive tabindex            none
placeholders without a label all three have real labels
```

The placeholder check is the one worth having. A placeholder is not a label —
it disappears on focus, it is often too low-contrast, and it is not reliably
announced. All three here sit next to a real `<label>`, and the test
"labels every form control" asserts it rather than my grep.

## Tests For Invisible Things

23 new tests, and they are the ones I would have been least likely to write —
every fix today is invisible to a mouse. A route announcement that stops
working, or focus that stops moving, would show up in no other test and in no
casual use either, until somebody who needs it tried the app.

A few that earn their place:

```tsx
it("gives the skip link a target that exists", () => {
    expect(skip).toHaveAttribute("href", "#main");
    expect(screen.getByRole("main")).toHaveAttribute("id", "main");
});
```

A skip link pointing at a missing id is **worse** than no skip link, because it
looks like it works. Same assertion for every summary link: the field it names
has to exist.

```tsx
it("does not announce a route parameter as the page name", ...)
it("exposes the filters as buttons with a pressed state", ...)
it("does not steal focus on the first render", ...)
```

## What I Learned

A client-side route change announces nothing and moves focus nowhere. Both have
to be done by hand, and neither is visible when testing with a mouse.

A live region must start empty, because it announces changes and not contents.

`location.key` rather than `pathname`, so navigating to the same path announces.

A ref meant to survive navigation has to live in a component that survives
navigation. Mine was in five components that remount, so the feature never ran.

`tabIndex={-1}` is the one correct use of a negative tabindex: reachable by
script, not by Tab.

An inline error beside a field is not enough on its own. A focusable summary is
what tells a screen reader user that the submit failed and why.

Focusing something that has just rendered is one of the few legitimate uses of
an effect for a user action, because the element does not exist until commit.

A test that breaks because the DOM legitimately changed is the test suite
working. Make the test specific; do not remove the behaviour.

Calculate contrast. My guess was out by more than a point in both directions,
and the colour I was sure had failed was passing comfortably.

## Verification

```text
npm run typecheck   ->  0 errors
npm test            ->  4 files, 83 tests, all passing
npm run build       ->  clean
```

```text
src/state/reducer.test.ts          26
src/components/BookForm.test.tsx   17
src/routes/routing.test.tsx        17
src/routes/accessibility.test.tsx  23   <- new
```

Seven failures on the first run. Five were existing tests breaking because the
error summary duplicated every message — correct behaviour, specific fixes. One
was a bad assertion of mine (`getByRole("status")` matching the storage notice
as well as the announcer). And one was a real bug in the feature I had just
written, which no amount of clicking would have found.

## Day 38 Outcome

Route changes now announce politely and move focus to `<main>`, with neither
happening on arrival. The form has a focusable error summary listing every
problem in field order, each linked to a field that is asserted to exist. The
skip link's target is tested. The summary list, every region and the nav all
have accessible names. The whole palette is measured rather than assumed, and
the sweep for `any`, `@ts-ignore`, stray `console` calls, `outline: none`,
positive tabindexes and unlabelled placeholders came back clean.

Day 39 is the production build and deployment: a real build, a local preview,
the `BrowserRouter` rewrite problem from Day 36, and a base path.
