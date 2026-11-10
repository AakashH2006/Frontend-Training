/* Day 54, rewritten on Day 55 - the service, which is now a pipeline.

   Day 54's version of this file tested a service that loaded once and derived
   the rest with computeds. The assertions were about state. These are about
   SEQUENCING: which request was made, which was abandoned, and which was never
   made at all - and that is only testable because `HttpTestingController`
   holds requests open and lets the test decide who answers.

   Two mechanics carried over from Day 54's directory spec, and both are
   consequences of this app being zoneless.

   TIME IS THE RUNNER'S, NOT ANGULAR'S. `fakeAsync` and `tick` are zone.js
   APIs and there is no zone.js here, so nothing in this file needs them: the
   pipeline has no `debounceTime` (the debounce moved to the contacts page's
   navigation on Day 55) and every step is driven by a flush.

   CHANGE DETECTION IS EXPLICIT. `toObservable` watches its signal with an
   effect, so `setQuery` does not reach the stream until effects run.
   `TestBed.tick()` is what runs them, and leaving it out is the quiet failure
   Day 54 measured: the tests that assert a request happened fail loudly, and
   the ones that assert nothing happened pass for the wrong reason. */

import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ContactsService, DEFAULT_QUERY, queryFromParams } from './contacts.service';
import { type ContactQuery } from './contacts.api';
import { type Contact } from './domain';

const ADA: Contact = {
    id: 'c1',
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    group: 'work',
    tags: ['maths'],
    favourite: true,
    addedAt: '2026-10-01T09:00:00.000Z'
};

const GRACE: Contact = {
    id: 'c2',
    name: 'Grace Hopper',
    phone: '+1 555 0100',
    group: 'work',
    tags: ['compilers'],
    favourite: false,
    addedAt: '2026-10-02T09:00:00.000Z'
};

const envelope = (over: Record<string, unknown> = {}) => ({
    contacts: [ADA, GRACE],
    matched: 2,
    total: 2,
    page: 1,
    pages: 1,
    counts: { family: 0, friends: 0, work: 2, other: 0 },
    favourites: 1,
    ...over
});

describe('ContactsService', () => {
    let http: HttpTestingController;

    beforeEach(() => {
        TestBed.configureTestingModule({
            providers: [provideHttpClient(), provideHttpClientTesting()]
        });

        http = TestBed.inject(HttpTestingController);
    });

    afterEach(() => {
        /* `ignoreCancelled`, because the point of `switchMap` is that there
           are cancelled requests. Without it this is a failing assertion in
           every test that changes its mind - a good default and the wrong one
           here. */
        http.verify({ ignoreCancelled: true });
    });

    /* The first request, and Day 55 moved it twice.

       Day 54's service called `refresh()` in its CONSTRUCTOR and subscribed by
       hand, so injecting it made a request there and then. This one has no
       constructor at all, and two things had to be learned the hard way.

       1. `toSignal` subscribes when the field is initialised, but what it
          subscribes to is `toObservable`, which watches the signal with an
          EFFECT - and an effect does not run until change detection does. So
          nothing reaches the stream until `TestBed.tick()`. Leaving it out
          fails every test below with

              Error: Expected one matching request for criteria
              "Match by function: ", found none.

       2. The service does not ask for anything until a page sets a query.
          That was not the original design; the router spec found that a cold
          /contacts/c1 was fetching a list nobody was looking at, and the fix
          was to start from `null`. So this helper has to set a query, which
          makes every test's first line honest about what causes a request.

       In the application neither point is visible: the first change detection
       follows bootstrap, and the contacts page sets a query in its own effect.
       Both are very visible to a resolver that injects this service outside a
       component, which is Day 56. */
    const start = (query: Partial<ContactQuery> = {}) => {
        const service = TestBed.inject(ContactsService);

        /* Nothing yet. */
        http.expectNone(() => true);

        service.setQuery({ ...DEFAULT_QUERY, ...query });
        TestBed.tick();

        const request = http.expectOne((candidate) => candidate.url === '/api/contacts');
        return { service, request };
    };

    const ready = (over: Record<string, unknown> = {}) => {
        const { service, request } = start();
        request.flush(envelope(over));
        return service;
    };

    const setQuery = (service: ContactsService, query: Partial<ContactQuery>) => {
        service.setQuery({ ...DEFAULT_QUERY, ...query });
        /* The effect behind `toObservable`. Without this the stream never
           sees the new query and the expectOne below fails with "found
           none". */
        TestBed.tick();
    };

    const latest = () => http.match((request) => request.url === '/api/contacts').at(-1);

    /* ---- the three states ---- */

    it('asks as soon as it exists and reports the three states in order', () => {
        const { service, request } = start();

        expect(service.status()).toBe('loading');
        expect(service.contacts()).toEqual([]);

        request.flush(envelope());

        expect(service.status()).toBe('ready');
        expect(service.contacts().length).toBe(2);
        expect(service.error()).toBeNull();
    });

    it('starts empty rather than seeded, so nothing flashes', () => {
        const { service, request } = start();

        /* Day 52's change: Day 50's service started from SEED_CONTACTS, which
           over HTTP would mean rendering three contacts that are not the ones
           the server has. */
        expect(service.contacts()).toEqual([]);
        request.flush(envelope({ contacts: [], matched: 0, total: 0 }));
        expect(service.total()).toBe(0);
    });

    it('reports a failed load with a message fit to render', () => {
        const { service, request } = start();

        request.flush({ message: 'nope' }, { status: 500, statusText: 'Server Error' });

        expect(service.status()).toBe('failed');
        expect(service.error()?.kind).toBe('server');
        expect(service.contacts()).toEqual([]);
    });

    it('keeps working after a failure, because catchError is inside the switchMap', () => {
        const { service, request } = start();
        request.flush(null, { status: 500, statusText: 'Server Error' });
        expect(service.status()).toBe('failed');

        setQuery(service, { q: 'ada' });

        /* The whole reason `catchError` is where it is. Outside the
           `switchMap` the stream would have ended above, this request would
           never be made, and the screen would be dead for the rest of the
           session - silently, because "the pipeline is finished" has no error
           state. */
        latest()?.flush(envelope({ contacts: [ADA], matched: 1 }));

        expect(service.status()).toBe('ready');
        expect(service.error()).toBeNull();
        expect(service.contacts()).toEqual([ADA]);
    });

    /* ---- Day 55: the query drives the requests ---- */

    it('asks again when the query changes', () => {
        const service = ready();

        setQuery(service, { q: 'hopper' });

        const request = http.expectOne('/api/contacts?sort=added&page=1&q=hopper');
        request.flush(envelope({ contacts: [GRACE], matched: 1 }));

        expect(service.contacts()).toEqual([GRACE]);
    });

    it('does not ask again for a query it has already answered', () => {
        const service = ready();

        setQuery(service, { q: 'ada' });
        latest()?.flush(envelope({ contacts: [ADA], matched: 1 }));

        /* Setting the identical query. `distinctUntilChanged` compares the
           four fields, so this is the same question and no request is made -
           which is the difference between a signal that a component writes on
           every change detection and a request per keystroke. */
        setQuery(service, { q: 'ada' });

        http.expectNone(() => true);
        expect(service.contacts()).toEqual([ADA]);
    });

    it('abandons the request for a query the user has moved on from', () => {
        const service = ready();

        setQuery(service, { q: 'a' });
        const broad = http.expectOne('/api/contacts?sort=added&page=1&q=a');

        setQuery(service, { q: 'ada' });
        const precise = http.expectOne('/api/contacts?sort=added&page=1&q=ada');

        /* `switchMap`, asserted in two lines. Day 53 needed a fake server that
           was slower for broader queries, two carefully spaced keystrokes and
           a DOM sampled every 120ms to see the same thing. */
        expect(broad.cancelled).toBe(true);
        expect(precise.cancelled).toBe(false);

        precise.flush(envelope({ contacts: [ADA], matched: 1 }));
        expect(service.contacts()).toEqual([ADA]);
    });

    it('cannot be given a stale answer, because nothing is listening for one', () => {
        const service = ready();

        setQuery(service, { q: 'a' });
        const broad = http.expectOne('/api/contacts?sort=added&page=1&q=a');

        setQuery(service, { q: 'ada' });
        http.expectOne('/api/contacts?sort=added&page=1&q=ada')
            .flush(envelope({ contacts: [ADA], matched: 1 }));

        /* With `mergeMap` this would overwrite the list and the search box
           would disagree with it. Flushing a cancelled request throws instead,
           which is the testing backend refusing to let me simulate something
           that can no longer happen. */
        expect(() => broad.flush(envelope())).toThrow();
        expect(service.contacts()).toEqual([ADA]);
    });

    /* `refresh()` and `distinctUntilChanged` are in direct conflict, and the
       nonce is how that was resolved. This is the test that says so. */
    it('asks again for the same query when told to', () => {
        const service = ready();

        service.refresh();
        TestBed.tick();

        /* Same four fields, different nonce, so the key differs and the
           request is made. Without the nonce in the key this is `expectNone`
           and the Try again button does nothing - which is a bug that looks
           like a slow server. */
        const request = http.expectOne('/api/contacts?sort=added&page=1');
        request.flush(envelope({ contacts: [ADA], matched: 1 }));

        expect(service.contacts()).toEqual([ADA]);
    });

    /* ---- the numbers that are no longer derivable ---- */

    it('reports counts and totals from the envelope rather than from the rows', () => {
        const service = ready({
            contacts: [ADA],
            matched: 1,
            total: 97,
            page: 2,
            pages: 9,
            counts: { family: 3, friends: 4, work: 90, other: 0 },
            favourites: 12
        });

        /* One row on screen and 97 contacts on the server. Every one of these
           numbers would have been a computed over the loaded list on Day 50,
           and every one of them would now be wrong. */
        expect(service.contacts().length).toBe(1);
        expect(service.total()).toBe(97);
        expect(service.matched()).toBe(1);
        expect(service.pageNumber()).toBe(2);
        expect(service.pages()).toBe(9);
        expect(service.counts().work).toBe(90);
        expect(service.favourites()).toBe(12);
    });

    it('keeps the previous page on screen while the next one loads', () => {
        const service = ready({ pages: 2 });

        setQuery(service, { page: 2 });

        /* The `scan` in the pipeline. The status says loading and the rows
           are still there, so the list dims instead of blanking - and a
           template that reads `contacts().length === 0` to decide whether to
           show a spinner gets the right answer. */
        expect(service.status()).toBe('loading');
        expect(service.contacts().length).toBe(2);

        latest()?.flush(envelope({ contacts: [ADA], page: 2, pages: 2 }));

        expect(service.status()).toBe('ready');
        expect(service.contacts()).toEqual([ADA]);
    });

    it('keeps the last good page when a reload fails', () => {
        const service = ready();

        service.refresh();
        TestBed.tick();
        latest()?.flush(null, { status: 500, statusText: 'Server Error' });

        /* A failed re-check does not throw away a good page. The first load
           failing is different - there is nothing to keep - and the test
           above covers that. */
        expect(service.status()).toBe('failed');
        expect(service.contacts().length).toBe(2);
    });

    it('reports per-page skipped counts', () => {
        const service = ready({
            contacts: [ADA, { ...ADA, id: 'c9', group: 'colleagues' }],
            matched: 2,
            total: 2
        });

        expect(service.contacts().length).toBe(1);
        expect(service.skipped()).toBe(1);
    });

    /* ---- the cold-observable test, which is the one I would have got wrong ---- */

    it('does not count a mutation that was never subscribed to', () => {
        const service = ready();

        /* Building the request without sending it. The `defer` in `mutate` is
           what makes this harmless: the counter is incremented on subscribe,
           not on the call. Without it, `busy()` would be true here and would
           stay true for the life of the app. */
        service.add({ name: 'Nobody', email: 'n@example.com', group: 'other', tags: [], favourite: false });

        expect(service.busy()).toBe(false);
        http.expectNone(() => true);
    });

    it('is busy only while a mutation is in flight', () => {
        const service = ready();

        service
            .add({ name: 'Alan Turing', email: 'alan@example.com', group: 'work', tags: [], favourite: false })
            .subscribe();

        expect(service.busy()).toBe(true);

        http.expectOne((request) => request.method === 'POST').flush({ ...ADA, id: 'srv-1' });

        expect(service.busy()).toBe(false);
        /* And the write triggered a reload, which is the next test. */
        TestBed.tick();
        latest()?.flush(envelope());
    });

    it('counts overlapping mutations rather than toggling a flag', () => {
        const service = ready();

        service.setFavourite('c1', false).subscribe();
        service.setFavourite('c2', true).subscribe();

        const [first, second] = http.match((request) => request.method === 'PATCH');

        expect(service.busy()).toBe(true);
        first?.flush({ ...ADA, favourite: false });
        /* A boolean would have been cleared by the first answer. */
        expect(service.busy()).toBe(true);
        second?.flush({ ...GRACE, favourite: true });
        expect(service.busy()).toBe(false);

        TestBed.tick();
        for (const reload of http.match((request) => request.url === '/api/contacts')) {
            reload.flush(envelope());
        }
    });

    /* ---- Day 55: a write reloads rather than guesses ---- */

    it('re-asks the server after a successful write instead of patching the list', () => {
        const service = ready();

        service
            .add({ name: 'Alan Turing', email: 'alan@example.com', group: 'work', tags: [], favourite: false })
            .subscribe();

        http.expectOne((request) => request.method === 'POST').flush({
            id: 'srv-generated',
            name: 'Alan Turing',
            email: 'alan@example.com',
            group: 'work',
            tags: [],
            favourite: false,
            addedAt: '2026-11-10T00:00:00.000Z'
        });

        TestBed.tick();

        /* Day 52 spliced the created row into the local array. The client
           cannot know what adding a contact does to a server-side page: the
           new row may sort onto page 1, push one onto page 2, change
           `matched`, change `pages` and change a group count. So it asks. */
        const reload = http.expectOne('/api/contacts?sort=added&page=1');
        reload.flush(envelope({ contacts: [ADA], matched: 3, total: 3 }));

        expect(service.total()).toBe(3);
    });

    it('does not reload when a write is refused', () => {
        const service = ready();
        const errors: unknown[] = [];

        service
            .add({ name: 'Margaret', email: 'margaret@example.com', group: 'work', tags: [], favourite: false })
            .subscribe({ error: (error: unknown) => errors.push(error) });

        http.expectOne((request) => request.method === 'POST').flush(
            { message: 'Another contact already uses margaret@example.com.' },
            { status: 409, statusText: 'Conflict' }
        );

        TestBed.tick();

        /* The `tap` that calls `refresh()` is on the success path only, so a
           409 costs one request rather than two - and the list on screen is
           still correct, because nothing changed on the server. */
        http.expectNone(() => true);
        expect(service.total()).toBe(2);
        expect(errors.length).toBe(1);
    });

    /* Day 52's decision, and the test that pins it down. */
    it('treats a 404 on a delete as the outcome the user asked for', () => {
        const service = ready();
        let completed = false;

        service.remove('c1').subscribe({ complete: () => { completed = true; } });

        http.expectOne('/api/contacts/c1').flush(
            { message: 'No such contact.' },
            { status: 404, statusText: 'Not Found' }
        );

        expect(completed).toBe(true);

        TestBed.tick();
        /* And it still reloads, because a successful delete changes the page
           - which is exactly why "404 means success" has to be decided before
           the `tap`, not after. */
        latest()?.flush(envelope({ contacts: [GRACE], matched: 1, total: 1 }));
        expect(service.total()).toBe(1);
    });

    it('does not treat any other failure as a delete', () => {
        const service = ready();
        const errors: unknown[] = [];

        service.remove('c1').subscribe({ error: (error: unknown) => errors.push(error) });

        http.expectOne('/api/contacts/c1').flush(null, { status: 500, statusText: 'Server Error' });

        expect(errors.length).toBe(1);
        TestBed.tick();
        http.expectNone(() => true);
        expect(service.contacts().length).toBe(2);
    });

    /* ---- one contact ---- */

    it('asks for one contact by id and does not store it', () => {
        const service = ready();
        const seen: Contact[] = [];

        service.one('c9').subscribe((contact) => seen.push(contact));

        http.expectOne('/api/contacts/c9').flush({ ...ADA, id: 'c9', name: 'Katherine Johnson' });

        expect(seen[0]?.name).toBe('Katherine Johnson');
        /* Not added to the list. `one()` is a request, not a cache fill - and
           a contact that is not on this page must not appear on it. */
        expect(service.contacts().map((c) => c.id)).toEqual(['c1', 'c2']);
    });

    /* ---- the parameter guards ---- */

    it('turns URL text into a query, including the text that is not a query', () => {
        expect(queryFromParams({})).toEqual(DEFAULT_QUERY);

        expect(queryFromParams({ q: 'ada', filter: 'work', sort: 'name', page: '3' })).toEqual({
            q: 'ada',
            filter: 'work',
            sort: 'name',
            page: 3
        });

        /* Day 51 put `javascript:alert(1)` in the address bar to see what
           happened. These are the same guards, now with a number in the mix -
           and a URL is typed by people and written by other programs, so all
           four of these are reachable. */
        expect(queryFromParams({ filter: 'javascript:alert(1)', sort: 'nonsense' })).toEqual({
            ...DEFAULT_QUERY,
            q: ''
        });

        expect(queryFromParams({ page: 'abc' }).page).toBe(1);
        expect(queryFromParams({ page: '-3' }).page).toBe(1);
        expect(queryFromParams({ page: '0' }).page).toBe(1);
        /* The top end is NOT clamped here, because only the server knows how
           many pages there are. It answers with the last one and the page
           corrects its own URL. */
        expect(queryFromParams({ page: '999' }).page).toBe(999);
    });

    it('knows whether it is filtering, which decides which empty state shows', () => {
        const service = ready();

        expect(service.filtering()).toBe(false);

        setQuery(service, { q: 'nobody' });
        expect(service.filtering()).toBe(true);
        latest()?.flush(envelope({ contacts: [], matched: 0 }));

        setQuery(service, { filter: 'work' });
        expect(service.filtering()).toBe(true);
        latest()?.flush(envelope());

        setQuery(service, {});
        expect(service.filtering()).toBe(false);
        latest()?.flush(envelope());
    });

    it('derives the tag suggestions from the rows it has, and says no more', () => {
        const service = ready();

        /* The one surviving computed, and it is deliberately weaker than Day
           50's `allTags`: it can only suggest tags that are on this page. A
           full list would need an endpoint for tags. */
        expect(service.visibleTags()).toEqual(['compilers', 'maths']);
    });
});
