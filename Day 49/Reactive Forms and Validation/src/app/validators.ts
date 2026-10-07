/* Day 49 - the validators that are not built in.

   A validator is a function from a control to an errors object, or null when
   it is valid. That is the whole interface, and it is the reason custom
   validation is easy: there is nothing to extend and nothing to register.

   The shape of the errors object matters: the KEY is what the template asks
   about, and the value is whatever that message needs. Returning
   `{ yearRange: { min: 1450, max: 2026 } }` rather than a string means the
   message lives in the template with the rest of the wording, and the
   validator stays about the rule. */

import {
    type AbstractControl,
    type ValidationErrors,
    type ValidatorFn
} from '@angular/forms';

/* Rejects "   ". `Validators.required` passes a whitespace-only string,
   because it only checks for an empty value - which is the first thing I
   tested and the first thing that surprised me. */
export function notBlank(control: AbstractControl): ValidationErrors | null {
    const value: unknown = control.value;

    if (typeof value !== 'string') return null;
    return value.trim().length === 0 ? { notBlank: true } : null;
}

/* A factory, because the bounds are configuration rather than part of the
   rule. Returning a ValidatorFn is the standard shape - Validators.min and
   friends are the same thing. */
export function yearRange(min: number, max: number): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
        const raw: unknown = control.value;

        /* Empty is VALID here. The year is optional, and a validator that
           rejects an empty value is doing `required`'s job - which is the
           Day 29 lesson about asking the right question. */
        if (raw === null || raw === '' || raw === undefined) return null;

        const year = Number(raw);

        if (!Number.isInteger(year)) return { yearInteger: true };
        if (year < min || year > max) return { yearRange: { min, max, actual: year } };

        return null;
    };
}

/* A cross-field validator, which goes on the GROUP rather than on a control,
   because it needs more than one value.

   The rule: a book marked finished should have a year. Arbitrary, and it is
   here because a real cross-field rule is the thing that makes the difference
   between control-level and group-level validation concrete. */
export function finishedNeedsYear(group: AbstractControl): ValidationErrors | null {
    const status: unknown = group.get('status')?.value;
    const year: unknown = group.get('year')?.value;

    if (status !== 'finished') return null;
    if (year !== null && year !== '' && year !== undefined) return null;

    return { finishedNeedsYear: true };
}

/* A validator that needs data the form does not have.

   `takenTitles` is a function rather than an array, so the validator sees the
   current list every time it runs rather than a snapshot from when the form
   was built - which is the bug the first version had, and the reason this
   takes a callback.

   `exceptId` is Day 30's lesson: a book must not be a duplicate of itself, or
   editing anything else about it fails. */
export function uniqueTitle(
    takenTitles: () => readonly { readonly id: string; readonly title: string }[],
    exceptId: () => string | null
): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
        const value: unknown = control.value;
        if (typeof value !== 'string') return null;

        const normalised = value.trim().toLowerCase();
        if (normalised.length === 0) return null;

        const clash = takenTitles().some(
            (book) => book.id !== exceptId() && book.title.trim().toLowerCase() === normalised
        );

        return clash ? { uniqueTitle: true } : null;
    };
}
