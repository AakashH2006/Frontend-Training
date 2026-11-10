/* Day 54 - the guards, which are the easiest things in the project to test
   and the right place to start.

   They are pure functions over `unknown`, so there is no TestBed, no fixture
   and no DOM: the test is the function's contract written down. Day 37 started
   the React week with the reducer for the same reason. */

import { describe, expect, it } from 'vitest';

import { isContact, isFilter, isGroup, isSort } from './domain';

describe('isGroup', () => {
    it('accepts the four groups', () => {
        expect(isGroup('work')).toBe(true);
        expect(isGroup('family')).toBe(true);
    });

    it('rejects anything else, including the near miss in the fixture', () => {
        /* "colleagues" is the group on the fifth row of
           public/api/contacts.json, which exists to be rejected. */
        expect(isGroup('colleagues')).toBe(false);
        expect(isGroup('')).toBe(false);
        expect(isGroup(undefined)).toBe(false);
        expect(isGroup(['work'])).toBe(false);
    });
});

describe('isFilter and isSort', () => {
    it('accept what the URL is allowed to contain', () => {
        expect(isFilter('favourites')).toBe(true);
        expect(isFilter('work')).toBe(true);
        expect(isSort('name')).toBe(true);
    });

    it('reject what Day 51 put in the address bar', () => {
        expect(isFilter('javascript:alert(1)')).toBe(false);
        expect(isSort('nonsense')).toBe(false);
    });
});

describe('isContact', () => {
    const valid = {
        id: 'c1',
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        group: 'work',
        tags: ['maths'],
        favourite: true,
        addedAt: '2026-10-01T09:00:00.000Z'
    };

    it('accepts a full record', () => {
        expect(isContact(valid)).toBe(true);
    });

    it('accepts one with every optional field missing', () => {
        const { email: _email, ...rest } = valid;
        expect(isContact(rest)).toBe(true);
    });

    /* A table, because eight nearly identical `it` blocks is the thing Day 37
       said tests are allowed to avoid. The message names the field, so a
       failure says which case broke. */
    const broken: readonly [string, unknown][] = [
        ['null', null],
        ['a string', 'Ada'],
        ['no id', { ...valid, id: undefined }],
        ['a numeric id', { ...valid, id: 1 }],
        ['an unknown group', { ...valid, group: 'colleagues' }],
        ['tags that are not an array', { ...valid, tags: 'maths' }],
        ['tags containing a number', { ...valid, tags: ['maths', 7] }],
        ['favourite as a string', { ...valid, favourite: 'yes' }],
        ['an email that is a number', { ...valid, email: 42 }]
    ];

    it.each(broken)('rejects %s', (_label, value) => {
        expect(isContact(value)).toBe(false);
    });
});
