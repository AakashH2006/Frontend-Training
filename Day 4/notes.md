# Day 4 - Forms and Native Validation

## Topics Covered

- HTML forms
- Labels and form controls
- Input types
- Required fields
- Native browser validation
- Number constraints
- Pattern validation
- Textareas
- Fieldsets and legends

## Practical Work

I added a Contact Me section to my profile page using an HTML form.

The form contains fields for:

- Name
- Email
- Age
- Phone number
- Message

Each form control has an associated label.

## Validation

I used native HTML validation instead of JavaScript.

- `required` prevents empty fields
- `type="email"` validates email input
- `min` and `max` restrict the allowed age range
- `pattern` requires the phone number to contain exactly 10 digits
- `type="number"` is used for the age field
- `type="tel"` is used for the phone field

## Grouping

I used `<fieldset>` to group the contact fields and `<legend>` to describe the group.

## What I Learned

Forms collect user input.

Labels should be explicitly associated with their controls using the label's `for` attribute and the input's `id`.

HTML provides built-in validation features, allowing simple validation without JavaScript.

`<textarea>` is useful for longer, multi-line text.

`<fieldset>` and `<legend>` provide meaningful grouping for related form controls.

## Testing

I tested the native browser validation by submitting empty fields and entering invalid values for the email, age and phone fields.

## Day 4 Outcome

The profile page now contains an accessible contact form with appropriate input types, grouped controls and native HTML validation.