# Day 5 - Accessibility Pass and Weekly Build

## Topics Covered

- Keyboard accessibility
- Tab order and focus
- Skip links
- Correct heading order
- Accessible table markup
- Labels and form accessibility
- Meaningful link text
- Meaningful alt text
- Landmarks (`<header>`, `<nav>`, `<main>`, `<footer>`)

## Practical Work

Day 5 was a review day rather than a new-feature day.

I went back through everything I built in Days 1 to 4 and fixed the accessibility
problems I found, then finished Profile v1 and wrote the README for Week 1.

## Problems I Found and Fixed

### 1. The image was outside every landmark

In Day 3 I put the `<figure>` before `<header>`, so it was not inside any landmark.
I moved it inside `<header>` where it belongs.

### 2. A paragraph was nested inside another paragraph

In the "My Goal" section I had written a `<p>` inside another `<p>`.
The browser silently closed the first paragraph, so my markup did not match what
I actually saw in the DOM. I checked this in DevTools and split it into two
separate paragraphs.

### 3. The contact section was outside `<main>`

The Day 4 contact form was placed after the closing `</main>` tag.
I moved the whole section back inside `<main>`.

### 4. Heading order skipped levels

The table and the list appeared with no heading above them.
I added `<h3>` headings so the page reads h1 → h2 → h3 without jumping levels.

### 5. The nav was a row of bare links

The links were sitting directly inside `<nav>` with no structure.
I wrapped them in a `<ul>` and `<li>` list and added `aria-label` to the `<nav>`
so screen reader users are told what the navigation is for.

### 6. The table had no caption and no scope

My Day 3 table used `<th>` only in the first row and had no caption.
I added:

- `<caption>` to describe the table
- `<thead>` and `<tbody>`
- `scope="col"` on the column headers
- `scope="row"` on the technology name in each row

### 7. Form inputs had no `name` attribute

Every input had an `id` but no `name`. Without `name` the value is not submitted.
I added `name` to all five controls and `autocomplete` where the browser can help.

### 8. The footer still said "Day 1"

Fixed to say "Profile v1".

## Skip Link

I added a skip link as the first element in the `<body>`:

```html
<a href="#main-content">Skip to main content</a>
```

`<main>` now has `id="main-content"`.

Without CSS the link is visible all the time, which is fine for now.
When I start CSS in Week 2 I plan to hide it visually until it receives focus.

## Keyboard Testing

I tested the page using only the keyboard.

- `Tab` moves forward through interactive elements
- `Shift + Tab` moves backward
- `Enter` activates links and the submit button
- `Space` scrolls the page

Tab order I observed:

1. Skip to main content
2. About Me
3. What I'm Learning
4. My Goal
5. Contact Me
6. Name
7. Email
8. Age
9. Phone
10. Message
11. Send message

The order follows the visual order of the page, which is what I wanted.
I did not need `tabindex` anywhere.

I also submitted the form using only the keyboard and the native validation
messages still appeared correctly.

## Link Text

I checked that no link says "click here" or "read more".
Every link in the nav describes the section it goes to.

## Alt Text

I changed the image alt text from `"Aakash Marigeri"` to
`"Portrait photo of Aakash Marigeri"` so it describes what the image actually is.

## What I Learned

Accessibility is mostly about using the right element rather than adding extra
attributes on top of the wrong one.

Landmarks like `<header>`, `<nav>`, `<main>` and `<footer>` let assistive
technology jump around the page, so content that sits outside all of them is
harder to reach.

Heading levels are a structure, not a font size. Skipping from `<h2>` to nothing
makes the page harder to navigate even though it looks fine.

A form control needs both `id` (to link the label) and `name` (to submit the value).
They do different jobs and I had been treating them as the same thing.

Keyboard testing is the quickest accessibility check I can do, because I do not
need any extra tool for it.

## Day 5 Outcome

Profile v1 is finished.

The page has valid semantic HTML, correct heading order, landmark regions,
an accessible table, a keyboard-usable form with labels and native validation,
meaningful alt and link text, and a skip link.

Week 1 README is written.
