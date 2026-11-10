/* Day 54 - the API boundary, with `HttpTestingController`.

   This is the spec that changed my mind about Angular's testing tools. Every
   "Verification" section for three days has been a probe: build the app, load
   the bundle into jsdom, click things, read the DOM. It works and it is slow,
   indirect, and unable to assert anything about a request that was never made.

   `HttpTestingController` replaces the HTTP backend with one that queues
   requests and hands them to the test. So a test can say what was asked for,
   answer it with whatever it likes, and - the part a probe cannot do - assert
   that NOTHING was asked for.

       http.expectOne('/api/contacts')     one request, and this is it
       http.expectNone('/api/contacts')    no request happened
       http.verify()                       nothing is left unanswered

   That last one is the quiet value: `verify()` in an `afterEach` turns "my
   code fired an extra request I did not know about" from an invisible
   performance bug into a failing test. */

import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ApiError } from './api-error';
import { ContactsApi, type ContactList } from './contacts.api';
import { type Contact, type ContactDraft } from './domain';
import { API_BASE } from './tokens';

const ADA: Contact = {
    id: 'c1',
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    group: 'work',
    tags: ['maths'],
    favourite: true,
    addedAt: '2026-10-01T09:00:00.000Z'
};

const DRAFT: ContactDraft = {
    name: 'Alan Turing',
    email: 'alan@example.com',
    group: 'work',
    tags: ['logic'],
    favourite: false
};

describe('ContactsApi', () => {
    let api: ContactsApi;
    let http: HttpTestingController;

    beforeEach(() => {
        TestBed.configureTestingModule({
            /* `provideHttpClientTesting()` replaces the backend and nothing
               else, so the interceptors, the error mapping and the parsers are
               all the real ones. The thing under test is the code I wrote; the
               thing replaced is the network. */
            providers: [provideHttpClient(), provideHttpClientTesting()]
        });

        api = TestBed.inject(ContactsApi);
        http = TestBed.inject(HttpTestingController);
    });

    afterEach(() => {
        http.verify();
    });

    /* The day's first test, and the one I would not have thought to write
       before Day 52: calling the method does nothing at all. */
    it('makes no request until something subscribes', () => {
        const request$ = api.list();

        http.expectNone('/api/contacts');

        request$.subscribe();
        http.expectOne('/api/contacts').flush({ contacts: [] });
    });

    it('makes one request per subscribe, because the observable is cold', () => {
        const request$ = api.list();

        request$.subscribe();
        request$.subscribe();

        /* `match` rather than `expectOne`, because expectOne FAILS when there
           are two - which is how I would find this out by accident. */
        const requests = http.match('/api/contacts');
        expect(requests.length).toBe(2);
        for (const request of requests) request.flush({ contacts: [] });
    });

    it('parses the envelope and counts the rows it cannot read', () => {
        const seen: ContactList[] = [];
        api.list().subscribe((list) => seen.push(list));

        http.expectOne('/api/contacts').flush({
            contacts: [
                ADA,
                { ...ADA, id: 'c5', group: 'colleagues' }, // the fixture's bad row
                'not a contact'
            ]
        });

        expect(seen[0]?.contacts.length).toBe(1);
        expect(seen[0]?.skipped).toBe(2);
    });

    it('rejects a response in the wrong shape rather than trusting the generic', () => {
        const errors: unknown[] = [];
        api.list().subscribe({ error: (error: unknown) => errors.push(error) });

        /* A 200 with a perfectly good JSON body of the wrong shape, which is
           the failure `http.get<Contact[]>()` would have waved through. */
        http.expectOne('/api/contacts').flush({ contacts: 'nope' });

        expect(errors[0]).toBeInstanceOf(ApiError);
        expect((errors[0] as ApiError).kind).toBe('malformed');
    });

    it('sends the draft as the POST body and parses what comes back', () => {
        const created: Contact[] = [];
        api.create(DRAFT).subscribe((contact) => created.push(contact));

        const request = http.expectOne('/api/contacts');

        expect(request.request.method).toBe('POST');
        /* The body as the server will see it. A probe can only check that a
           POST happened; this checks what was in it. */
        expect(request.request.body).toEqual(DRAFT);

        request.flush({ ...ADA, id: 'srv-1', name: 'Alan Turing' }, { status: 201, statusText: 'Created' });

        expect(created[0]?.id).toBe('srv-1');
    });

    it('patches one field rather than replacing the record', () => {
        api.setFavourite('c1', false).subscribe();

        const request = http.expectOne('/api/contacts/c1');

        expect(request.request.method).toBe('PATCH');
        expect(request.request.body).toEqual({ favourite: false });

        request.flush({ ...ADA, favourite: false });
    });

    it('escapes an id that would otherwise change the URL', () => {
        api.remove('a/b?c').subscribe();

        /* Without `encodeURIComponent` this would be DELETE
           /api/contacts/a/b?c - a different path with a query string, which
           the fake server would answer with a 405 and I would have debugged
           for an hour. */
        const request = http.expectOne('/api/contacts/a%2Fb%3Fc');

        expect(request.request.method).toBe('DELETE');
        request.flush(null, { status: 204, statusText: 'No Content' });
    });

    /* The error mapping, as a table. Each row is a thing a server can do and
       the kind the rest of the app is allowed to see. */
    const failures: readonly [number, string, ApiError['kind']][] = [
        [0, 'no answer at all', 'offline'],
        [404, 'gone', 'notFound'],
        [409, 'Another contact already uses that email.', 'conflict'],
        [500, 'boom', 'server'],
        [418, 'teapot', 'server']
    ];

    it.each(failures)('maps %i into an ApiError of kind %s', (status, message, kind) => {
        const errors: unknown[] = [];
        api.list().subscribe({ error: (error: unknown) => errors.push(error) });

        http.expectOne('/api/contacts').flush(
            { message },
            { status, statusText: status === 0 ? 'Unknown Error' : message }
        );

        expect(errors[0]).toBeInstanceOf(ApiError);
        expect((errors[0] as ApiError).kind).toBe(kind);
        /* Nothing an HttpErrorResponse says reaches the UI. */
        expect((errors[0] as ApiError).message).not.toContain('Http failure');
    });

    it('uses the server wording for a conflict and its own for everything else', () => {
        const errors: ApiError[] = [];
        api.create(DRAFT).subscribe({ error: (error: unknown) => errors.push(error as ApiError) });

        http.expectOne('/api/contacts').flush(
            { message: 'Another contact already uses alan@example.com.' },
            { status: 409, statusText: 'Conflict' }
        );

        expect(errors[0]?.message).toBe('Another contact already uses alan@example.com.');
    });

    it('does not read a message out of an error body that is not an object', () => {
        const errors: ApiError[] = [];
        api.create(DRAFT).subscribe({ error: (error: unknown) => errors.push(error as ApiError) });

        /* An HTML error page from a proxy, which is the realistic version of
           this and the reason `response.error.message` is not safe. */
        http.expectOne('/api/contacts').flush('<html>Conflict</html>', {
            status: 409,
            statusText: 'Conflict'
        });

        expect(errors[0]?.kind).toBe('conflict');
        expect(errors[0]?.message).toContain('conflicts with a contact already on the server');
    });

    it('asks for a URL built from the injected base path', () => {
        /* Overriding a token in a test, which is what Day 47 said tokens were
           for and the first time I have had the chance to prove it. Nothing in
           contacts.api.ts changes; the URL does.

           The outer `beforeEach` has already configured a TestBed, so this
           resets it first - which is also the answer to "can one spec file
           have two different configurations". */
        TestBed.resetTestingModule();
        TestBed.configureTestingModule({
            providers: [
                provideHttpClient(),
                provideHttpClientTesting(),
                { provide: API_BASE, useValue: '/v2' }
            ]
        });

        TestBed.inject(ContactsApi).list().subscribe();

        const scopedHttp = TestBed.inject(HttpTestingController);
        const request = scopedHttp.expectOne('/v2/contacts');

        expect(request.request.method).toBe('GET');
        request.flush({ contacts: [] });
        scopedHttp.verify();
    });
});
