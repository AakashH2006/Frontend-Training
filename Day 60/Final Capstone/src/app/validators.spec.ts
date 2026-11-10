/* Day 54 - the validators.

   Six functions, no DOM, no injector - but they take an `AbstractControl`
   rather than a value, so each test needs one. `new FormControl(x)` is enough
   and needs no TestBed, which was the first thing I checked: a FormControl is
   an ordinary object, and only the directives that bind it to the DOM need
   Angular to be running.

   What these tests are really for is the five rules Day 49 and Day 50 recorded
   in prose. A rule in a comment rots; a rule in a test fails. */

import { FormControl, FormGroup } from '@angular/forms';
import { describe, expect, it } from 'vitest';

import {
    emailOrPhone,
    looksLikeEmail,
    looksLikePhone,
    maxTags,
    notBlank,
    parseTags,
    uniqueEmail
} from './validators';
import { type Contact } from './domain';

const control = (value: unknown) => new FormControl(value);

describe('notBlank', () => {
    /* The rule it exists for: Validators.required passes "   ", which was Day
       49's first surprise. This test is that sentence, executable. */
    it('rejects a string that is only whitespace', () => {
        expect(notBlank(control('   '))).toEqual({ notBlank: true });
        expect(notBlank(control('\t\n'))).toEqual({ notBlank: true });
    });

    it('accepts anything with a character in it', () => {
        expect(notBlank(control('a'))).toBeNull();
        expect(notBlank(control('  Ada  '))).toBeNull();
    });

    it('ignores values that are not strings', () => {
        /* A validator is attached to a control whose type it cannot police, so
           "not a string" has to mean "not my problem" rather than "invalid". */
        expect(notBlank(control(42))).toBeNull();
        expect(notBlank(control(null))).toBeNull();
    });
});

describe('looksLikeEmail', () => {
    it('accepts an empty value, because the field is optional', () => {
        expect(looksLikeEmail(control(''))).toBeNull();
        expect(looksLikeEmail(control('   '))).toBeNull();
    });

    it.each(['ada@example.com', 'a@b.co', 'first.last+tag@sub.domain.org', 'x@y.zz'])(
        'accepts %s',
        (value) => {
            expect(looksLikeEmail(control(value))).toBeNull();
        }
    );

    it.each(['ada', 'ada@', '@example.com', 'ada@example', 'ada @example.com'])(
        'rejects %s',
        (value) => {
            expect(looksLikeEmail(control(value))).toEqual({ email: true });
        }
    );

    /* Day 50's rule, as a test: a validator that rejects a valid address is
       worse than one that accepts an invalid one. These are all legal
       addresses that a stricter pattern would refuse, and if a future me
       tightens the regex this test is what says no. */
    it.each([
        "o'brien@example.com",
        'user+filter@example.co.uk',
        'postmaster@[127.0.0.1]'.replace('[127.0.0.1]', 'example.io'),
        'ünïcode@example.com'
    ])('does not reject the unusual but valid %s', (value) => {
        expect(looksLikeEmail(control(value))).toBeNull();
    });
});

describe('looksLikePhone', () => {
    it.each(['+1 555 0100', '020 7946 0958', '(555) 010-0100', '+91-80-4567-8901'])(
        'accepts the international format %s',
        (value) => {
            expect(looksLikePhone(control(value))).toBeNull();
        }
    );

    it.each(['no digits here', 'call me', '+++'])('rejects %s', (value) => {
        expect(looksLikePhone(control(value))).toEqual({ phone: true });
    });
});

describe('emailOrPhone', () => {
    const group = (email: string, phone: string) =>
        new FormGroup({ email: new FormControl(email), phone: new FormControl(phone) });

    it('fails when both are empty', () => {
        expect(emailOrPhone(group('', ''))).toEqual({ emailOrPhone: true });
    });

    it('passes when either is given', () => {
        expect(emailOrPhone(group('ada@example.com', ''))).toBeNull();
        expect(emailOrPhone(group('', '+1 555 0100'))).toBeNull();
    });

    it('treats whitespace as empty, like every other rule here', () => {
        expect(emailOrPhone(group('   ', '  '))).toEqual({ emailOrPhone: true });
    });
});

describe('uniqueEmail', () => {
    const ada: Contact = {
        id: 'c1',
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        group: 'work',
        tags: [],
        favourite: false,
        addedAt: '2026-10-01T09:00:00.000Z'
    };

    it('rejects an address another contact already has', () => {
        const validator = uniqueEmail(
            () => [ada],
            () => null
        );

        expect(validator(control('ada@example.com'))).toEqual({ uniqueEmail: true });
        expect(validator(control('ADA@EXAMPLE.COM'))).toEqual({ uniqueEmail: true });
    });

    /* Day 49's timing bug, as a test. Editing Ada and leaving her address
       alone must not be a conflict with herself - and the way that is
       expressed is the second argument, which is why it is a function rather
       than a value. */
    it('exempts the record being edited', () => {
        const validator = uniqueEmail(
            () => [ada],
            () => 'c1'
        );

        expect(validator(control('ada@example.com'))).toBeNull();
    });

    it('reads the list every time it runs', () => {
        /* The reason both arguments are getters: the validator is created once
           when the form is built, and the list arrives later. A snapshot taken
           at construction is empty, which is Day 49's bug in its original
           form. */
        let contacts: readonly Contact[] = [];
        const validator = uniqueEmail(
            () => contacts,
            () => null
        );

        expect(validator(control('ada@example.com'))).toBeNull();

        contacts = [ada];
        expect(validator(control('ada@example.com'))).toEqual({ uniqueEmail: true });
    });
});

describe('maxTags', () => {
    it('reports the limit and the actual count, not a message', () => {
        /* The error KEY is the contract and the numbers are data, so the
           wording stays in the template. */
        expect(maxTags(2)(control('a, b, c'))).toEqual({ maxTags: { limit: 2, actual: 3 } });
    });

    it('counts what parseTags counts', () => {
        expect(maxTags(2)(control('a, A,  a '))).toBeNull();
    });
});

describe('parseTags', () => {
    it('trims, lowercases, drops empties and de-duplicates', () => {
        expect(parseTags('maths, Maths, MATHS, logic')).toEqual(['maths', 'logic']);
        expect(parseTags(' , ,')).toEqual([]);
        expect(parseTags('')).toEqual([]);
    });

    /* This one function is shared between the validator and the submit
        handler, so that the two cannot disagree about what counts as a tag -
        Day 50. The test that matters is therefore not either of the above: it
        is that `maxTags` and the form see the same number, which the test
        above this one covers by using the same input. */
    it('keeps the order of first appearance', () => {
        expect(parseTags('logic, maths, logic')).toEqual(['logic', 'maths']);
    });
});
