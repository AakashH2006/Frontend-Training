# Day 9 - CSS Grid

## Topics Covered

- `display: grid`
- Explicit tracks with `grid-template-columns` and `grid-template-rows`
- `repeat()`
- `minmax()`
- `auto-fit` and `auto-fill`
- The `fr` unit
- Grid lines and `span`
- Implicit tracks and `grid-auto-rows`
- `gap` on a grid
- `place-items`
- Choosing between Grid and Flexbox

## Practical Work

Day 8 ended with an open problem. The wrapped Flexbox card rows did not line up
in columns, because each wrapped line is sized independently of the ones above
it. Grid is the fix, so today I converted the card rows.

What changed:

1. `.card-row` became `.card-grid` — the topic cards are now a grid
2. The Projects section became a `.gallery` grid with equal row heights
3. A new Grid Tracks demo section replaces the paragraph of Flexbox notes
4. The header, the navigation, the form and the footer stayed Flexbox

Nothing about the tokens changed again today. Two more layout systems have gone
in and the scale from Day 7 has still not needed a new value.

## Rows and Columns at the Same Time

Flexbox lays out one row or one column and each wrapped line is on its own.
Grid lays out both directions at once, and every item is placed on tracks that
are shared by the whole container.

That single difference explains everything I ran into today. The cards line up
across rows now because they are on the same column tracks, not because I set a
width on them.

## fr and minmax

`fr` is a fraction of the *leftover* space, taken after gaps and fixed sizes are
subtracted. Three `1fr` columns with a 16px gap are not "a third each" — they are
a third each of what is left after the two gaps.

That is why `gap` on Grid never causes overflow, and why my old
`width: 33%` plus a margin approach always did.

`minmax(220px, 1fr)` gives a track a floor and a ceiling:

- it never gets narrower than 220px
- above that it flexes to take an equal share

Both halves matter. `minmax()` is what makes a flexible track safe.

## auto-fit vs auto-fill

```css
grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
```

`repeat()` with a number is just shorthand. With `auto-fit` or `auto-fill` the
browser works out the count itself from the available width.

The difference only shows when there are fewer items than fit:

- `auto-fill` keeps the empty tracks, so three cards in a four-column-wide
  container stay a third of the width each and leave a gap on the right
- `auto-fit` collapses the empty tracks to zero, so the three cards stretch and
  fill the row

I tried both in DevTools with the grid overlay turned on, which draws the track
lines including the empty ones. `auto-fill` was clearly leaving a fourth track.
I chose `auto-fit`, because I want the cards to fill the row rather than leave a
hole.

This gives me a responsive layout with no media query at all, in the same way
`flex-basis` did on Day 8, but this time the columns line up.

## The Span Bug

I wanted the first project card to be a featured card, twice as wide as the rest:

```css
.project-card--featured {
    grid-column: span 2;
}
```

On a wide window it looked right. At about 400px the page started scrolling
sideways.

The cause is that `auto-fit` had dropped the grid to a single column, but the
item still asked for two. Grid does not refuse — it creates the second column
*implicitly*, outside the explicit track list, and that extra column pushed past
the container.

I could see it in the DevTools grid overlay: the numbered line at the right edge
was outside the section border.

The proper fix is a media query, so that the span only applies once there are at
least two columns to span. Media queries are Day 10, so rather than borrow them
early I made the featured card span two **rows** instead:

```css
.project-card--featured {
    grid-row: span 2;
}
```

A row span cannot overflow horizontally, and it still makes the card stand out.
The demo grid keeps the column span, because that grid has a fixed four columns
at every width, so the span can never exceed the track count there.

## Implicit Tracks

I only ever declared columns. The rows were all implicit, created by the browser
as items needed them.

Implicit rows are sized `auto` by default, which means each row is as tall as its
tallest item. That is why my gallery rows were different heights at first.

```css
grid-auto-rows: 1fr;
```

`grid-auto-rows` sets the size of every implicit row, so now every row is the
same height and the cards line up in both directions. This is the exact thing
Flexbox could not do yesterday.

## minmax(0, 1fr)

The four-column demo grid overflowed at narrow widths until I wrote:

```css
grid-template-columns: repeat(4, minmax(0, 1fr));
```

`1fr` is really `minmax(auto, 1fr)`, and that `auto` minimum means the track will
not shrink below the intrinsic width of its content. A long unbroken label was
holding the track open.

This is the same trap as `min-width: 0` on a flex item from Day 8. Both are a
default minimum I never wrote, and in both cases the fix is to say zero out loud.

## place-items

Centring the demo cell text turned out to be one declaration:

```css
.track-demo__cell {
    display: grid;
    place-items: center;
}
```

`place-items` is shorthand for `align-items` (block axis) and `justify-items`
(inline axis). A one-item grid with `place-items: center` is the shortest
centring I have written so far — no wrapper, no absolute positioning, no
`line-height` trick.

`justify-items` has no Flexbox equivalent, because a flex line has no cross-axis
tracks to justify inside.

## Grid or Flexbox

I did not convert everything, and that was deliberate.

| Layout | System | Why |
|--------|--------|-----|
| Site header | Flexbox | Photo is content-sized, text absorbs the rest |
| Navigation | Flexbox | One wrapping line of links |
| Topic cards | Grid | Equal columns that must line up |
| Project gallery | Grid | Two dimensions plus a spanning item |
| Form fields | Flexbox | Stacked label and control |
| Footer | Flexbox | Two items pushed apart on one axis |

The rule I settled on: if the items must line up with the items in the *other*
rows, it is Grid. If each line only has to look right on its own, Flexbox is
simpler and I do not have to declare tracks.

Grid is also the only one of the two where I place items into a layout I defined
first. Flexbox distributes items into space the content produces.

## DevTools

The grid overlay in the Layout panel was the most useful part of today. It draws
the line numbers, the track sizes and the gaps directly on the page.

Two things I only understood because I could see them:

- the implicit column created by my `span 2` bug
- the empty track that `auto-fill` keeps and `auto-fit` collapses

## Accessibility Check

Grid can move items anywhere on the page, which makes it very easy to break the
tab order. `grid-row`, `grid-column`, `order` and `dense` packing all change the
visual order only — the DOM order and therefore the tab order stay the same.

I re-tabbed the whole page after the conversion. The order still matches the
visual order, because the only placement I used is a row span on the first card,
which does not move any card past another one.

I also kept the gallery as a `<ul>` of `<li>`. Setting `display: grid` on a list
removes the list semantics in some browsers, so if I ever need it announced as a
list I will have to add `role="list"` back. I noted this rather than fixed it,
since nothing here depends on the list semantics.

## What I Learned

Grid places items on tracks that the whole container shares. That one fact is
what makes cards line up across rows, and it is the difference from Flexbox.

`fr` divides the space that is left over, so gaps come out of the total before
the fractions are worked out.

`auto-fit` collapses empty tracks and `auto-fill` keeps them. Both give a
responsive layout without a media query.

An item that spans more tracks than exist does not fail — it creates implicit
tracks and overflows, which is worse than failing.

`minmax(0, 1fr)` is the Grid version of `min-width: 0`. Both fix an automatic
minimum size I never asked for.

Grid and Flexbox are not competitors. One page can use both, and choosing which
one per component is easier than forcing one to do everything.

## Day 9 Outcome

The topic cards and the project gallery are laid out with CSS Grid using
`repeat(auto-fit, minmax())`, so the number of columns follows the available
width with no media query, and the rows are equal height so the cards line up in
both directions. A Grid Tracks demo section shows explicit tracks, spanning and
intrinsic sizing. The header, navigation, form and footer remain Flexbox, chosen
per component. No horizontal overflow at any width down to 320px, and the tab
order is unchanged.
