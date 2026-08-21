# Week 1 — HTML, Semantics and Accessibility

Profile / Portfolio v1, built with HTML only. No CSS and no JavaScript.

## What this is

A single-page profile site for my front-end internship. Everything on the page is
plain semantic HTML, so it is readable and usable before any styling exists.

The finished page for the week is:

`Day 5/Accessibility and Weekly Build/index.html`

## How to run it

No build step and no dependencies.

1. Clone or download this repository.
2. Open `Day 5/Accessibility and Weekly Build/index.html` in any browser.

Double-clicking the file works. If I want it served over HTTP instead
(so the Network panel shows a real request), I run this from the folder:

```bash
python -m http.server 8000
```

and open `http://localhost:8000`.

## Folder layout

```text
Day 1/Web Foundations/       index.html, notes.md  - first page, DevTools checklist
Day 2/                       notes.md              - semantic structure
Day 3/Images, Tables and Metadata/                 - image, figure, table, metadata
Day 4/                       notes.md              - contact form and validation
Day 5/Accessibility and Weekly Build/              - accessibility pass, Profile v1
```

Each day keeps its own snapshot of the page, so I can see how the markup
changed from day to day.

## What the page contains

- Landmarks: `<header>`, `<nav>`, `<main>`, `<footer>`
- Sections for About, Learning, Goal and Contact
- An `<article>` inside the Learning section
- A profile image in `<figure>` with `<figcaption>` and descriptive `alt`
- A data table with `<caption>`, `<thead>`, `<tbody>` and `scope` on headers
- A contact form with labels, correct input types and native validation
- A skip link to `<main>`

## What I learned this week

- The difference between structural markup and `div`-only markup, and why
  semantic elements matter for assistive technology.
- How `alt` text, `<figure>` and `<figcaption>` each play a different role.
- How to build a table that is understandable without looking at it.
- How HTML validates form input on its own with `required`, `type`,
  `min`, `max` and `pattern`, before any JavaScript is involved.
- That heading order is a document outline, not a size choice.
- How to keyboard-test a page and read the tab order.

I also learned the request/response basics in DevTools: the browser sends a
`GET` for `index.html` and the server replies `200 OK`.

## Accessibility checks I ran

- Tabbed through the whole page and confirmed the order matches the visual order
- Submitted the form with keyboard only
- Checked no link text is vague
- Checked heading levels do not skip
- Confirmed every input has a label associated with `for` and `id`

## Next week

Week 2 is CSS: cascade and box model, a small design system with custom
properties, Flexbox, Grid, and a responsive Portfolio v2.
