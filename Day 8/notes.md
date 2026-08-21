# Day 8 - Flexbox

## Topics Covered

- `display: flex`
- Main axis and cross axis
- `flex-direction`
- `justify-content`
- `align-items`
- `flex-wrap`
- `gap`
- `flex-grow`, `flex-shrink`, `flex-basis`
- The `flex` shorthand
- Auto margins in a flex container
- `min-width: 0` and flex overflow

## Practical Work

I used Flexbox in four places today:

1. The site header — photo and text side by side, stacking when narrow
2. The navigation — a row of links with `gap`
3. Two card rows — course topics and a new Projects section
4. The contact form — aligned controls with age and phone side by side

I removed the Design Tokens section from Day 7, since it had done its job as an
exercise, and added a Projects section in its place so I had a proper card row to
build.

All the tokens from Day 7 are carried forward unchanged. I did not add any new
colours or sizes today, which was a good sign that the scale is working.

## Main Axis and Cross Axis

This is the part I kept getting wrong at first.

Flexbox has two axes and everything is named relative to them, not relative to
the screen:

- The **main axis** runs in the direction of `flex-direction`
- The **cross axis** runs perpendicular to it

With the default `flex-direction: row`:

- main axis = left to right, controlled by `justify-content`
- cross axis = top to bottom, controlled by `align-items`

With `flex-direction: column` those swap. `justify-content` now controls vertical
position and `align-items` controls horizontal.

So `justify-content` does not mean "horizontal". It means "along the main axis".
Once I stopped thinking in horizontal and vertical, the property names stopped
feeling arbitrary.

## gap

On Day 6 I spaced the nav links with `margin-right: 16px` on every `<li>`,
which left a stray 16px hanging off the last one.

`gap` only puts space *between* items, so that problem disappears:

```css
.nav-list {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2) var(--space-4);
}
```

The two-value form is `row-gap column-gap`, so the wrapped rows get 8px between
them and the links get 24px between them.

## The flex Shorthand

`flex` is three properties in one:

```css
flex: <grow> <shrink> <basis>;
```

- **grow** — how much of the leftover space this item takes. `0` means none.
- **shrink** — how much it gives up when there is not enough room. `0` means none.
- **basis** — the size the item asks for before growing or shrinking.

The ones I used:

```css
.profile          { flex: 0 0 auto;   }  /* photo keeps its natural size */
.site-header__text{ flex: 1 1 260px;  }  /* text absorbs the leftover space */
.card-row__item   { flex: 1 1 220px;  }  /* equal cards, min ideal width 220px */
```

`flex-basis` is the useful one. It is the size the item *wants*, not a hard limit.
Setting `flex: 1 1 220px` on the cards means the browser fits as many 220px cards
per row as it can, then grows them to fill the row exactly.

That gives me a responsive card grid with no media query at all. On a wide window
I get four topic cards per row, on a narrow one I get one. The breakpoint is
decided by the content rather than by a number I guessed.

I tested this by dragging the window from full width down to about 320px.

## Auto Margins

The trick I liked most today.

The project cards have descriptions of different lengths, but I wanted the
"Week 2 — in progress" line to sit at the bottom of every card so they line up.

```css
.project-card {
    display: flex;
    flex-direction: column;
}

.project-card__meta {
    margin-top: auto;
}
```

A flex item is itself a flex container if I say so, so each card becomes a column.
An `auto` margin on the main axis absorbs *all* the free space, which pushes the
element to the far end. In a column that means the bottom.

The same trick works horizontally — `margin-left: auto` on one item in a row
pushes it to the right and leaves everything else where it is. That is often
better than `justify-content: space-between` when only one item needs moving.

I also used `align-items: center` on the header so the round photo lines up with
the middle of the text block instead of stretching to the full row height.
The default is `stretch`, which is why my figure was full height before I changed it.

## The Overflow Bug

Putting age and phone side by side broke the layout at first. The row pushed past
the right edge of the fieldset and the whole page scrolled sideways.

The cause is that a flex item has an implicit `min-width: auto`, which means it
refuses to shrink below the intrinsic width of its content. The number input has
a default size plus spinner buttons, so it would not go small enough.

The fix:

```css
.field-row .field {
    flex: 1 1 180px;
    min-width: 0;
}
```

`min-width: 0` lets the item shrink properly. I would not have found this without
DevTools, because the computed value shows `auto` even though I never wrote it.

## Form Alignment

I converted each `.field` into a column flex container:

```css
.field {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
}
```

That replaced `display: block` on the label plus a `margin-bottom`. One rule now
handles both the stacking and the spacing.

The buttons are in a `.form-actions` row with `justify-content: flex-end`, so
Clear and Send sit on the right with a gap between them and wrap on narrow screens.

I checked that the tab order is still correct after all of this. Flexbox changes
the *visual* order only if I use `order` or `row-reverse`. I did not use either,
because that would make the visual order and the DOM order disagree and confuse
anyone navigating by keyboard.

## When Not To Use Flexbox

Flexbox is one-dimensional. It lays things out in a row *or* a column, and each
row is laid out independently of the others.

That is why the wrapped card rows do not line up in columns — the last row has
three cards and they stretch differently from the row above. If I needed the
columns to line up across rows, that is a job for Grid, which is Day 9.

I left the cards as they are for now, since Flexbox filling the row is exactly
what I wanted here.

## What I Learned

Main axis and cross axis, not horizontal and vertical. The property names only
make sense once the axes are the mental model.

`flex-basis` with `flex-wrap` gives responsive behaviour without media queries,
and the result is driven by content instead of by guessed breakpoints.

`gap` is the right tool for spacing between items and margins are the wrong one.

Auto margins in a flex container are a positioning tool, not just spacing.

`min-width: 0` is the fix for a flex item that refuses to shrink. This is not
obvious, because the `auto` value is never something I wrote.

Never reorder flex items visually if it breaks the tab order.

## Day 8 Outcome

The header, navigation, two card rows, the form fields and the footer are all
laid out with Flexbox. The card rows reflow from four columns to one with no
media query. The form has side-by-side controls that stack cleanly, right-aligned
actions and no horizontal overflow. Tab order still matches the visual order.
