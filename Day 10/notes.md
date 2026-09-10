# Day 10 - Responsive Design and Weekly Build

## Topics Covered

- The viewport meta tag
- Mobile-first CSS
- `@media` and `min-width` queries
- Choosing breakpoints from content
- Fluid widths and `max-width`
- `clamp()` for fluid type
- `min()` inside `minmax()`
- Responsive images: `srcset` and `sizes`
- Intrinsic `width` and `height` attributes and layout shift
- Touch target size
- Testing at real viewport sizes

## Practical Work

Last day of Week 2, so this was a build day rather than a new-feature day.

I rewrote `styles.css` mobile first, added two breakpoints, made the images
responsive, removed the Grid Tracks demo section from Day 9 now that it has done
its job, and shipped Portfolio v2. I also wrote the Week 2 README.

The HTML barely changed. The only structural edits were the `srcset` on the
photo, a scroll container around the table, two more table rows and the demo
section coming out. All the responsive work is in the stylesheet, which is the
point.

## The Viewport Meta Tag

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0">
```

This has been in my `<head>` since Day 1 and I had never thought about it.

Without it a phone browser pretends to be about 980px wide and then shrinks the
whole rendered page to fit, so a media query for 640px never matches on a 390px
phone. `width=device-width` tells the browser to use the real device width, and
that is what makes every media query below work at all.

## Mobile First

Day 9's stylesheet was written desktop first without me deciding to do that —
I just wrote what looked right in my own window and would have had to undo it
later with `max-width` queries.

Today I flipped it. The base styles are now the phone layout, and every media
query is `min-width`.

The rule I followed: **a breakpoint only adds, it never undoes.**

That means each block in section 12 is something the layout gains once there is
room for it — a row instead of a column, more padding, a wider photo. I never
have to read two rules and work out which one wins, because the small screen
version is simply the one at the top.

Writing it this way also caught a few things I had never given the small screen:

- the header photo was 160px with 24px page padding, which is a lot of a 320px
  screen spent on a photo, so it starts at 112px now
- the nav links had 4px of vertical padding, making a 24px tall touch target
- the Clear and Send buttons were 100px wide targets side by side

## Choosing Breakpoints

I did not look up device sizes. I dragged the window narrow and watched for the
two points where the layout stopped looking right:

| Width | What broke | What the breakpoint does |
|-------|-----------|--------------------------|
| ~640px | The header row squeezed the text column too far | Header becomes a row, photo grows, buttons go side by side |
| ~1024px | Nothing broke, spacing just felt tight | More page padding and a wider grid gap |

So there are two breakpoints, `40em` and `64em`, and both came from my own
content rather than from a phone model. The second one only changes spacing,
which felt like the right amount of change for a "nothing was broken" breakpoint.

I used `em` in the query rather than `px`. In a media query `em` is always
relative to the browser's default font size and ignores any `font-size` I set,
so a reader who has increased their default gets the wider layout slightly
earlier — which is what they want, since their text is bigger too.

### Custom properties do not work in media queries

I tried this first:

```css
:root { --bp-md: 40em; }

@media (min-width: var(--bp-md)) { ... }   /* does nothing */
```

The query is simply ignored, with no error anywhere. Media query conditions are
evaluated before the cascade decides any element's custom properties, so there
is no element to read the value from.

I left the two values in a comment block in `:root` so they are documented in
one place, and wrote the numbers out literally in section 12.

## Fluid Before Breakpoints

The thing I got wrong at first was reaching for a media query for everything.

Most of the page never needed one:

- `.page` has a `max-width` and no `width`, so it is already fluid
- the card grids use `auto-fit` and `minmax()` from Day 9, so the column count
  already follows the width
- `65ch` already caps paragraph line length at every size

A breakpoint is for a change of *arrangement*. Sizes should be fluid on their own
wherever possible.

### clamp() for type

```css
--size-2xl: clamp(1.5rem, 1.15rem + 1.8vw, 2rem);
```

Three parts: minimum, preferred, maximum. The heading is 24px on a small phone,
grows with the viewport, and stops at 32px.

The preferred value has to include a `rem` term and not just `vw`. With `2vw`
alone, a reader who doubles their default font size gets no benefit at all,
because `vw` does not know anything about font size. Mixing them keeps the
zoom working.

I only used `clamp()` on the three heading steps. Body text stays at `1rem`,
because it should follow the reader's setting and not the window.

### min() inside minmax()

Day 9 left a hole that only shows on a very narrow screen:

```css
grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
```

If the container is narrower than 220px, the track still demands 220px and the
grid overflows. The guard is one function:

```css
grid-template-columns: repeat(auto-fit, minmax(min(220px, 100%), 1fr));
```

`min(220px, 100%)` is "220px, unless that is more than the container, in which
case the container". No media query needed.

## Responsive Images

The photo was a 793px wide PNG being displayed at 160px. Every visitor,
including one on a phone, was downloading about 520KB to show a 160px circle.

I exported two smaller copies and described them to the browser:

```html
<img src="assets/profiles-320.png"
     srcset="assets/profiles-160.png 160w,
             assets/profiles-320.png 320w,
             assets/profiles.png     793w"
     sizes="(min-width: 40em) 160px, 112px"
     alt="Portrait photo of Aakash Marigeri"
     width="160" height="163">
```

- `srcset` lists the files with their real pixel widths using the `w` descriptor
- `sizes` tells the browser how wide the image will be *laid out*, per media
  condition, so it can choose before the CSS has even been parsed
- `src` stays as a fallback for a browser that ignores `srcset`

The browser picks a candidate by multiplying the layout width by the device
pixel ratio. My screen reports a ratio of 1.25, so a 112px layout on a phone
width wants about 140px and it takes the 160w file — 42KB instead of the 520KB
original.

Two things I only learned by actually checking rather than reasoning about it:

- **The choice is the browser's, not mine.** `srcset` and `sizes` are
  information, not instructions. Testing at a desktop width, where 160px at 1.25
  wants 200px, I expected the 320w file and got the 160w one again — because it
  was already in the cache and the browser decided a cached candidate was worth
  more than a closer match. That is allowed, and it is the right call.
- **`sizes` is a promise I make and nothing checks it.** If it disagrees with
  the CSS, the browser downloads the wrong file and nothing warns me. The 112px
  and 160px in `sizes` have to match the two CSS widths, so I put a comment on
  the CSS rule saying so.

I confirmed both in the Network panel and by reading `img.currentSrc`, which
reports the candidate that was actually chosen.

### width and height are not layout sizes

I put `width="160" height="163"` back on the tag even though CSS sets the width.

Those attributes give the browser the aspect ratio before the image has
downloaded, so it can reserve the right amount of space instead of collapsing to
zero and then shoving the page down when the image arrives. That jump is
cumulative layout shift, and this is the cheapest fix for it.

The CSS still wins for the actual size, because of this in the reset:

```css
img {
    max-width: 100%;
    height: auto;
}
```

`height: auto` is the important half. Without it the `height="163"` attribute
would fight the CSS width and squash the picture.

## The Table

A table is the one thing on the page that genuinely cannot always fit. Three
columns of real words do not work at 320px.

Rather than let it push the whole page sideways I gave it its own scroll box:

```css
.table-scroll { overflow-x: auto; }
.progress-table { min-width: 380px; }
```

A scroll container is only reachable with a mouse or a finger by default, so a
keyboard user cannot scroll it. Adding `tabindex="0"` makes it focusable and
therefore scrollable with the arrow keys, and because it is now a focus stop it
needs a name, which is what the `role="region"` and `aria-label` are for.

## The 16px Input Rule

I had `font-size: inherit` on the inputs, which resolved to 16px anyway, but I
made it explicit and wrote down why:

iOS Safari zooms the page in when a focused form control has text smaller than
16px, and it does not zoom back out when the field is blurred. So the user taps
"Name", the whole page jumps to 130%, and it stays there. The fix is simply
never to let form control text drop below 16px.

## Testing

I used the DevTools device toolbar and checked the widths I care about:

| Width | Device it stands in for | Result |
|-------|------------------------|--------|
| 320px | Smallest phone still worth supporting | No sideways scroll, one column |
| 390px | Common modern phone | One column, header stacked |
| 640px | Breakpoint edge | Header flips to a row |
| 768px | Tablet portrait | Two gallery columns, featured spans both |
| 1024px | Small laptop | Wider spacing, three columns |
| 1440px | Desktop | Page capped at 900px and centred |

At each one I checked the same three things:

1. `document.documentElement.scrollWidth` is not greater than `clientWidth`,
   which is the check for accidental horizontal scrolling
2. Nothing overlaps or gets clipped
3. Tab order still matches the visual order

I also zoomed the browser to 200% at 1280px, which is roughly the same as a
640px viewport, and the layout held because the `em` breakpoints respond to it.

## Accessibility Follow-Up

- Touch targets: nav links are about 40px tall now, buttons about 48px
- The scroll container is keyboard reachable and named
- Focus ring on the scroll container as well, since it is now a focus stop
- I checked focus is never hidden by a breakpoint change
- No `max-width` query anywhere, so nothing is hidden on small screens that is
  available on large ones

## What I Learned

Mobile first is not about phones. It is about writing the simplest layout first
and adding to it, so no rule ever has to undo another one.

Breakpoints belong to the content. I found mine by resizing until something
looked wrong, not by listing devices.

Most responsiveness should not be a breakpoint at all. `max-width`, `minmax()`,
`clamp()`, `ch` and `min()` cover far more than I expected, and each one is a
single declaration instead of a whole block.

Custom properties are useless inside a media query condition, and they fail
silently, which is the worst way to fail.

`srcset` and `sizes` are two different jobs — which files exist, and how big the
image will be on screen — and the browser needs both to make a good choice.

`width` and `height` on an `<img>` are about reserving space, not about sizing.

## Day 10 Outcome

Portfolio v2 is finished.

The stylesheet is mobile first with two `min-width` breakpoints derived from the
content, fluid type with `clamp()`, fluid layout with `max-width`, `minmax()`
and `min()`, and responsive images with `srcset` and `sizes`. There is no
horizontal scrolling at any width from 320px up, the table scrolls in its own
keyboard-reachable container, touch targets are large enough, and focus is
visible everywhere.

Week 2 README is written. Week 3 is JavaScript.
