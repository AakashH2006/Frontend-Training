# Day 49 - Reactive forms and validation

## Topics Covered

- `FormGroup`, `FormControl`, and typed forms
- `nonNullable`, and the `| null` it removes
- `Validators`, and what `required` does not do
- A custom validator, a factory validator and a cross-field validator
- `getRawValue()` against `.value`
- `touched`, `dirty`, `pristine`, and when to show an error
- `viewChild`, and calling a method on a child
- Three bugs the probe found, two of which the type system could not

## Practical Work

A typed reactive form for adding and editing a book.

```text
src/app/validators.ts        4 validators, none of them built in
src/app/book-form.ts + .html the form
src/app/app.ts               the edit flow
```

## The Form Holds The State

The shift that took longest to accept. Week 6's React form kept a `Draft`
object in `useState` and wired every input to it by hand — `value` and
`onChange` on all five.

```html
<input id="title" formControlName="title" />
```

No `[value]` and no `(input)` anywhere. **The form owns the value** and the
directives do the binding, so there is no `draft` signal on this class;
`this.form.value` *is* it.

The cost is that the connection is **by string**. `formControlName="titel"`
compiles and throws at runtime. Typed forms type the class, not the template —
which is the one real gap, and it is the opposite of the Week 6 trade where
everything was typed and everything was manual.

## Typed Forms

```ts
interface BookFormControls {
    title: FormControl<string>;
    authors: FormControl<string>;
    year: FormControl<string>;
    status: FormControl<Status>;
    note: FormControl<string>;
}
```

So `form.controls.title` is a `FormControl<string>`, `form.value.titel` does
not compile, and `form.controls.status.setValue('readng')` does not either.

### nonNullable

```ts
this.fb.nonNullable.control('', { validators: [...] })
```

Without it, every control's type is `string | null` — because `reset()` sets
controls to `null` by default — and every read needs a `?? ''`.

With it, `reset()` returns each control to the value it was **created with**,
and the types lose the null. The behaviour matches what the types would
otherwise be claiming falsely.

## What Validators.required Does Not Do

```ts
validators: [Validators.required, notBlank, Validators.maxLength(200)]
```

`Validators.required` **passes a whitespace-only string**. It checks for an
empty value, and `"   "` is not empty. First thing I tested, first thing that
surprised me:

```text
whitespace : A title is required.   <- Validators.required alone would accept this
```

`notBlank` is nine lines and is the kind of thing that should probably be built
in.

### The validator interface is tiny

```ts
export function notBlank(control: AbstractControl): ValidationErrors | null
```

A function from a control to an errors object, or `null` when valid. That is
all of it — nothing to extend, nothing to register.

**The key is the contract.** Returning `{ yearRange: { min, max, actual } }`
rather than a message means the wording lives in the template with the rest of
the wording, and the validator stays about the rule.

A factory when the rule needs configuration:

```ts
export function yearRange(min: number, max: number): ValidatorFn
```

...which is exactly what `Validators.maxLength(200)` is.

And empty is **valid** in `yearRange`, because the year is optional. A
validator that rejects an empty value is doing `required`'s job — Day 29's
"ask the right question", in a new shape.

### Cross-field validation goes on the group

```ts
this.fb.group({ ... }, { validators: [finishedNeedsYear] })
```

A rule needing two values cannot live on one control. It goes on the group, its
error lives on the group, and it is rendered outside any `.field` — which is
also why the summary lists it without a link to a field.

```text
finished+noyear : A finished book needs a publication year.
```

## getRawValue(), not .value

```ts
const raw = this.form.getRawValue();
```

`.value` **omits disabled controls**, and its type reflects that by making every
field optional — so `value.title` is `string | undefined` even on a required
control.

Nothing is disabled here. Using the right one anyway means that the day
something is disabled, this does not silently start dropping a field.

## When To Show An Error

```ts
protected showError(name: keyof BookFormControls): boolean {
    const control = this.form.controls[name];
    return control.invalid && (control.touched || this.submitted());
}
```

Angular tracks four flags per control, and `touched` alone is not the answer:
it fires on **blur**, so tabbing past an empty required field lights it up
before it has been used.

`touched || submitted()` is the compromise — nothing until either the field has
been visited and left, or Submit has been pressed. Day 29's rule, reached with
different machinery.

And on an invalid submit:

```ts
this.form.markAllAsTouched();
```

Without it, pressing Submit on an untouched form shows the summary and **no
inline errors**, because nothing has been touched.

The flags are rendered on the page, because I wanted to watch them rather than
read about them:

```text
form: invalid · untouched · pristine · title: invalid, untouched
```

### Not a disabled submit button

Deliberately `<button type="submit">` with no `[disabled]="form.invalid"`.

A disabled submit is the thing that looks helpful and is not: it gives no
reason, it cannot be focused to find out why, and on a form with an error the
user cannot see it is simply broken. Submitting and being told what is wrong is
better than being unable to submit and not knowing.

## Three Bugs The Probe Found

The most useful part of the day, and none of them was a type error.

### 1. A computed over a FormControl never updates

```ts
protected readonly noteLength = computed(() => this.form.controls.note.value.length);
```

```text
note count shows: 0 / 300   <- should be 5 / 300
```

A `computed` tracks **signals**. A `FormControl`'s value is not one, so the
computation ran once, cached, and had nothing that could ever invalidate it.

This is the one place reactive forms and signals do not meet. A method is
correct here and is re-evaluated each change-detection pass. The
signal-flavoured answer is
`toSignal(control.valueChanges, { initialValue: '' })`, which is right in a
bigger form and is more machinery than a character count needs.

### 2. type="number" writes a number into a FormControl<string>

The one I would not have guessed, and it cost the most.

```text
ERR: ERROR TypeError: t.year.trim is not a function
```

Angular picks a **value accessor** from the input's type, and `type="number"`
selects `NumberValueAccessor` — which writes a `number` into the control. The
control is declared `FormControl<string>`, so `raw.year.trim()` threw at
submit.

And the failure mode was horrible: the form reported itself **valid**, the
submit silently did nothing, and the only evidence was a `console.error` the
probe happened to be capturing.

> A typed form types the class. It cannot type what the DOM hands back.

The fix is `inputmode="numeric"` without `type="number"` — the numeric keyboard
on a phone, the default string accessor, and `yearRange` doing the actual
validation. Which is Day 29's conclusion that `type="number"` is a keyboard
hint rather than a validator, arriving again with a sharper edge.

### 3. An input read during construction, and then read too early

Two halves of the same timing problem.

**First:** `existing` was `input.required()`, and the uniqueness validator runs
once while the form is being *constructed* — Angular computes a control's
initial validity on creation. Reading a required input then throws. A default
of `[]` is correct: an empty form has no duplicate.

**Second, and subtler:** the validator's `exceptId` read `this.initial()?.id`.
The parent's `startEdit` sets its own `editingId` signal and then calls
`fillFrom` immediately — but **Angular propagates an input at the next change
detection**, so when `setValue` re-validated, `initial()` was still the
previous value.

The effect: editing a book and saving it without changing the title was
rejected as a duplicate **of itself**. Day 30's bug, by a completely different
route.

```text
saved : Added "Dune".  | still editing: yes     <- before
saved : Saved "Dune".  | still editing: no      <- after
```

The fix is for the form to own the id it is editing, set by `fillFrom` before
`setValue`, so nothing depends on when an input lands.

## viewChild

```ts
private readonly form = viewChild(BookForm);
// ...
this.form()?.fillFrom(book);
```

The signal query — the current replacement for `@ViewChild`. It gives a signal
holding the child instance.

Reaching into a child like this is worth being uncomfortable about, and I kept
it for one reason: **filling a form is an event, not a state.** The alternative
is an effect watching `editingId` that fights whatever the user is typing —
Day 34's rule.

React solved the same problem with `key`, which remounts the component. Angular
has no equivalent for a form that should keep its instance, so this is the
call.

## What I Learned

Reactive forms move the state into the form, which removes the two bindings per
field and adds a string-based connection the compiler cannot check.

`nonNullable` removes `| null` from every control and makes `reset()` return to
the initial value rather than null.

`Validators.required` accepts whitespace.

A validator is one function returning an errors object, and the error **key**
is the contract — the message belongs in the template.

A rule needing two fields goes on the group.

`getRawValue()` is fully typed; `.value` drops disabled controls and makes
every field optional.

`touched` fires on blur, so it needs `|| submitted` to avoid a red form nobody
has used. `markAllAsTouched()` is required for an untouched submit to show
inline errors.

A `computed` cannot track a `FormControl`. It will cache once and never update.

`type="number"` changes which value accessor Angular uses, so a
`FormControl<string>` silently holds a number — and the resulting throw happens
inside the submit handler, where the form still reports itself valid.

An input is not available during a component's construction, and is not updated
until the next change detection — so anything a validator needs immediately
should be owned by the component rather than read from an input.

## Verification

```text
npm run typecheck   ->  tsc -b --force, 0 errors
npm run build       ->  222.68 kB raw, 60.73 kB transfer
```

The jump from 42 kB to 61 kB is `@angular/forms`, which is the first dependency
this week that is not already in the framework core.

Driven through jsdom:

```text
flags at start : form: invalid · untouched · pristine
empty submit   : 1 problem to fix. | summary + inline + aria-invalid + describedby
whitespace     : A title is required.
bad year       : Use a year between 1450 and 2026.
finished+noyear: A finished book needs a publication year.
note count     : 22 / 300
after submit   : Dune added | notice: Added "Dune". | form cleared
duplicate      : That title is already on your list.

edit mode      : Editing "Dune"
  prefilled    : "Dune" "1965" "Frank Herbert, Someone Else"
  buttons      : Save changes, Cancel
  saved        : Saved "Dune". | still editing: no
  note applied : Reread in October.
rename to dup  : That title is already on your list.
after cancel   : Add a book | title: ""

persisted      : 8 books
problems       : none
```

`rename to dup` rejecting and the save-without-renaming succeeding are the two
halves of the uniqueness rule, and only the second one was broken.

## Day 49 Outcome

A typed reactive form with five controls, four validators — one built in, one
custom, one factory and one cross-field — an accessible error summary listing
problems in field order with each linked to its field, `aria-invalid` and
`aria-describedby` on every invalid control, and an edit flow that fills the
form through a `viewChild` rather than an effect.

Three bugs found by driving it rather than by reading it, and only one of them
was the kind a type system could have caught.

Day 50 is the Week 10 build: the same form generalised into a create-and-edit
flow over a different domain, with the service separation the week has been
building towards — plus the Week 10 README.
