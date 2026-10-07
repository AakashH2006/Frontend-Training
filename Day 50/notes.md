# Day 50 - Form-driven weekly build

## Topics Covered

- A create and edit flow over a different domain
- "At least one of these" as a cross-field rule
- Value accessors: which input types change a control's runtime type
- A checkbox, and a boolean control
- Parsing a list out of one text field
- A `datalist` built from derived state
- Permissive validation, deliberately
- The bug that moving state created

## Practical Work

A contact manager. The course suggests "task, contact or product" for this day,
and taking it was the right call: nine days of Angular on the reading list
meant I knew that problem too well to tell which decisions were about Angular
and which were about books.

```text
src/app/domain.ts            7 fields, 3 unions, a guard
src/app/contacts.service.ts  the state, derived values and actions
src/app/storage.service.ts   unchanged in shape from Day 47
src/app/validators.ts        6 validators
src/app/contact-form.ts/.html  7 controls across 5 kinds
src/app/contact-card.ts/.html  inputs in, outputs out, injects nothing
src/app/app.ts/.html         one piece of state: which contact is being edited
```

## A Different Domain Earns Its Keep

Four things the reading list had no equivalent of, and each one taught
something:

**Two optional fields where at least one is required.** `email` and `phone` are
both optional individually and the form requires one of them. That cannot live
on a control — `required` on both is a different rule, and on neither is the
current state — so it is a group validator:

```ts
export function emailOrPhone(group: AbstractControl): ValidationErrors | null {
    const hasEmail = /* ... */;
    const hasPhone = /* ... */;
    return hasEmail || hasPhone ? null : { emailOrPhone: true };
}
```

```text
name only : Give either an email address or a phone number.
```

It is the commonest cross-field rule there is and I had never had to write one.

**A list inside a record.** `tags` is `readonly string[]` in the model and one
text field in the form, so the form parses in and joins out. The parsing is
shared between the validator and the submit handler:

```ts
export function parseTags(value: string): readonly string[] {
    return [...new Set(value.split(',').map((t) => t.trim().toLowerCase()).filter((t) => t.length > 0))];
}
```

Two copies of "what counts as a tag" would be the Day 20 mistake. And the `Set`
means duplicates merge:

```text
dupe tags : 2 / 6 tags    (from "maths, Maths, MATHS, logic")
```

**A boolean field**, which is a checkbox, which is a third kind of control.

**No natural unique key.** A book has a title; a contact has a name that two
people can share. So uniqueness is on `email`, and **only when one is given** —
a rule that does not apply to every record is new.

## Value Accessors, Again

Day 49's worst bug was `type="number"` selecting `NumberValueAccessor` and
writing a number into a `FormControl<string>`. That made me check every input
type here, which was the right instinct:

| Attribute | Accessor | Control type |
|-----------|----------|--------------|
| `type="email"` | default (string) | `FormControl<string>` ✓ |
| `type="tel"` | default (string) | `FormControl<string>` ✓ |
| `type="checkbox"` | `CheckboxValueAccessor` | `FormControl<boolean>` |
| `<select>` | `SelectValueAccessor` | `FormControl<Group>` |
| `type="number"` | `NumberValueAccessor` | would be `number` |

So `type="email"` and `type="tel"` are safe — Angular has no accessor for them,
they only change the on-screen keyboard and the browser's hint. `checkbox` is
not, and declaring `FormControl<string>` for `favourite` would have been Day
49's bug with a different type. It is `FormControl<boolean>`, and the checkbox
round-trips:

```text
form cleared : "" | favourite reset: false
prefilled    : "Ada Lovelace" "ada@example.com" "analytical engine, maths" | fav: true
```

The general rule I did not have before: **the input's `type` can change the
control's runtime type, and the declared type will not stop it.**

## Validation That Does Not Fight The User

```ts
/* Deliberately permissive. */
return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()) ? null : { email: true };
```

Not `Validators.email`, and not a full RFC 5322 pattern.

The complete grammar is famously unmatchable by a sane regular expression, and
a strict pattern rejects addresses that work. The only definitive test is
sending a message to it.

> A validator that rejects a valid address is worse than one that accepts an
> invalid one, because the user cannot argue with it.

So this checks the shape a **typo** would break and nothing more. Same for the
phone validator: it catches "no digits" and "contains letters", and permits
every international format I could think of.

That is a different instinct from the year validator on Day 49, where the
bounds are genuinely knowable. Knowing which kind of rule you have seems to be
the whole skill.

## The Bug Moving State Created

The one the probe found, and it only exists because of Day 49's fix.

Day 49 moved `editingId` **into the form**, because reading it from the
`initial` input was a render too late and made saving an edit fail as a
self-duplicate.

Day 50 inherited that, and inherited this line unchanged:

```ts
if (this.editingId() === null) this.clear();
```

On Day 49 that was fine: the Cancel button's condition read the `initial`
*input*, so the parent setting its own id to null made Cancel disappear on the
next change detection.

Here the Cancel condition reads the form's **own** `editingId`, which the
parent cannot reach. So:

```text
saved : Saved Ada Lovelace. | still editing: YES (bug)
```

The save worked, the notice was right, the note was applied — and the form
stayed in edit mode with a Cancel button for a contact nobody was editing.

```ts
/* Always clear, including after an edit. */
this.clear();
```

What makes it worth writing down: **a fix on Day 49 created a bug on Day 50**,
in a line I copied without re-reading because it had been correct. The probe
caught it; reading would not have, because the line is correct in isolation.

## A datalist From Derived State

```ts
readonly allTags = computed(() =>
    [...new Set(this.contacts().flatMap((contact) => contact.tags))].toSorted()
);
```

```html
<input id="tags" list="known-tags" />
<datalist id="known-tags">
    @for (tag of knownTags(); track tag) { <option [value]="tag"></option> }
</datalist>
```

Derived, so it cannot go stale — and it updates the moment a contact with a new
tag is added:

```text
tag suggestions : analytical engine, compilers, maths
new suggests    : analytical engine, compilers, logic, maths
```

A `datalist` rather than a `<select>`, because it suggests without restricting.
A select would make adding a new tag impossible, which is the wrong trade for
free text.

## What Did Not Change

Worth listing, because it is the week's actual result:

- **`storage.service.ts`** is Day 47's file with the type and the guard swapped.
  The probe, the envelope and all four failure modes are the same code they
  were in Week 5, Week 7 and Day 47.
- **The service shape** — private writable signals, `.asReadonly()` views,
  computeds, actions as the only way in.
- **The error summary** — Day 38's pattern, third framework.
- **`contact-card`** injects nothing and is a function of its inputs, which is
  Day 48's test for a presentational component.
- **The spread order** in `update`, so `id` and `addedAt` survive an edit.
- **Closing the editor** when its subject is removed.

```text
removed while editing -> panel: Add a contact | name field: ""
```

## What I Learned

Changing domain is a better test of a pattern than repeating one. Four of the
contact model's features had no reading-list equivalent, and each produced a
rule I had not written before.

"At least one of these" is a group validator, and it is the commonest
cross-field rule there is.

An input's `type` selects a value accessor, which can change the control's
runtime type regardless of what it is declared as. `email` and `tel` are safe;
`checkbox` and `number` are not.

Parsing shared between a validator and a submit handler has to be one function,
or the two will disagree about what counts.

A validator for something with no knowable grammar should be permissive —
rejecting a valid value is worse than accepting an invalid one, because the user
cannot argue with it.

A fix in one place can create a bug in another, and copying a line that was
correct is how it travels. The probe caught it; reading did not.

## Verification

```text
npm run typecheck   ->  tsc -b --force, 0 errors
npm run build       ->  220.84 kB raw, 59.99 kB transfer
```

Fifteen scenarios through jsdom, across four page loads sharing one
`localStorage`:

```text
seeded         : Ada Lovelace, Grace Hopper, Katherine Johnson
tag suggestions: analytical engine, compilers, maths

empty submit   : A name is required. | Give either an email address or a phone number.
name only      : Give either an email address or a phone number.
bad email      : That does not look like an email address.
bad phone      : That does not look like a phone number.
too many tags  : 7 tags, and the limit is 6.
dupe tags      : 2 / 6 tags                      (from 4 entries)

after submit   : Alan Turing added | stats: Contacts=4, Favourites=2
  tags shown   : maths, logic
  new suggests : analytical engine, compilers, logic, maths
dup email      : Another contact already has that email.

edit mode      : Editing Ada Lovelace
  prefilled    : name, email, tags, favourite: true
  saved        : Saved Ada Lovelace. | still editing: no
  note applied : Updated note.

favourited     : Favourite
filter favs    : 3 of 4 | filter work: Grace Hopper, Ada Lovelace
search by tag  : Grace Hopper            ("compilers" matches no name)
no match       : No contact matches that search. Clear the filters
sort by name   : Ada Lovelace, Alan Turing, Grace Hopper, Katherine Johnson

removed while editing -> panel: Add a contact | name field: ""

=== reload ===          restored 3 contacts
=== one bad row ===     "1 saved entry could not be read and was skipped." kept 3 of 4
=== storage blocked === notice shown, seed data, app still works
problems       : none
```

`search by tag` returning Grace Hopper is the search reaching into `tags` —
"compilers" appears in no name, email or phone.

## Day 50 Outcome

A contact manager: seven form controls across five kinds, six validators
including a group-level "email or phone" rule and a uniqueness check that
exempts the record being edited, an accessible error summary listing problems in
field order, a tag field that parses and de-duplicates with suggestions from
derived state, and a service owning every piece of state behind readonly views.

Edit mode fills the form from the handler that opened it, cancel and save both
return it to a blank add form, and removing the contact being edited closes the
editor.

That closes Week 10, and the course's Day 50. Written up in
`Day 50/README.md`.
