/* Day 56 - the session, which is four methods and one awkward truth.

   The awkward truth is in the first describe block: this is not a security
   boundary and the tests say so out loud rather than leaving somebody to
   discover it. What the service IS for is making the guard's behaviour
   explicable - there is a name, or there is not - and that part is worth
   testing properly, because the storage handling is the same shape as Day 50's
   and that one had a bug.

   `localStorage` is real here. jsdom provides it, it persists between tests in
   the same file, and the cleanup in `beforeEach` is load-bearing: the first
   version of this spec passed in isolation and failed when run after
   routes.spec.ts, because that file signs in. */

import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { SessionService } from './session.service';
import { SESSION_STORE_KEY } from './tokens';

const KEY = 'day56.session.spec';

describe('SessionService', () => {
    const create = () => {
        TestBed.resetTestingModule();
        TestBed.configureTestingModule({
            /* A key of this spec's own, so nothing here can disturb the real
               app's session or another spec's. The token exists for exactly
               this - Day 47's argument for tokens over constants, cashed in
               for the third time. */
            providers: [{ provide: SESSION_STORE_KEY, useValue: KEY }]
        });

        return TestBed.inject(SessionService);
    };

    beforeEach(() => {
        localStorage.removeItem(KEY);
    });

    it('starts with nobody signed in', () => {
        const session = create();

        expect(session.name()).toBeNull();
        expect(session.signedIn()).toBe(false);
    });

    it('remembers a name in storage', () => {
        create().signIn('Ada Lovelace');

        expect(localStorage.getItem(KEY)).toBe('Ada Lovelace');
    });

    it('reads a name written before it was constructed', () => {
        localStorage.setItem(KEY, 'Grace Hopper');

        /* The reload case, which is the only reason storage is involved at
           all: a guard that forgot you on every refresh would be worse than no
           guard, because the page would be unreachable by bookmark. */
        const session = create();

        expect(session.name()).toBe('Grace Hopper');
        expect(session.signedIn()).toBe(true);
    });

    it('trims the name and refuses one that is only spaces', () => {
        const session = create();

        session.signIn('   Katherine Johnson  ');
        expect(session.name()).toBe('Katherine Johnson');

        session.signIn('     ');
        /* UNCHANGED, not cleared. A refused sign-in must not sign the current
           person out - which is what an unguarded `set` would have done and
           what the sign-in page's own validation would have hidden, since it
           never submits an empty name. The service does not get to rely on its
           caller being careful. */
        expect(session.name()).toBe('Katherine Johnson');
    });

    it('treats whitespace already in storage as nobody', () => {
        localStorage.setItem(KEY, '   ');

        expect(create().signedIn()).toBe(false);
    });

    it('forgets the name and removes the key on the way out', () => {
        const session = create();
        session.signIn('Ada');

        session.signOut();

        expect(session.name()).toBeNull();
        /* `removeItem`, not `setItem('')`. An empty string would be read back
           as nobody by the guard above - so the difference is invisible to
           this app and visible to anybody reading the storage inspector, which
           is reason enough. */
        expect(localStorage.getItem(KEY)).toBeNull();
    });

    it('is not a security boundary, and this is what that means', () => {
        localStorage.setItem(KEY, 'Somebody Else');

        /* Two lines. That is the whole bypass, and writing it as a passing
           test is the most honest comment I can leave on the feature: the
           guard decides what to RENDER. Anything that actually needs
           protecting is protected by whatever answers the request, which in
           this app is a fake server that would hand its data to anyone. */
        expect(create().name()).toBe('Somebody Else');
    });
});
