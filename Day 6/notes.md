# Day 6 - Cascade, Selectors and the Box Model

## Topics Covered

- Linking a stylesheet with `<link rel="stylesheet">`
- Type, class and ID selectors
- The cascade
- Specificity
- Inheritance
- The box model
- `content-box` vs `border-box`
- Margin collapsing

## Practical Work

This is the first day of Week 2, so the page finally gets CSS.

I copied Profile v1 forward from Day 5, added class names to the markup and
wrote `styles.css`. I did not change any of the HTML structure, only added
`class` attributes and one new demo section.

I deliberately kept this file to plain selectors and the box model.
Custom properties are Day 7 and Flexbox is Day 8, so I did not use either yet.

## Class Naming

I used descriptive class names instead of styling everything by element:

- `.site-header`, `.site-nav`, `.page`, `.section`, `.site-footer` for layout
- `.card`, `.progress-table`, `.contact-form`, `.field`, `.button` for components
- `.profile__image`, `.profile__caption` for parts of the profile figure

I used the double underscore for parts of a block because I kept seeing that
pattern in real stylesheets and wanted to try it.

I did not use any ID selectors for styling. The IDs on the sections are only
there as link targets for the nav.

## The Cascade

When two rules could apply, the browser decides in this order:

1. Origin and importance (my stylesheet beats the browser default)
2. Specificity
3. Source order — the later rule wins

I tested this by writing two rules for `.button` and swapping their order.
The last one always won, because their specificity was identical.

## Specificity

I checked specificity in DevTools by looking at which declarations were
crossed out in the Styles panel.

| Selector          | Specificity | Notes                      |
|-------------------|-------------|----------------------------|
| `*`               | 0,0,0       | never wins anything        |
| `p`               | 0,0,1       | type selector              |
| `.field`          | 0,1,0       | class beats any type       |
| `.field label`    | 0,1,1       | class + type               |
| `#about`          | 1,0,0       | ID beats any number of classes |

The thing that surprised me is that specificity does not carry.
A selector with ten classes (0,10,0) still loses to a single ID (1,0,0),
because the columns are compared left to right and not added up.

This is why I avoided ID selectors in the stylesheet. Once something is styled
by ID it is very hard to override without another ID or `!important`.

I did not use `!important` anywhere.

## Inheritance

Some properties inherit and some do not.

Inherited: `color`, `font-family`, `font-size`, `line-height`, `text-align`

Not inherited: `border`, `padding`, `margin`, `background-color`, `width`

I found this out the hard way with the form. I set the font on `body` and
expected the inputs to pick it up, but they kept using the browser's own font.
Form controls do not inherit the font by default, so I had to write:

```css
.field input,
.field textarea {
    font-family: inherit;
    font-size: inherit;
}
```

`inherit` as a value forces inheritance even where it does not happen normally.

## The Box Model

Every element is a box made of four layers:

```text
+-----------------------------------+
|            margin                 |
|  +-----------------------------+  |
|  |          border             |  |
|  |  +-----------------------+  |  |
|  |  |       padding         |  |  |
|  |  |  +-----------------+  |  |  |
|  |  |  |    content      |  |  |  |
|  |  |  +-----------------+  |  |  |
|  |  +-----------------------+  |  |
|  +-----------------------------+  |
+-----------------------------------+
```

DevTools draws exactly this diagram in the Computed panel, which made it
much easier to understand than reading about it.

### content-box vs border-box

I built a demo section with two boxes that have identical declarations:

```css
width: 300px;
padding: 20px;
border: 5px solid #1a4d8f;
```

With `box-sizing: content-box` (the browser default), `width` applies to the
content only, so the box actually takes up:

```text
300 + 20 + 20 + 5 + 5 = 350px
```

With `box-sizing: border-box`, `width` includes the padding and the border,
so the box takes up exactly `300px` and the content area shrinks to `250px`.

I confirmed both numbers in the DevTools box model diagram rather than
trusting my own arithmetic.

`border-box` is much easier to reason about, so I set it globally:

```css
html {
    box-sizing: border-box;
}

*,
*::before,
*::after {
    box-sizing: inherit;
}
```

I used `inherit` rather than putting `border-box` directly on `*`, because
this way I can opt one component out later and its children follow it.
That is exactly what I did for the `content-box` demo box.

## Margin Collapsing

Two vertical margins next to each other collapse into one, and the larger
one wins. So a `24px` bottom margin followed by a `16px` top margin gives
`24px` of space, not `40px`.

This only happens vertically, and it does not happen if there is a border or
padding between the two margins.

To avoid fighting this, I only set `margin-bottom` for spacing and never
`margin-top`. That way there is one direction of spacing and no surprises.

## The Reset

I zeroed the browser's default margin and padding on everything:

```css
* {
    margin: 0;
    padding: 0;
}
```

This caught me out twice:

1. My `<ul>` lost its indentation and the bullets sat outside the box,
   so I had to put `padding-left: 24px` back on `.topic-list`.
2. Headings and paragraphs lost all their spacing, so I added
   `margin-bottom` back deliberately instead of relying on the defaults.

That is the trade-off with a reset: I get consistent spacing, but I have to
be explicit about every value.

## Accessibility Follow-Up

Now that I have CSS I improved the skip link from Day 5.

It is moved off screen with `position: absolute; left: -9999px;` and comes back
with `position: static` when it is focused, so keyboard users can still reach it
but it no longer sits visibly at the top of the page.

I also added `:focus-visible` styles with an `outline` and `outline-offset`
so focus stays clearly visible now that I am changing colours.

I did not use `outline: none` anywhere.

## What I Learned

The cascade is not random. Origin, then specificity, then source order.
Once I knew the order, DevTools crossing out a declaration made sense.

Specificity columns are compared, not added. Classes never catch up to an ID.

`border-box` should be the default I reach for, because `width` then means the
width I actually see on screen.

A reset removes problems and creates new ones. Every default I remove is a value
I now have to set myself.

Form controls are the odd ones out. They do not inherit fonts and need to be
told explicitly.

## Day 6 Outcome

The profile page is styled with a class-based stylesheet, uses `border-box`
globally, has a working box model demo, consistent spacing from a single
margin direction, and visible focus states.
