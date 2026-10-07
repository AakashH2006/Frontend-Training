/* Day 49 - a typed reactive form.

   The difference from Week 6's React form is where the state lives. There, the
   component held a `Draft` object in `useState` and every input was wired to
   it by hand. Here the FORM holds the state, and the component asks it
   questions.

   That is a real shift and it took a while to stop fighting: there is no
   `draft` signal on this class, because `this.form.value` is it. */

import { Component, inject, input, output, signal } from '@angular/core';
import {
    FormBuilder,
    type FormControl,
    type FormGroup,
    ReactiveFormsModule,
    Validators
} from '@angular/forms';

import { STATUSES, STATUS_LABELS, type Book, type Status } from './domain';
import { finishedNeedsYear, notBlank, uniqueTitle, yearRange } from './validators';

/* The form's shape as a type, so `form.controls.title` is a
   FormControl<string> rather than an AbstractControl.

   This is what "typed forms" means in Angular 14+, and it is the whole reason
   the form is worth using over a signal object: `form.value.titel` does not
   compile, and `form.controls.year.setValue('x')` does not either. */
interface BookFormControls {
    title: FormControl<string>;
    authors: FormControl<string>;
    year: FormControl<string>;
    status: FormControl<Status>;
    note: FormControl<string>;
}

export type BookDraft = Omit<Book, 'id' | 'addedAt'>;

const CURRENT_YEAR = new Date().getFullYear();

@Component({
    selector: 'app-book-form',
    imports: [ReactiveFormsModule],
    templateUrl: './book-form.html',
    styleUrl: './book-form.css'
})
export class BookForm {
    /* A default of [], NOT input.required().

       The uniqueness validator runs once while the form is being constructed -
       Angular computes a control's initial validity on creation - and at that
       moment no input has been set yet. Reading a required input then throws.

       A default makes the first run see an empty list, which is correct: an
       empty form has no duplicate. */
    readonly existing = input<readonly Book[]>([]);

    /* Absent when adding, present when editing. Its presence is what makes
       Cancel appear - Day 30's "no mode prop" decision, carried over. */
    readonly initial = input<Book | undefined>(undefined);

    readonly submitLabel = input<string>('Add to list');

    readonly save = output<BookDraft>();
    readonly cancel = output<void>();

    private readonly fb = inject(FormBuilder);

    protected readonly statuses = STATUSES;
    protected readonly statusLabels = STATUS_LABELS;

    /* Errors are shown after the first submit attempt, not while someone is
       still typing the first character of a required field. Day 29's rule, and
       it needs its own flag because Angular's `touched` fires on blur. */
    protected readonly submitted = signal(false);

    /* The id of the book being edited, owned by THIS component rather than
       read from the `initial` input.

       That is not duplication, it is a timing fix, and it took a probe to
       find. `startEdit` in the parent sets its `editingId` signal and then
       calls `fillFrom` immediately - but Angular propagates an input at the
       next change detection, so when `setValue` ran and re-validated,
       `initial()` was still the PREVIOUS value.

       The effect was that editing a book and saving it without changing the
       title was rejected as a duplicate of itself - Day 30's bug, arriving by
       a completely different route. Reading an id this component sets itself
       removes the dependency on when an input lands. */
    private readonly editingId = signal<string | null>(null);

    /* `nonNullable: true` on the group is the option that matters.

       Without it, every control's type is `string | null` - because `reset()`
       sets controls to null by default - and every read needs a `?? ''`. With
       it, `reset()` returns each control to its initial value instead, and the
       types lose the null.

       It is per-control in the builder's array form; `nonNullable` on the
       group applies it to all of them. */
    protected readonly form: FormGroup<BookFormControls> = this.fb.group(
        {
            title: this.fb.nonNullable.control('', {
                validators: [Validators.required, notBlank, Validators.maxLength(200)]
            }),
            authors: this.fb.nonNullable.control(''),
            year: this.fb.nonNullable.control('', {
                validators: [yearRange(1450, CURRENT_YEAR)]
            }),
            status: this.fb.nonNullable.control<Status>('unread'),
            note: this.fb.nonNullable.control('', {
                validators: [Validators.maxLength(300)]
            })
        },
        {
            /* Validators on the GROUP, for rules that need more than one
               control. */
            validators: [finishedNeedsYear]
        }
    );

    constructor() {
        /* The uniqueness validator is added here rather than above, because it
           needs `this.existing` and `this.initial` - and a field initialiser
           cannot reference another field that is declared later.

           `{ emitEvent: false }` so adding the validator does not count as a
           value change. Without it, anything subscribed to valueChanges fires
           once during construction. */
        this.form.controls.title.addValidators(
            uniqueTitle(
                () => this.existing(),
                () => this.editingId()
            )
        );
        this.form.controls.title.updateValueAndValidity({ emitEvent: false });
    }

    /* Derived from the form, not stored. `form.invalid` is a getter Angular
       keeps up to date, so there is no `isValid` signal to go stale.

       It is NOT a signal, though, which is the one awkward part of reactive
       forms in a signals app: the template re-reads it on every change
       detection rather than being pushed to. Angular 20 added
       `form.valueChanges` as a signal via toSignal; this is the simpler
       version and is what the docs still show. */
    protected get invalid(): boolean {
        return this.form.invalid;
    }

    /* The error summary's contents, in field order rather than key order -
       Day 38's lesson. */
    protected readonly fieldOrder = ['title', 'year', 'note'] as const;

    /* A METHOD, not a computed.

       My first version was `computed(() => this.form.controls.note.value.length)`
       and the counter never moved off 0. A computed tracks SIGNALS, and a
       FormControl's value is not one - so the computation ran once, cached,
       and had nothing that could ever invalidate it.

       That is the one place reactive forms and signals do not meet. A method
       is re-evaluated on every change-detection pass, which is what a getter
       in a template does anyway, and is correct here.

       The signal-flavoured alternative is
       `toSignal(this.form.controls.note.valueChanges, { initialValue: '' })`,
       which is the right answer in a bigger form and is more machinery than a
       character count needs. */
    protected noteLength(): number {
        return this.form.controls.note.value.length;
    }

    /* Called from the template to decide whether to show a field's error.

       `touched` alone would show an error the moment someone tabs past an
       empty required field, which is Day 29's "red before it has been used".
       `submitted() || touched` is the compromise: nothing until either the
       field has been visited and left, or Submit has been pressed. */
    protected showError(name: keyof BookFormControls): boolean {
        const control = this.form.controls[name];
        return control.invalid && (control.touched || this.submitted());
    }

    protected errorFor(name: keyof BookFormControls): string | null {
        const control = this.form.controls[name];
        if (!control.errors) return null;

        const errors = control.errors;

        if (errors['required'] !== undefined || errors['notBlank'] !== undefined) {
            return 'A title is required.';
        }
        if (errors['maxlength'] !== undefined) {
            return name === 'title'
                ? 'That title is longer than 200 characters.'
                : 'Keep the note under 300 characters.';
        }
        if (errors['uniqueTitle'] !== undefined) {
            return 'That title is already on your list.';
        }
        if (errors['yearInteger'] !== undefined) {
            return 'Use a whole number, or leave it blank.';
        }

        const range = errors['yearRange'];
        if (range !== undefined) {
            const bounds = range as { min: number; max: number };
            return `Use a year between ${bounds.min} and ${bounds.max}.`;
        }

        return 'That value is not valid.';
    }

    /* Counted from the same two sources the summary lists, so the heading and
       the list cannot disagree. A separate `errorCount` field would be the
       Day 20 mistake - a second copy of a derivable fact. */
    protected problemCount(): number {
        const fields = this.fieldOrder.filter((name) => this.showError(name)).length;
        return fields + (this.groupError === null ? 0 : 1);
    }

    protected get groupError(): string | null {
        if (!this.submitted() && !this.form.touched) return null;
        return this.form.errors?.['finishedNeedsYear'] !== undefined
            ? 'A finished book needs a publication year.'
            : null;
    }

    protected onSubmit(): void {
        this.submitted.set(true);

        if (this.form.invalid) {
            /* Marking everything touched so every field's error appears, not
               just the ones that were visited. Without this, pressing Submit
               on an untouched form shows the summary and no inline errors. */
            this.form.markAllAsTouched();
            return;
        }

        /* `getRawValue()` rather than `.value`.

           `.value` omits DISABLED controls, and its type reflects that by
           making every field optional - so `value.title` is `string |
           undefined` even when the control is required. `getRawValue()`
           includes everything and is fully typed.

           Nothing is disabled here, and using the right one anyway means the
           day something is disabled, this does not silently start dropping a
           field. */
        const raw = this.form.getRawValue();
        const year = raw.year.trim();
        const note = raw.note.trim();

        this.save.emit({
            title: raw.title.trim(),
            authors: raw.authors
                .split(',')
                .map((name) => name.trim())
                .filter((name) => name.length > 0),
            status: raw.status,
            ...(year.length === 0 ? {} : { year: Number(year) }),
            ...(note.length === 0 ? {} : { note })
        });

        if (this.initial() === undefined) this.reset();
    }

    /* Public, because the parent calls it when cancelling an edit. `reset` is
       protected because it is the template's Clear button; this is the same
       work with a different caller, and giving them different names keeps the
       visibility honest. */
    clear(): void {
        this.resetForm();
    }

    protected reset(): void {
        this.resetForm();
    }

    private resetForm(): void {
        this.editingId.set(null);
        /* With `nonNullable`, reset() returns each control to the value it was
           created with rather than to null. That is the behaviour the types
           already promised, and without the option they would have been
           lying. */
        this.form.reset();
        this.submitted.set(false);
    }

    protected onCancel(): void {
        this.cancel.emit();
    }

    /* Fills the form from a book. Called by the parent through a template
       reference rather than by an effect watching `initial`, because filling a
       form is something that HAPPENS rather than something that is true -
       Day 34's rule, and the alternative is an effect that fights the user's
       typing. */
    fillFrom(book: Book): void {
        /* Before setValue, so the re-validation it triggers already knows
           which book is exempt from the uniqueness check. */
        this.editingId.set(book.id);

        this.form.setValue({
            title: book.title,
            authors: book.authors.join(', '),
            year: book.year === undefined ? '' : String(book.year),
            status: book.status,
            note: book.note ?? ''
        });
        this.submitted.set(false);
    }
}
