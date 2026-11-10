/* Day 50 - the validators.

   Day 49's four, plus the two this domain needs. The interesting one is
   `emailOrPhone`, because "at least one of these" is a rule the reading list
   had no equivalent of and is the commonest cross-field rule there is. */

import {
    type AbstractControl,
    type ValidationErrors,
    type ValidatorFn
} from '@angular/forms';

/* Rejects "   ". Validators.required passes a whitespace-only string, which
   was Day 49's first surprise. */
export function notBlank(control: AbstractControl): ValidationErrors | null {
    const value: unknown = control.value;
    if (typeof value !== 'string') return null;
    return value.trim().length === 0 ? { notBlank: true } : null;
}

/* Deliberately permissive.

   The full RFC 5322 grammar is famously unmatchable by a sane regular
   expression, and a strict one rejects addresses that work. The only
   definitive test is sending a message to it.

   So this checks the shape a typo would break - something, an @, something, a
   dot, something - and nothing else. A validator that rejects a valid address
   is worse than one that accepts an invalid one, because the user cannot
   argue with it. */
export function looksLikeEmail(control: AbstractControl): ValidationErrors | null {
    const value: unknown = control.value;
    if (typeof value !== 'string' || value.trim().length === 0) return null;

    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()) ? null : { email: true };
}

/* Digits, spaces and the handful of punctuation marks a phone number uses.
   Again permissive: international formats vary more than any pattern I would
   write, so this catches "no digits at all" and letters. */
export function looksLikePhone(control: AbstractControl): ValidationErrors | null {
    const value: unknown = control.value;
    if (typeof value !== 'string' || value.trim().length === 0) return null;

    const trimmed = value.trim();
    const hasDigits = /\d/.test(trimmed);
    const onlyAllowed = /^[\d\s()+.\-]+$/.test(trimmed);

    return hasDigits && onlyAllowed ? null : { phone: true };
}

/* The group-level rule: at least one way to contact someone.

   This is the shape that cannot live on a control, because neither field is
   individually required - `required` on both would be a different rule, and
   `required` on neither is the current state. */
export function emailOrPhone(group: AbstractControl): ValidationErrors | null {
    const email: unknown = group.get('email')?.value;
    const phone: unknown = group.get('phone')?.value;

    const hasEmail = typeof email === 'string' && email.trim().length > 0;
    const hasPhone = typeof phone === 'string' && phone.trim().length > 0;

    return hasEmail || hasPhone ? null : { emailOrPhone: true };
}

/* Uniqueness on email, and only when one is given.

   `takenBy` is a FUNCTION so the validator sees the current list each time it
   runs rather than a snapshot from when the form was built - Day 49.

   `exceptId` is Day 30's lesson: a record must not be a duplicate of itself,
   or editing anything else about it fails. */
export function uniqueEmail(
    takenBy: () => readonly { readonly id: string; readonly email?: string }[],
    exceptId: () => string | null
): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
        const value: unknown = control.value;
        if (typeof value !== 'string') return null;

        const normalised = value.trim().toLowerCase();
        if (normalised.length === 0) return null;

        const clash = takenBy().some(
            (contact) =>
                contact.id !== exceptId() &&
                (contact.email ?? '').trim().toLowerCase() === normalised
        );

        return clash ? { uniqueEmail: true } : null;
    };
}

/* A factory, because the limit is configuration rather than part of the rule.
   Counts the parsed tags rather than the raw string's length. */
export function maxTags(limit: number): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
        const value: unknown = control.value;
        if (typeof value !== 'string') return null;

        const count = parseTags(value).length;
        return count > limit ? { maxTags: { limit, actual: count } } : null;
    };
}

/* Shared by the validator and the submit handler, so "what counts as a tag" is
   decided once. Two copies of this would be the Day 20 mistake. */
export function parseTags(value: string): readonly string[] {
    return [
        ...new Set(
            value
                .split(',')
                .map((tag) => tag.trim().toLowerCase())
                .filter((tag) => tag.length > 0)
        )
    ];
}
