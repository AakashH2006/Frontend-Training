# Day 16 - DOM Selection and Updates

## Topics Covered

- The DOM as a tree of nodes
- `getElementById`, `querySelector`, `querySelectorAll`
- Live `HTMLCollection` against static `NodeList`
- `textContent`, `innerText` and why not `innerHTML`
- `createElement`, `append` and `appendChild`
- `<template>` and `cloneNode`
- `DocumentFragment` and batching
- `replaceChildren` and `remove`
- `classList` and `dataset`
- Attributes against properties
- Traversal: `parentElement`, `children`, `closest`
- Rendering a view as a function of data

## Practical Work

First day of Week 4, so the language work from Week 3 finally meets the browser.

I built the rendering half of an expense tracker: `app.js` takes the expense
array from the Day 15 analyzer and builds the summary tiles and the expense list
in the page. The HTML file contains no expense markup at all — only two empty
containers and two `<template>` elements.

There are no events yet, since that is Day 17. To be able to see re-rendering
work, I exposed a small `demo` object on `window`, so I can call
`demo.filter("food")` or `demo.clear()` from the console and watch the list
rebuild.

## Selection

| Method | Returns | Notes |
|--------|---------|-------|
| `getElementById` | one element or `null` | fastest, no `#` in the argument |
| `querySelector` | first match or `null` | takes any CSS selector |
| `querySelectorAll` | static `NodeList` | snapshot, taken once |
| `getElementsByTagName` | live `HTMLCollection` | updates itself |

The live against static difference is not a detail:

```js
const live = document.getElementsByTagName("section");    // 2
const staticList = document.querySelectorAll("section");  // 2
page.append(document.createElement("section"));
// live.length is now 3, staticList.length is still 2
```

A live collection keeps re-querying the document. That is why a loop that
removes items while iterating a live collection skips every other item — the
collection shrinks underneath the index. A static `NodeList` cannot do that.

A `NodeList` has `forEach` but no `map` or `filter`, so I spread it into a real
array when I need those:

```js
[...document.querySelectorAll(".panel h2")].map((h) => h.textContent)
```

I select every element once at the top of the file rather than inside the render
function. Each query walks the tree, so re-querying inside a loop is work I am
paying for repeatedly for no reason.

## Writing Text

`textContent` for everything. This is a security decision, not a style one.

```js
description.textContent = expense.description;
```

If a description contained `<img src=x onerror="...">`, `innerHTML` would parse
it as markup and the browser would run the handler. `textContent` treats every
character as text, so there is nothing to run. Any value that came from a user,
a form or an API goes in with `textContent`.

`innerText` is a third option and it is the slow one — it is aware of CSS, so
reading it forces the browser to work out the layout first, and it skips hidden
elements. `textContent` gives what is in the markup, regardless of styling.

## Building Nodes

I used both approaches on purpose so I could compare them.

**`<template>` plus `cloneNode`** for the expense rows:

```js
const row = expenseTemplate.content.cloneNode(true);
```

A `<template>` is parsed but not rendered, and its contents are inert — images
inside it are not fetched and scripts do not run — until they are cloned. The
row markup stays in the HTML file where it belongs, instead of inside a
JavaScript string.

`cloneNode(true)` is a deep copy. With `false`, or no argument, only the outer
node comes back and every child is missing, which took me a few minutes to spot
because there is no error.

**`createElement` plus `append`** for the summary tiles: more lines, but the
structure is visible in the code, which suits small pieces built out of values.

`append` over `appendChild`: it takes several nodes in one call, and it accepts
plain strings as text. `appendChild` takes exactly one node and returns it.

## Batching with a Fragment

```js
const fragment = document.createDocumentFragment();
for (const expense of items) fragment.append(buildExpenseRow(expense));
expenseList.append(fragment);
```

A `DocumentFragment` is an off-screen container. Appending to it costs nothing
because it is not in the document, and appending the fragment moves all its
children in at once — so the browser recalculates layout once rather than once
per row.

The fragment itself is not inserted, only its children, so it is empty
afterwards.

`replaceChildren()` with no arguments empties an element, and with arguments it
clears and refills in one call. It is clearer than `innerHTML = ""` and it does
not go through the HTML parser at all.

## classList and dataset

```js
item.classList.toggle("expense--over", expense.amount >= LARGE_EXPENSE_PAISE);
item.dataset.id = String(expense.id);
```

`classList.toggle` with a second argument adds when the condition is true and
removes when it is false, which replaces an `if`/`else` around `add` and
`remove`.

The bigger rule: **JavaScript toggles classes, CSS decides what they look
like.** Nothing in `app.js` sets a colour or a size. If I want the "large
expense" rows to look different I change the stylesheet, and the JavaScript does
not have to know.

`dataset.id` reads and writes the `data-id` attribute. Day 17 needs it to work
out which row a click came from, because the click will land on the list, not
the row.

## Attributes and Properties

They look like the same thing and they are not:

```js
probe.setAttribute("value", "from the attribute");
probe.value = "changed later";

probe.getAttribute("value");   // "from the attribute"
probe.value;                   // "changed later"
```

The attribute is the initial value written in the markup. The property is the
live state. For an input they separate as soon as the user types, which is why
reading `getAttribute("value")` to find out what someone typed does not work.

Similarly, sizes live on the element rather than in CSS text —
`getBoundingClientRect()` for the real measured box, `getComputedStyle()` for
the value the cascade actually resolved to.

## Traversal

- `parentElement`, `children`, `nextElementSibling` — elements only
- `parentNode`, `childNodes`, `nextSibling` — every node, including text

The whitespace between two tags is a text node, so `childNodes` counts things I
did not write. The element-only versions are almost always what I mean.

`closest(".panel")` walks *up* from an element until something matches. That is
the one I expect to use most on Day 17 — from a clicked button, find the row it
belongs to.

## Render as a Function of Data

The structure I settled on:

```js
function render(items = expenses) {
    renderSummary(items);
    renderList(items);
}
```

Anything that changes the data calls `render()` again. Nothing reaches into the
page and edits a single node.

`demo.dim(3)` deliberately breaks that rule — it adds a class to one row
directly — and the change disappears the next time `render()` runs. That is the
point of having it: once there are two ways for the page to change, the page
stops matching the data, and working out which one won becomes the bug.

This is the idea React is built on, and building it by hand first makes the
reason obvious.

## Accessibility

- The status line has `aria-live="polite"`, so the count is announced when it
  changes without moving focus
- Each panel has `aria-labelledby` pointing at its heading
- The empty state is a real element in the list, not a `display: none` toggle,
  so there is always something to read
- The amount gets an `aria-label`, so it is not announced as a bare number

## What I Learned

A live `HTMLCollection` re-queries the document, so it changes underneath a loop
that is modifying the page. A static `NodeList` is a snapshot.

`textContent` is the safe default, and `innerHTML` on user data is how a script
gets injected.

`cloneNode(true)` for a deep copy — without the `true` the children silently do
not come.

A `DocumentFragment` turns many insertions into one layout recalculation.

`classList.toggle(name, condition)` replaces an if/else, and CSS should own
every appearance decision.

An attribute is the initial value and a property is the live one.

`closest()` walks up the tree, which is the piece event delegation needs.

Re-rendering from data beats editing nodes in place, because two ways of
changing the page means the page can disagree with the data.

## Day 16 Outcome

The expense tracker renders its summary tiles and its full list from a
JavaScript array, using a `<template>` for the row markup, a `DocumentFragment`
for batching, `textContent` everywhere, `classList` and `dataset` for state, and
a single `render()` function that redraws the whole view. The HTML file contains
no expense markup. Filtering and re-rendering can be driven from the console
through `demo` until events arrive on Day 17.
