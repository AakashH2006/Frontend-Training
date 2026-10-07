# Day 27 - Props, composition, conditions and lists

## Topics Covered

- Typed props, required against optional, and defaults in the signature
- `ComponentProps<"button">` — extending a native element's props
- `Omit` on a props type, to take a decision away from the caller
- Prop spreading, and where it is right and wrong
- Composition: `children`, and a named second slot
- Discriminated-union props, so illegal prop combinations stop compiling
- `ReadonlySet` as a prop type, and why it is not an array
- Conditional rendering: early return, ternary, `&&`, `null`
- The literal-`0` trap, rendered on the page
- Lists with stable keys, and keyed fragments

## Practical Work

Eight components, no state. Every handler logs and does nothing else — passing
a function as a prop is a props lesson; what the function does is Day 28's.

```text
src/components/Button.tsx        extends the native <button> props
src/components/Badge.tsx         Status -> class, written once
src/components/Stat.tsx          one figure with a label
src/components/EmptyState.tsx    the empty case, with an optional hint
src/components/Panel.tsx         children + a named `actions` slot
src/components/BookCard.tsx      union props: result card or saved card
src/components/BookList.tsx      the same union, one level up
src/components/ConditionalUI.tsx the four conditional forms, side by side
```

```text
App
├── Panel "Search results"   actions={<Button/>}
│   └── BookList variant="result"  -> BookCard -> Badge, Button
├── Panel "Your list"
│   ├── SummaryBar -> Stat
│   └── BookList variant="saved"
├── Panel "Conditional rendering" -> ConditionalUI
└── Panel "The empty case"        -> BookList with []
```

That last panel is there on purpose. Day 18's rule: a path that is never
exercised is a path that does not work, so the empty branch is on the page
rather than only in the code.

## Extending a Native Element

The pattern I came in wanting, and it is better than I expected.

```tsx
interface ButtonProps extends Omit<ComponentProps<"button">, "className"> {
    readonly variant?: Variant;
    readonly small?: boolean;
}
```

`ComponentProps<"button">` is **every** prop React accepts on a `<button>` —
the whole DOM event set, `disabled`, `type`, every `aria-*`. Extending it means
the component inherits all of them, instead of me declaring the four I happen
to need today and discovering the fifth is missing on Day 30.

`Omit<..., "className">` is the deliberate part. `className` is computed here
from the variant, so letting a caller pass one too would mean two things
deciding the same attribute. Removing it from the type makes that a compile
error rather than a silent override.

### The default that prevents a real bug

```tsx
export function Button({ variant = "primary", small = false, type = "button", ...rest }: ButtonProps) {
```

A `<button>` inside a `<form>` defaults to `type="submit"`. So a "Remove"
button inside a form submits the form — which is a bug Week 4 avoided by
writing `type="button"` on every single button by hand, in the markup, eleven
times.

Here it is the default, and a caller has to ask for `"submit"` explicitly. I
checked it holds: every button on the rendered page reports `type="button"`.

### Spread order

```tsx
return <button type={type} className={className} {...rest} />;
```

`{...rest}` last. Props apply left to right, so anything in `rest` overrides
what came before it — and `className` cannot be in `rest` at all, because the
type removed it.

Spreading is worth being careful with: it is convenient precisely because it
hides what is being passed. It is right here, where forwarding native props is
the entire job, and wrong on a domain component, where it turns a typo into a
silently-ignored attribute.

## Composition: a Second Slot

The thing I actually learned today.

A panel sometimes needs controls beside its heading. Three options:

1. **A pile of props** — `showClearButton`, `onClear`, `clearLabel`. The panel
   ends up knowing about every control any caller might want, and every new one
   is a new prop and a new branch.
2. **One `actions` prop typed `ReactNode`.** The panel places it and knows
   nothing about it.
3. **Two sets of children** — which JSX cannot express. There is one `children`.

```tsx
<Panel
    title="Search results"
    actions={<Button variant="quiet" small onClick={...}>Clear</Button>}
>
```

Option 2, and the insight behind it is small and load-bearing: **an element is
just a value**, so it can be held in a prop. `actions` is a second children
slot with a name. The panel gained a button without gaining a single prop about
buttons.

## Union Props

The best thing in the day, and it came out of getting it wrong first.

`BookCard` appears in two places: in results, where the action is "Save", and
in the saved list, where it is "Remove". My first version had both as optional:

```tsx
onSave?: (id: string) => void;
onRemove?: (id: string) => void;
saved?: boolean;
```

That allows all four combinations — including neither (a card with no action)
and both (a card with two buttons). Two of the four are nonsense and nothing
stopped me writing them. It also meant `props.onSave?.(book.id)` at the call
site, with a `?.` standing in for a question the component could not answer.

```tsx
type BookCardProps = { readonly book: Book } & (
    | { readonly variant: "result"; readonly onSave: (id: string) => void; readonly saved: boolean }
    | { readonly variant: "saved";  readonly onRemove: (id: string) => void }
);
```

Two shapes, and `variant` says which. Inside the component:

```tsx
{props.variant === "result" ? (
    <Button small disabled={props.saved} onClick={() => props.onSave(book.id)}>
        {props.saved ? "On your list" : "Save"}
    </Button>
) : (
    <Button small variant="danger" onClick={() => props.onRemove(book.id)}>Remove</Button>
)}
```

`props.onSave` exists in one branch and `props.onRemove` in the other, neither
optional, no `?.` and no fallback. This is Day 22's discriminated union in a
component signature, and the payoff is the same: the illegal combinations are
not things to remember, they are things that do not compile.

### One thing that caught me

```tsx
const { book } = props;   // not: const { book, variant, onSave } = props;
```

Narrowing works on `props` as a whole. Destructuring `variant` out separates it
from the handler, so `props.variant === "result"` no longer tells the compiler
anything about `onSave`. So `book` — which is on both members — comes out, and
the union stays intact.

## ReadonlySet, not an array

```tsx
readonly savedIds: ReadonlySet<string>;
```

`.has()` is one lookup. `.includes()` on an array is a scan per card, so 20
results against 50 saved books is 1,000 comparisons for no reason. Making it a
`Set` in the type pushes that decision to the caller, who builds it once.

Week 4 did build a `Set` in `renderResults` — this just says so in the
signature instead of in a comment.

## The Four Conditional Forms

Put side by side in `ConditionalUI` with deliberately awkward props: a count
that may be `0`, a string that may be `""`, a value that may be `null`. Those
are exactly the cases where the forms stop being interchangeable.

| Form | When |
|------|------|
| Early return | The whole component has nothing to draw |
| Ternary | There is something to show either way |
| `&&` | This or nothing |
| `null` | An explicit "render nothing" from a branch |

And the trap, which is now visible on the page rather than described in a
comment:

```tsx
Truthy test with a zero count renders: [{0 && <span>never seen</span>}]
Explicit test renders: [{0 > 0 ? <span>never seen</span> : null}]
```

Rendered output:

```text
Truthy test with a zero count renders: [0]
Explicit test renders: []
```

A literal **0** on the page. `0 && x` evaluates to `0`, and `0` is falsy *and*
a valid React child, so React renders it. `null`, `undefined` and `false` are
the values that render nothing; numbers and strings render.

So every condition in these components is an explicit comparison —
`book.note !== undefined`, `count > 0`, `actions !== undefined` — and never a
truthiness test on a value that could be `0` or `""`.

## Keys again

```tsx
{books.map((book) =>
    props.variant === "result" ? (
        <BookCard key={book.id} ... />
    ) : (
        <BookCard key={book.id} ... />
    )
)}
```

`key` goes on the element returned by the callback, not on something inside it.
With a ternary inside the map, that means it appears on both branches — easy to
put on one and forget the other, and React's warning only fires for the branch
that actually renders.

The other case: a fragment in a list needs the long form, because `<>` takes no
props:

```tsx
{items.map((item) => (
    <Fragment key={item.id}>
        <dt>{item.term}</dt>
        <dd>{item.detail}</dd>
    </Fragment>
))}
```

Two siblings per item with no wrapper element — which is the right markup for a
definition list and impossible with `<>`.

## What I Learned

`ComponentProps<"button">` inherits every native prop, which is both less code
and more complete than listing the ones I think I need.

`Omit` on a props type is how to take a decision away from the caller when the
component owns it.

A spread goes last, and it belongs on a component whose job is forwarding —
not on a domain component, where it hides typos.

`type = "button"` as a default removes a bug I was previously preventing by
hand in eleven places.

An element is a value, so a prop can hold one. That is all a named slot is, and
it replaces a growing pile of configuration props.

Optional handler props allow combinations that are nonsense. A discriminated
union on the props makes them not compile, and removes the `?.` that was
standing in for an unanswerable question.

Narrowing works on the props object, so the discriminant must not be
destructured out of it.

`{0 && <X/>}` renders a literal `0`. `null`, `undefined` and `false` render
nothing; numbers and strings render.

`key` belongs on the element the map callback returns, on every branch of a
ternary — and a keyed fragment needs `<Fragment key=...>` because `<>` takes no
props.

## Verification

```text
npm run typecheck   ->  0 errors
npm run build       ->  clean
```

Rendered in jsdom and probed for the day's specific claims:

```text
panel actions slot : Clear
result buttons     : On your list(disabled), On your list(disabled), Save, Save
saved buttons      : Remove:button button--danger button--small
empty state        : This list is deliberately empty. Nothing to show here yet.
zero-trap line     : Truthy test with a zero count renders: [0]  Explicit test renders: []
every button type  : button
problems           : none
```

The first two cards are disabled because they are in `savedIds`, the last two
are not — which is the `result` variant's `saved` prop doing its job. The
saved panel renders `Remove` with the danger class. The empty panel renders
both the message and the optional children hint. And every button on the page
has `type="button"` without a single one being written by hand.

## Day 27 Outcome

Eight reusable components with fully typed props: one extending the native
`<button>` props and removing `className` from them, one closed `Record` for
each of two class lookups, a panel with a named `actions` slot, and a card whose
two variants are a discriminated union rather than four optional props. Every
conditional is an explicit comparison, and the literal-`0` trap is demonstrated
on the page. No state anywhere, type-checks and builds clean, and the rendered
output verified against jsdom.

Day 28 is events and `useState`: the handlers that log today start changing
things, with functional updates for anything derived from the previous value.
