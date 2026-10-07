/* Day 50 - the create and edit form.

   One component for both, which is Day 30's decision in its third framework.
   The differences between adding and editing are three things:

       what the fields start as   -> fillFrom(), called by the parent
       what the button says       -> submitLabel
       whether there is a way out -> the presence of a contact being edited

   Seven controls across four kinds - text, email, tel, select, checkbox and
   textarea - which is more variety than Day 49 had and is where the value
   accessors matter. */

import { Component, inject, input, output, signal } from '@angular/core';
import {
    FormBuilder,
    type FormControl,
    type FormGroup,
    ReactiveFormsModule,
    Validators
} from '@angular/forms';

import { GROUPS, GROUP_LABELS, type Contact, type ContactDraft, type Group } from './domain';
import {
    emailOrPhone,
    looksLikeEmail,
    looksLikePhone,
    maxTags,
    notBlank,
    parseTags,
    uniqueEmail
} from './validators';

interface ContactFormControls {
    name: FormControl<string>;
    email: FormControl<string>;
    phone: FormControl<string>;
    group: FormControl<Group>;
    tags: FormControl<string>;
    favourite: FormControl<boolean>;
    note: FormControl<string>;
}

const MAX_TAGS = 6;

@Component({
    selector: 'app-contact-form',
    imports: [ReactiveFormsModule],
    templateUrl: './contact-form.html',
    styleUrl: './contact-form.css'
})
export class ContactForm {
    /* A default of [], not input.required(). The uniqueness validator runs
       once while the form is being constructed, before any input has been set
       - Day 49's bug, not repeated. */
    readonly existing = input<readonly Contact[]>([]);
    readonly knownTags = input<readonly string[]>([]);
    readonly submitLabel = input<string>('Add contact');

    readonly save = output<ContactDraft>();
    readonly cancel = output<void>();

    private readonly fb = inject(FormBuilder);

    protected readonly groups = GROUPS;
    protected readonly groupLabels = GROUP_LABELS;
    protected readonly maxTags = MAX_TAGS;

    protected readonly submitted = signal(false);

    /* Owned here rather than read from an input, because `fillFrom` sets it
       before `setValue` triggers re-validation - and an input would still be
       the previous value at that moment. Day 49's timing bug, which took a
       probe to find and one line to prevent. */
    protected readonly editingId = signal<string | null>(null);

    protected readonly form: FormGroup<ContactFormControls> = this.fb.group(
        {
            name: this.fb.nonNullable.control('', {
                validators: [Validators.required, notBlank, Validators.maxLength(80)]
            }),
            /* Not Validators.email. Angular's is stricter than useful and
               rejects some valid addresses; `looksLikeEmail` checks the shape
               a typo breaks and nothing more. */
            email: this.fb.nonNullable.control('', { validators: [looksLikeEmail] }),
            phone: this.fb.nonNullable.control('', { validators: [looksLikePhone] }),
            group: this.fb.nonNullable.control<Group>('other'),
            tags: this.fb.nonNullable.control('', { validators: [maxTags(MAX_TAGS)] }),
            /* A boolean control, which is what makes the checkbox work -
               Angular picks CheckboxValueAccessor from `type="checkbox"` and
               writes a boolean. Declaring FormControl<string> here would be
               Day 49's number bug with a different type. */
            favourite: this.fb.nonNullable.control(false),
            note: this.fb.nonNullable.control('', { validators: [Validators.maxLength(300)] })
        },
        { validators: [emailOrPhone] }
    );

    constructor() {
        this.form.controls.email.addValidators(
            uniqueEmail(
                () => this.existing(),
                () => this.editingId()
            )
        );
    }

    /* A method, not a computed: a FormControl's value is not a signal, so a
       computed would cache once and never update. Day 49. */
    protected noteLength(): number {
        return this.form.controls.note.value.length;
    }

    protected tagCount(): number {
        return parseTags(this.form.controls.tags.value).length;
    }

    protected readonly fieldOrder = ['name', 'email', 'phone', 'tags', 'note'] as const;

    protected showError(name: keyof ContactFormControls): boolean {
        const control = this.form.controls[name];
        return control.invalid && (control.touched || this.submitted());
    }

    protected errorFor(name: keyof ContactFormControls): string | null {
        const errors = this.form.controls[name].errors;
        if (!errors) return null;

        if (errors['required'] !== undefined || errors['notBlank'] !== undefined) {
            return 'A name is required.';
        }
        if (errors['maxlength'] !== undefined) {
            return name === 'name'
                ? 'Keep the name under 80 characters.'
                : 'Keep the note under 300 characters.';
        }
        if (errors['email'] !== undefined) return 'That does not look like an email address.';
        if (errors['phone'] !== undefined) return 'That does not look like a phone number.';
        if (errors['uniqueEmail'] !== undefined) return 'Another contact already has that email.';

        const tags = errors['maxTags'];
        if (tags !== undefined) {
            const bounds = tags as { limit: number; actual: number };
            return `${bounds.actual} tags, and the limit is ${bounds.limit}.`;
        }

        return 'That value is not valid.';
    }

    protected groupError(): string | null {
        if (!this.submitted() && !this.form.touched) return null;

        return this.form.errors?.['emailOrPhone'] !== undefined
            ? 'Give either an email address or a phone number.'
            : null;
    }

    protected problemCount(): number {
        const fields = this.fieldOrder.filter((name) => this.showError(name)).length;
        return fields + (this.groupError() === null ? 0 : 1);
    }

    protected onSubmit(): void {
        this.submitted.set(true);

        if (this.form.invalid) {
            /* Without this, submitting an untouched form shows the summary and
               no inline errors, because nothing has been touched. */
            this.form.markAllAsTouched();
            return;
        }

        /* getRawValue(), not .value - the latter drops disabled controls and
           types every field as optional. Nothing is disabled here; using the
           right one means that stays true if something ever is. */
        const raw = this.form.getRawValue();

        const email = raw.email.trim();
        const phone = raw.phone.trim();
        const note = raw.note.trim();

        this.save.emit({
            name: raw.name.trim(),
            group: raw.group,
            tags: parseTags(raw.tags),
            favourite: raw.favourite,
            /* Conditional spreads, because `exactOptionalPropertyTypes` makes
               absent and present-and-undefined different states. Week 5. */
            ...(email.length === 0 ? {} : { email }),
            ...(phone.length === 0 ? {} : { phone }),
            ...(note.length === 0 ? {} : { note })
        });

        /* Always clear, including after an edit.

           Day 49's version was `if (editingId === null) this.clear()`, and
           that worked there only because the Cancel button's condition read
           the `initial` INPUT - so the parent setting its own id to null made
           Cancel disappear on the next change detection.

           Here the form owns `editingId` (the Day 49 timing fix), which the
           parent cannot reach. So the form has to clear its own edit state,
           and a probe caught that it did not: the save went through, the
           notice was right, and Cancel stayed on screen. */
        this.clear();
    }

    /* Public, because the parent calls it when cancelling. */
    clear(): void {
        this.editingId.set(null);
        /* With nonNullable, reset() returns each control to the value it was
           created with rather than to null - which is what the types already
           claim. */
        this.form.reset();
        this.submitted.set(false);
    }

    protected onCancel(): void {
        this.cancel.emit();
    }

    /* Called by the parent in the handler that caused it, rather than by an
       effect watching an input. Filling a form is something that HAPPENS, and
       an effect would fight whatever the user is typing - Day 34. */
    fillFrom(contact: Contact): void {
        this.editingId.set(contact.id);

        this.form.setValue({
            name: contact.name,
            email: contact.email ?? '',
            phone: contact.phone ?? '',
            group: contact.group,
            tags: contact.tags.join(', '),
            favourite: contact.favourite,
            note: contact.note ?? ''
        });

        this.submitted.set(false);
    }
}
