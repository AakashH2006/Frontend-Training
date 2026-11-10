/* Day 54 - testing the pipeline, which is the day's best argument for tests
   over probes.

   Day 53 proved `switchMap` with a stopwatch: a fake server made deliberately
   slower for broad queries, two queries typed 300ms apart, and a sampled list
   of what the DOM showed at 120ms intervals. It worked, it took three attempts
   to make deterministic, and the first version silently passed for the wrong
   reason because the latency spread was narrower than the debounce.

   Here the same guarantee is four lines, and the timing is not involved at
   all: the test holds both requests and decides which one answers.

   Two mechanics are new.

   TIME IS THE RUNNER'S, NOT ANGULAR'S. The usual Angular answer is
   `fakeAsync` and `tick`, which are zone.js APIs - and this app has no
   zone.js, because Angular 22 is zoneless by default. So `vi.useFakeTimers()`
   controls `debounceTime` instead, which is simpler and works on any
   scheduler the runner has patched.

   CHANGE DETECTION IS EXPLICIT. `toObservable` watches its signal with an
   effect, so a `setQuery` does not reach the stream until effects run.
   `TestBed.tick()` is what runs them. Taking it out again to see what it
   bought: four of these twelve tests fail, all with

       Error: Expected one matching request for criteria
       "Match URL: /api/directory?q=jennifer", found none.

   and the eight that still pass are the ones asserting that NOTHING was
   requested - which would pass whether or not the code works. A missing
   `tick()` therefore does not break a test suite loudly; it quietly turns
   half of it into a tautology. */

import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DirectoryService } from './directory.service';
import { type DirectoryEntry } from './directory.api';

const DOUDNA: DirectoryEntry = {
    id: 'd20',
    name: 'Jennifer Doudna',
    title: 'Biochemist',
    email: 'jennifer@example.org'
};

const DOROTHY: DirectoryEntry = {
    id: 'd5',
    name: 'Dorothy Hodgkin',
    title: 'Chemist',
    email: 'dorothy@example.org'
};

const DEBOUNCE = 250;

describe('DirectoryService', () => {
    let service: DirectoryService;
    let http: HttpTestingController;

    beforeEach(() => {
        vi.useFakeTimers();

        TestBed.configureTestingModule({
            providers: [provideHttpClient(), provideHttpClientTesting()]
        });

        http = TestBed.inject(HttpTestingController);
        service = TestBed.inject(DirectoryService);
    });

    afterEach(() => {
        /* `ignoreCancelled`, because the point of `switchMap` is that there are
           cancelled requests. Without it this is a failing assertion in every
           test that changes its mind - which is a good default and the wrong
           one here. */
        http.verify({ ignoreCancelled: true });
        vi.useRealTimers();
    });

    /* Type a value and let it reach the stream, without letting the debounce
       expire. Every test needs this, and writing it out once is what made the
       two mechanics above obvious. */
    const type = (value: string) => {
        service.setQuery(value);
        TestBed.tick();
    };

    const settle = (ms = DEBOUNCE) => {
        vi.advanceTimersByTime(ms);
    };

    it('asks nothing while the query is below two characters', () => {
        type('j');
        settle();

        http.expectNone(() => true);
        expect(service.tooShort()).toBe(true);
    });

    it('collapses a burst of keystrokes into one request', () => {
        for (const value of ['j', 'je', 'jen', 'jenn', 'jenni', 'jennif', 'jennife', 'jennifer']) {
            type(value);
            /* 40ms between keystrokes: faster than the debounce, which is the
               case that matters. */
            settle(40);
        }

        settle();

        const request = http.expectOne('/api/directory?q=jennifer');
        expect(request.request.method).toBe('GET');
        /* The intermediate queries were never asked for. `expectOne` would
           have failed if any of them had been. */
        request.flush({ people: [DOUDNA] });

        expect(service.results()).toEqual([DOUDNA]);
    });

    it('does not ask again for a query it has already answered', () => {
        type('doudna');
        settle();
        http.expectOne('/api/directory?q=doudna').flush({ people: [DOUDNA] });

        /* Selecting all and retyping the same word: the signal changes, the
           string does not. */
        type('');
        type('doudna');
        settle();

        http.expectNone('/api/directory?q=doudna');
        expect(service.results()).toEqual([DOUDNA]);
    });

    it('trims before it compares, so trailing spaces are not a new query', () => {
        type('doudna');
        settle();
        http.expectOne('/api/directory?q=doudna').flush({ people: [DOUDNA] });

        type('doudna  ');
        settle();

        http.expectNone(() => true);
    });

    /* ---- the race, without a stopwatch ---- */

    it('abandons the request for a query the user has moved on from', () => {
        type('do');
        settle();
        const broad = http.expectOne('/api/directory?q=do');

        type('doudna');
        settle();
        const precise = http.expectOne('/api/directory?q=doudna');

        /* This is the whole of what switchMap does, and it is one assertion.
           Day 53 needed a server that was slower for broader queries, two
           carefully spaced keystrokes and a sampled DOM to see the same
           thing. */
        expect(broad.cancelled).toBe(true);
        expect(precise.cancelled).toBe(false);

        precise.flush({ people: [DOUDNA] });
        expect(service.results()).toEqual([DOUDNA]);
    });

    it('cannot be given a stale answer, because nothing is listening for one', () => {
        type('do');
        settle();
        const broad = http.expectOne('/api/directory?q=do');

        type('doudna');
        settle();
        http.expectOne('/api/directory?q=doudna').flush({ people: [DOUDNA] });

        /* With `mergeMap` this would overwrite the results and the search box
           would disagree with the list - which is exactly what Day 53
           measured. Flushing a cancelled request throws instead, which is the
           testing backend refusing to let me simulate something that can no
           longer happen. */
        expect(() => broad.flush({ people: [DOROTHY, DOUDNA] })).toThrow();
        expect(service.results()).toEqual([DOUDNA]);
    });

    /* ---- the error handling that Day 53 could only describe ---- */

    it('reports a failed search and keeps working afterwards', () => {
        type('doudna');
        settle();
        http.expectOne('/api/directory?q=doudna').flush(null, {
            status: 500,
            statusText: 'Server Error'
        });

        expect(service.error()).toContain('failed');
        expect(service.results()).toEqual([]);
        expect(service.searching()).toBe(false);

        /* The reason `catchError` is INSIDE the switchMap. If it were outside,
           the stream would have ended above and this request would never
           happen - the search box would be dead for the rest of the session,
           silently. */
        type('dorothy');
        settle();
        http.expectOne('/api/directory?q=dorothy').flush({ people: [DOROTHY] });

        expect(service.results()).toEqual([DOROTHY]);
        expect(service.error()).toBeNull();
    });

    it('is searching only while a search is in flight', () => {
        expect(service.searching()).toBe(false);

        type('doudna');
        settle();
        expect(service.searching()).toBe(true);

        http.expectOne('/api/directory?q=doudna').flush({ people: [DOUDNA] });
        expect(service.searching()).toBe(false);
    });

    it('clears back to nothing without asking the server', () => {
        type('doudna');
        settle();
        http.expectOne('/api/directory?q=doudna').flush({ people: [DOUDNA] });

        service.clear();
        TestBed.tick();
        settle();

        http.expectNone(() => true);
        expect(service.results()).toEqual([]);
        expect(service.tooShort()).toBe(false);
    });

    /* ---- shareReplay ---- */

    it('asks for the directory size once however many consumers there are', () => {
        const seen: number[] = [];

        service.size$.subscribe((total) => seen.push(total));
        service.size$.subscribe((total) => seen.push(total));

        /* One request for two subscribers. Without `shareReplay` this is two,
           and the only visible difference in the app is a line in the request
           log - which is why this assertion exists here instead. */
        http.expectOne('/api/directory/size').flush({ total: 24 });

        expect(seen).toEqual([24, 24]);
    });

    it('replays the remembered answer to a consumer that arrives later', () => {
        service.size$.subscribe();
        http.expectOne('/api/directory/size').flush({ total: 24 });

        const late: number[] = [];
        service.size$.subscribe((total) => late.push(total));

        /* `refCount: false` is what makes this work after the first
           subscriber has finished. With `refCount: true` this would be a
           second request. */
        http.expectNone('/api/directory/size');
        expect(late).toEqual([24]);
    });

    it('rejects a size that is not a number', () => {
        const errors: unknown[] = [];
        service.size$.subscribe({ error: (error: unknown) => errors.push(error) });

        http.expectOne('/api/directory/size').flush({ total: 'twenty-four' });

        expect(errors.length).toBe(1);
    });
});
