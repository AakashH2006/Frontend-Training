# Day 7 - Typography, Colour, Spacing and CSS Custom Properties

## Topics Covered

- CSS custom properties (variables)
- `var()` and fallback values
- Scope and inheritance of custom properties
- Type scale
- `rem`, `em`, `px` and `ch` units
- Unitless `line-height`
- Spacing scale
- Colour naming by role
- Focus states and `:focus-visible`
- Reusable utility classes

## Practical Work

Yesterday I wrote a stylesheet full of hard-coded values. Today I turned those
values into a small design system.

I went through Day 6's `styles.css` and pulled out every number and every colour
into a custom property in `:root`. After that I replaced the raw values with
`var()`. There is now no hex code and no pixel value anywhere in the stylesheet
outside the `:root` block.

I also added a "Design Tokens" section to the page that displays the type scale,
the spacing scale and the colour swatches, so I can see the system rather than
just read it in the CSS. That section replaced the box model demo from Day 6,
which had done its job.

## Custom Properties

They are declared with two dashes and read with `var()`:

```css
:root {
    --color-brand: #17457f;
}

.button {
    background-color: var(--color-brand);
}
```

Two things I did not expect:

**They are inherited.** I declared them on `:root` (which is `<html>`), so every
element on the page can see them. They are not global in the way a Sass variable
is global — they cascade like `color` does. That means I could redeclare
`--color-brand` on one section and only that subtree would change.

**They are live.** A Sass variable is replaced at build time and then gone.
A CSS custom property still exists in the browser, so I can change it in DevTools
and watch every element that uses it update at once. I tested this by editing
`--space-3` in the Styles panel and the whole page reflowed.

`var()` also takes a fallback:

```css
padding: var(--space-3, 16px);
```

I did not use fallbacks in this file because every token is declared on `:root`,
so there is nothing to fall back from.

## Naming

I named the colours by their role and not by what they look like:

- `--color-brand` rather than `--color-blue`
- `--color-text-muted` rather than `--color-grey`
- `--color-surface` rather than `--color-white`

If I later decide the brand is green, `--color-blue: green` would be a lie,
but `--color-brand: green` still reads correctly.

## Type Scale

I used six steps with roughly a 1.25 ratio between them:

| Token | Value | Pixels |
|-------|-------|--------|
| `--size-xs` | 0.75rem | 12px |
| `--size-sm` | 0.875rem | 14px |
| `--size-md` | 1rem | 16px |
| `--size-lg` | 1.25rem | 20px |
| `--size-xl` | 1.5rem | 24px |
| `--size-2xl` | 2rem | 32px |

Having a fixed set of sizes means I pick from a list instead of inventing a new
number every time, which is what was happening on Day 6.

### rem vs em vs px

- `px` is a fixed size and ignores the reader's browser font size setting
- `rem` is relative to the root font size, so it scales if the reader changes it
- `em` is relative to the *parent's* font size, so it compounds when nested

The compounding is the trap. If I set `font-size: 0.9em` on a list and that list
contains another list, the inner one becomes `0.81em` without me asking.

I used `rem` for font sizes because a reader who increases their default font
size should get a bigger page. I kept the spacing scale in `px` on purpose,
because I want gaps to stay a fixed size while the text grows.

### Unitless line-height

```css
--leading-body: 1.6;
```

Not `1.6em` and not `26px`. A unitless value is inherited as the *ratio*, so
each child multiplies it by its own font size. If I had written `26px`, my
32px heading would have inherited a 26px line height and the lines would overlap.

### ch for line length

I capped paragraph width with `max-width: 65ch`. `1ch` is the width of the `0`
character in the current font, so this roughly caps a line at 65 characters,
which is the readable range MDN describes. Because it is font-relative, it stays
correct if the font changes.

## Spacing Scale

Six steps, all multiples of 4:

```text
--space-1  4px
--space-2  8px
--space-3  16px
--space-4  24px
--space-5  32px
--space-6  48px
```

Before this I had 12px in some places and 16px in others for no reason.
Now everything lines up because everything comes from the same short list.

## Utility Classes

I added a few small single-purpose classes:

```css
.text-sm     { font-size: var(--size-sm); }
.text-muted  { color: var(--color-text-muted); }
.text-center { text-align: center; }

.stack-sm > * + * { margin-top: var(--space-2); }
.stack-md > * + * { margin-top: var(--space-3); }
```

The `stack` ones use the `> * + *` selector, which matches every direct child
*except the first*. That gives even spacing between children without leaving a
stray margin on the top or bottom of the group. It solves the same problem I was
working around on Day 6 by only ever using `margin-bottom`.

I used the utilities on the tagline and the figure caption instead of writing
new rules for each of them.

I kept the list short on purpose. Utilities are useful for one-off adjustments,
but if I made one for every property I would just be writing inline styles with
extra steps.

## Focus States

I moved focus from `outline` in the brand blue to a separate token:

```css
--color-focus: #b4530a;
```

Using a different colour from the brand means the focus ring stands out against
the buttons and links, which are already brand blue.

`:focus-visible` only applies when the browser thinks the focus should be shown,
which in practice means keyboard focus and not mouse clicks. That is what I want:
tabbing to the button shows the ring, clicking it does not.

I added an `@supports not selector(:focus-visible)` block so older browsers still
get a plain `:focus` outline. The guard means modern browsers skip it entirely
and do not get a double outline.

I checked in DevTools that focus is still visible on every interactive element,
and that no rule anywhere sets `outline: none`.

## Contrast Check

I checked the text colours against their backgrounds using the contrast ratio
shown in the DevTools colour picker.

- `--color-text` on `--color-surface` — well above 4.5:1
- `--color-text-muted` on `--color-surface` — above 4.5:1
- `--color-surface` on `--color-brand` (the button) — above 4.5:1

I had to darken my muted grey from Day 6 to get it over the line. The original
was too light against white.

## What I Learned

Custom properties are not just find-and-replace. They inherit, they can be
scoped to a subtree, and they can be changed at runtime.

A design system is mostly about *removing* choices. Six font sizes and six spacing
values are enough for this whole page, and picking from a short list is faster
than inventing a value each time.

Units carry meaning. `rem` respects the reader's settings, `em` compounds, `ch`
tracks the font, and unitless `line-height` is the only version that survives
being inherited into a different font size.

Naming by role rather than by appearance is what makes the tokens survive a
redesign.

## Day 7 Outcome

The stylesheet is now driven entirely by tokens declared in `:root`.
The page has a consistent type scale, a consistent spacing scale, colours named
by role, checked contrast, a visible keyboard-only focus ring, and a small set of
reusable utility classes. The page displays its own design tokens in a new
section so the system is visible.
