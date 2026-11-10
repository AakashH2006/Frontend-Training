/* Day 54 - the service, which is where the interesting assertions are.

   A service test needs the TestBed, because the thing under test uses
   `inject()`. What it does not need is any component, template or DOM, which
   makes these the fastest useful tests in the project.

   One wrinkle that shaped every test here: `ContactsService` loads in its
   CONSTRUCTOR, so the first request happens when it is first injected. There
   is no way to inject it without that happening - which is correct behaviour
   and makes the tests read oddly at first, because every one of them starts by
   answering a request nobody in the test asked for. */

import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ContactsService } from './contacts.service';
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

describe('ContactsService', () => {
    let http: HttpTestingController;

    beforeEach(() => {
        TestBed.configureTestingModule({
            providers: [provideHttpClient(), provideHttpClientTesting()]
        });

        http = TestBed.inject(HttpTestingController);
    });

    afterEach(() => {
        http.verify();
    });

    /* Injecting the service is what starts the load, so this helper is also
       the "arrange" step of every test below. */
    const start = () => {
        const service = TestBed.inject(ContactsService);
        const request = http.expectOne('/api/contacts');
        return { service, request };
    };

    const ready = (contacts: readonly unknown[] = [ADA, GRACE]) => {
        const { service, request } = start();
        request.flush({ contacts });
        return service;
    };

    it('loads on construction and reports the three states in order', () => {
        const { service, request } = start();

        expect(service.status()).toBe('loading');
        expect(service.contacts()).toEqual([]);

        request.flush({ contacts: [ADA, GRACE] });

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
        request.flush({ contacts: [] });
        expect(service.total()).toBe(0);
    });

    it('keeps the rows it can read and counts the ones it cannot', () => {
        const service = ready([ADA, { ...ADA, id: 'c9', group: 'colleagues' }]);

        expect(service.total()).toBe(1);
        expect(service.skipped()).toBe(1);
    });

    it('reports a failed load with a message fit to render', () => {
        const { service, request } = start();

        request.flush({ message: 'nope' }, { status: 500, statusText: 'Server Error' });

        expect(service.status()).toBe('failed');
        expect(service.error()?.kind).toBe('server');
        expect(service.contacts()).toEqual([]);
    });

    it('retries from failed back to ready', () => {
        const { service, request } = start();
        request.flush(null, { status: 500, statusText: 'Server Error' });
        expect(service.status()).toBe('failed');

        service.refresh();

        expect(service.status()).toBe('loading');
        http.expectOne('/api/contacts').flush({ contacts: [ADA] });

        expect(service.status()).toBe('ready');
        expect(service.error()).toBeNull();
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
        http.expectNone('/api/contacts');
    });

    it('is busy only while a mutation is in flight', () => {
        const service = ready();

        service
            .add({ name: 'Alan Turing', email: 'alan@example.com', group: 'work', tags: [], favourite: false })
            .subscribe();

        expect(service.busy()).toBe(true);

        http.expectOne('/api/contacts').flush({ ...ADA, id: 'srv-1', name: 'Alan Turing' });

        expect(service.busy()).toBe(false);
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
    });

    /* ---- what the server says is what the state becomes ---- */

    it('stores the record the server created, not the draft it was sent', () => {
        const service = ready([]);

        service
            .add({ name: 'Alan Turing', email: 'alan@example.com', group: 'work', tags: [], favourite: false })
            .subscribe();

        http.expectOne('/api/contacts').flush({
            id: 'srv-generated',
            name: 'Alan Turing',
            email: 'alan@example.com',
            group: 'work',
            tags: [],
            favourite: false,
            addedAt: '2026-11-10T00:00:00.000Z'
        });

        expect(service.contacts()[0]?.id).toBe('srv-generated');
        expect(service.contacts()[0]?.addedAt).toBe('2026-11-10T00:00:00.000Z');
    });

    it('leaves the list alone when a save is refused', () => {
        const service = ready();
        const errors: unknown[] = [];

        service
            .add({ name: 'Margaret', email: 'margaret@example.com', group: 'work', tags: [], favourite: false })
            .subscribe({ error: (error: unknown) => errors.push(error) });

        http.expectOne('/api/contacts').flush(
            { message: 'Another contact already uses margaret@example.com.' },
            { status: 409, statusText: 'Conflict' }
        );

        expect(service.total()).toBe(2);
        expect(errors.length).toBe(1);
    });

    /* Day 52's decision, and the test that pins it down. */
    it('treats a 404 on a delete as the outcome the user asked for', () => {
        const service = ready();
        let completed = false;

        service.remove('c1').subscribe({ complete: () => { completed = true; } });

        http.expectOne('/api/contacts/c1').flush({ message: 'No such contact.' }, { status: 404, statusText: 'Not Found' });

        expect(completed).toBe(true);
        expect(service.byId('c1')).toBeUndefined();
        expect(service.total()).toBe(1);
    });

    it('does not treat any other failure as a delete', () => {
        const service = ready();
        const errors: unknown[] = [];

        service.remove('c1').subscribe({ error: (error: unknown) => errors.push(error) });

        http.expectOne('/api/contacts/c1').flush(null, { status: 500, statusText: 'Server Error' });

        expect(errors.length).toBe(1);
        expect(service.byId('c1')).toBeDefined();
    });

    /* ---- the derived state from Week 10, now over loaded data ---- */

    it('derives counts, favourites and tags from whatever arrived', () => {
        const service = ready();

        expect(service.counts().work).toBe(2);
        expect(service.counts().family).toBe(0);
        expect(service.favourites()).toBe(1);
        expect(service.allTags()).toEqual(['compilers', 'maths']);
    });

    it('filters, searches and sorts without asking the server again', () => {
        const service = ready();

        service.setQuery('hopper');
        expect(service.visible().map((c) => c.name)).toEqual(['Grace Hopper']);

        service.setQuery('compilers');
        expect(service.visible().map((c) => c.name)).toEqual(['Grace Hopper']);

        service.setQuery('');
        service.setFilter('favourites');
        expect(service.visible().map((c) => c.name)).toEqual(['Ada Lovelace']);

        service.setFilter('all');
        service.setSort('name');
        expect(service.visible().map((c) => c.name)).toEqual(['Ada Lovelace', 'Grace Hopper']);

        /* The point of the test: none of that was a request. `verify()` in the
           afterEach is what proves it. */
    });

    it('reports whether it is filtering, which decides which empty state shows', () => {
        const service = ready();

        expect(service.filtering()).toBe(false);
        service.setQuery('nobody');
        expect(service.filtering()).toBe(true);
        expect(service.visible()).toEqual([]);
        service.clearFilters();
        expect(service.filtering()).toBe(false);
    });
});
