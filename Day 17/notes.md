# Day 17 - Events and Forms

## Topics Covered

- `addEventListener` and the event object
- Bubbling, capturing and `event.eventPhase`
- `target` against `currentTarget`
- Event delegation
- `preventDefault`
- `submit` on the form rather than `click` on the button
- `FormData`
- The Constraint Validation API and `input.validity`
- `:user-invalid`
- `input`, `change`, `focusout` and `reset`
- Debouncing
- Custom events
- Focus management after deleting an element

## Practical Work

Yesterday the tracker could only be re-rendered from the console. Today it is a
real app: add an expense with a validated form, search, filter by category,
sort, and delete a row.

The structure from Day 16 did not change. State lives in one object, every
handler changes state and calls `render()`, and no handler edits a node
directly. That rule paid off immediately — adding the search box, the sort
control and the filters needed three tiny handlers and no changes to the
rendering code at all.

## The Event Object

Two properties that are not the same thing:

- `event.target` — the deepest element the event actually happened on
- `event.currentTarget` — the element whose listener is running

Clicking a Delete button inside a row inside the list gives
`target = <button>` and, for a listener on the list, `currentTarget = <ul>`.
That gap is what delegation is built on.

An event travels in three phases: down from the root (capture), at the target,
then back up (bubble). `addEventListener` listens in the bubble phase unless a
third argument says otherwise. I logged `event.eventPhase` once to see it — `3`
for bubbling, `2` at the target.

## Event Delegation

One listener on the list, not one per row:

```js
expenseList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;

    const row = button.closest(".expense");
    const id = Number(row.dataset.id);
    ...
});
```

Why this and not a listener per button:

1. The rows are destroyed and rebuilt on **every** render. Per-row listeners
   would have to be re-attached each time.
2. A row added later would have no listener at all, which is the classic bug
   where "the buttons work until you add a new one".
3. One listener instead of N.

The `if (!button) return` guard is the important line. A click on the row
background still fires the listener, and without the guard `closest` returns
`null` and the next line throws.

`closest()` walking *up* is what makes this robust. If I later put an icon
inside the button, the click target becomes the icon, and `closest` still finds
the button.

The category filters use exactly the same pattern — one listener for six
buttons, keyed off `data-category`.

## Forms

### submit, not click

```js
form.addEventListener("submit", (event) => { event.preventDefault(); ... });
```

A form can be submitted by pressing Enter in a text field, not only by clicking
the button. A `click` listener on the button misses that entirely, and the page
reloads.

`preventDefault()` stops the browser navigating. Without it the page reloads and
every expense in memory is gone — which is what happened the first time I ran
it.

### FormData

```js
const data = Object.fromEntries(new FormData(form));
```

Reads every **named** control in one call, so the handler needs no references to
individual inputs. `name` is what puts a control in `FormData`, and `id` is what
links the label — the distinction I first met on Day 5.

### The Constraint Validation API

The form has `novalidate`, which surprised me at first. It does **not** turn
validation off. It only stops the browser showing its own error bubbles, and
those bubbles cannot be styled, disappear on their own and only show one at a
time.

Every constraint in the HTML is still evaluated and readable:

```js
input.validity.valueMissing     // required, and empty
input.validity.rangeUnderflow   // below min
input.validity.tooLong          // over maxlength
input.validity.valid            // all of them at once
input.validationMessage         // the browser's own wording
```

So the rules stay in the markup — `required`, `min`, `max`, `step`, `maxlength`
— and JavaScript only decides where to *show* the message. Nothing is
duplicated, and the constraints still work if my script fails to load.

My message lookup falls back to `input.validationMessage` when I have not
written wording for a case, so a field can never fail silently with a blank
error line.

### When to validate

- `focusout` — validate a field when the user leaves it, not while they type
- `input` — clear an existing error the moment the field becomes valid again
- `submit` — validate everything

`blur` does not bubble, so a listener on the form never hears it. `focusout` is
the bubbling version and is the reason a single listener on the form works for
every field.

`:user-invalid` in the CSS does the same thing for styling — unlike `:invalid`
it only matches after the user has actually interacted with the field, so an
empty required field is not flagged red before it has been touched.

### reset fires early

```js
form.addEventListener("reset", () => {
    setTimeout(() => { clearErrors(); render(); }, 0);
});
```

The `reset` event fires *before* the fields are cleared, so reading values in
the handler gives the old ones. The `setTimeout(..., 0)` lets the reset finish
first.

## Debouncing

```js
function debounce(fn, delay) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), delay);
    };
}
```

`input` fires on every keystroke. Re-rendering eight rows that often is fine;
calling an API that often is not. The debounce cancels the pending timer each
time a new event arrives, so the work only happens once the events stop.

It is closures again from Day 13 — `timer` lives in the returned function's
scope and persists between calls. The same helper is what a search box that hits
an API needs on Day 18.

`input` against `change`: `input` fires on every edit including paste and the
search box's clear button; `change` fires when the field is left, or
immediately for a `<select>`. So the search box uses `input` and the sort
dropdown uses `change`.

## Custom Events

```js
form.dispatchEvent(new CustomEvent("expense:added", { detail: expense, bubbles: true }));
```

Anything that cares about a new expense can listen for it, and the submit
handler does not have to know who those things are. The payload goes in
`detail`, and `bubbles: true` is needed for a listener on `document` to hear it
— custom events do not bubble by default.

Day 19 can hang the "save to localStorage" step off this without touching the
submit handler.

## Focus Management

The part I would not have thought about a week ago.

When a focused Delete button is removed from the page, focus falls back to
`<body>`. A keyboard user is silently returned to the top of the document and
loses their place.

So before re-rendering I work out which row will be next, and after rendering I
move focus to that row's Delete button — or to the search box if the last row
has just gone.

Similarly, after a successful add, focus goes back to the Description field so
another expense can be typed straight away.

The `/` shortcut has the same care in it: it checks `document.activeElement`
first, so typing a slash inside a text field types a slash instead of stealing
focus, and it calls `preventDefault()` so the browser's own quick-find does not
open on top.

## What I Learned

`target` is where the event happened, `currentTarget` is where the listener is,
and delegation lives in the gap between them.

One listener on a container beats one per item, and it is the only version that
works for elements created later.

`closest()` is what makes a delegated handler survive changes to the markup
inside the button.

Listen for `submit` on the form, not `click` on the button, or Enter is ignored.

`preventDefault()` is the first line of a submit handler, and forgetting it
loses all in-memory state to a reload.

`novalidate` does not disable validation, it disables the browser's bubbles —
`input.validity` still has every answer.

`blur` does not bubble; `focusout` does.

The `reset` event fires before the fields are actually cleared.

A debounce is a closure over a timer, and it is the difference between a search
box that renders once and one that renders on every keystroke.

Deleting the focused element strands the keyboard user unless focus is moved
deliberately.

## Day 17 Outcome

The expense tracker is interactive: a validated add form using the Constraint
Validation API with per-field messages, a debounced search, category filters
with `aria-pressed`, five sort orders, and per-row delete — all handled by
delegated listeners on containers rather than per-row handlers. State stays in
one object, every handler ends in `render()`, focus is managed after add and
delete, and a custom `expense:added` event is dispatched for Day 19 to hook
into. Nothing persists yet: a reload still empties it, which is what
`localStorage` fixes on Day 19.
