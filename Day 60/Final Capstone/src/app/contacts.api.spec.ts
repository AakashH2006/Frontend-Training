/* Day 54, extended on Day 55 - the API boundary, with `HttpTestingController`.

   This is the spec that changed my mind about Angular's testing tools. Every
   "Verification" section for three days had been a probe: build the app, load
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
   performance bug into a failing test.

   DAY 55 adds the query. `list()` now takes a `ContactQuery` and returns one
   page, so there is a URL to get wrong and five numbers to parse - and
   `request.request.params` is exactly the assertion a probe could never make,
   because the only visible trace of a wrong parameter is a list with the wrong
   rows in it. */

import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ApiError } from './api-error';
import { ContactsApi, type ContactPage, type ContactQuery } from './contacts.api';
import { type Contact, type ContactDraft } from './domain';
import { API_BASE, DETAIL_POLL_MS, RECORD_CACHE_MS, TAGS_CACHE_MS } from './tokens';

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

const DEFAULT_QUERY: ContactQuery = { q: '', filter: 'all', sort: 'added', page: 1 };

/* A whole envelope, so each test can change the one field it is about. */
const envelope = (over: Record<string, unknown> = {}) => ({
    contacts: [ADA],
    matched: 1,
    total: 1,
    page: 1,
    pages: 1,
    counts: { family: 0, friends: 0, work: 1, other: 0 },
    favourites: 1,
    ...over
});

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

    /* Day 54's first test, and the one I would not have thought to write
       before Day 52: calling the method does nothing at all. */
    it('makes no request until something subscribes', () => {
        const request$ = api.list(DEFAULT_QUERY);

        http.expectNone(() => true);

        request$.subscribe();
        http.expectOne((request) => request.url === '/api/contacts').flush(envelope());
    });

    it('makes one request per subscribe, because the observable is cold', () => {
        const request$ = api.list(DEFAULT_QUERY);

        request$.subscribe();
        request$.subscribe();

        /* `match` rather than `expectOne`, because expectOne FAILS when there
           are two - which is how I would find this out by accident. */
        const requests = http.match((request) => request.url === '/api/contacts');
        expect(requests.length).toBe(2);
        for (const request of requests) request.flush(envelope());
    });

    /* ---- Day 55: the query goes into the URL ---- */

    it('sends only the parameters that are not the default', () => {
        api.list(DEFAULT_QUERY).subscribe();

        const request = http.expectOne('/api/contacts?sort=added&page=1');

        /* The assertion that matters is the negative one. An empty `q` must
           not appear at all, because `?q=` and no `q` are two URLs for one
           question and the service's `distinctUntilChanged` compares the
           query, not the URL - so the two would be one request from the
           client's point of view and two cache entries from a CDN's. */
        expect(request.request.params.has('q')).toBe(false);
        expect(request.request.params.has('filter')).toBe(false);
        expect(request.request.params.get('sort')).toBe('added');
        expect(request.request.params.get('page')).toBe('1');

        request.flush(envelope());
    });

    it('sends q, filter and page when they are set', () => {
        api.list({ q: 'ada', filter: 'work', sort: 'name', page: 3 }).subscribe();

        const request = http.expectOne('/api/contacts?sort=name&page=3&q=ada&filter=work');

        expect(request.request.params.get('q')).toBe('ada');
        expect(request.request.params.get('filter')).toBe('work');
        request.flush(envelope({ page: 3, pages: 3 }));
    });

    it('encodes a query that would otherwise change the URL', () => {
        api.list({ ...DEFAULT_QUERY, q: 'a & b=c' }).subscribe();

        /* `HttpParams` does the encoding, which is the reason not to build
           this URL with string concatenation. `&` in a search term would
           otherwise become a second parameter and the server would search for
           "a". */
        const request = http.expectOne((candidate) => candidate.url === '/api/contacts');

        expect(request.request.params.get('q')).toBe('a & b=c');

        /* The encoding, measured rather than assumed. I expected
           `q=a%20%26%20b%3Dc` and got

               /api/contacts?sort=added&page=1&q=a%20%26%20b=c

           - the space and the ampersand are encoded and the EQUALS SIGN is
           not. Angular's default `HttpUrlEncodingCodec` deliberately leaves a
           handful of characters alone, `=` among them, because they are legal
           inside a query parameter's value and encoding them makes URLs
           harder to read for no gain. `&` is encoded because leaving it would
           change where the parameter ends, which is the only one that
           actually matters here. */
        expect(request.request.urlWithParams).toBe('/api/contacts?sort=added&page=1&q=a%20%26%20b=c');
        request.flush(envelope());
    });

    /* ---- the envelope ---- */

    it('parses the rows and counts the ones it cannot read', () => {
        const seen: ContactPage[] = [];
        api.list(DEFAULT_QUERY).subscribe((page) => seen.push(page));

        http.expectOne((request) => request.url === '/api/contacts').flush(
            envelope({
                contacts: [
                    ADA,
                    { ...ADA, id: 'c5', group: 'colleagues' }, // the fixture's bad row
                    'not a contact'
                ],
                matched: 3,
                total: 3
            })
        );

        expect(seen[0]?.contacts.length).toBe(1);
        expect(seen[0]?.skipped).toBe(2);
        /* `matched` and `total` are the SERVER's counts, so they include the
           rows this client dropped. That is the point of transmitting them:
           "1 of 3" is a true and useful sentence that the client could not
           have worked out. */
        expect(seen[0]?.matched).toBe(3);
        expect(seen[0]?.total).toBe(3);
    });

    it('takes the page the server served, not the one that was asked for', () => {
        const seen: ContactPage[] = [];
        api.list({ ...DEFAULT_QUERY, page: 99 }).subscribe((page) => seen.push(page));

        http.expectOne((request) => request.url === '/api/contacts').flush(
            envelope({ page: 2, pages: 2 })
        );

        /* Asking for page 99 of a 2-page result is answered with page 2, and
           the client believes the answer. The contacts page then corrects its
           own URL from this number. */
        expect(seen[0]?.page).toBe(2);
        expect(seen[0]?.pages).toBe(2);
    });

    it('does not trust a number just because the type says so', () => {
        const seen: ContactPage[] = [];
        api.list(DEFAULT_QUERY).subscribe((page) => seen.push(page));

        /* A 200 with `"matched": null`, which `http.get<ContactPage>()` would
           have handed over as a number. The template would then render
           `null of 1` and the pagination bar would have NaN pages - a failure
           that gets blamed on the template. */
        http.expectOne((request) => request.url === '/api/contacts').flush(
            envelope({ matched: null, pages: 'three', page: -4, favourites: undefined })
        );

        expect(seen[0]?.matched).toBe(1); // falls back to the row count
        expect(seen[0]?.pages).toBe(1);
        expect(seen[0]?.page).toBe(1);
        expect(seen[0]?.favourites).toBe(0);
    });

    it('builds the counts from the groups it knows, not from the response', () => {
        const seen: ContactPage[] = [];
        api.list(DEFAULT_QUERY).subscribe((page) => seen.push(page));

        http.expectOne((request) => request.url === '/api/contacts').flush(
            envelope({ counts: { work: 2, colleagues: 7 } })
        );

        /* "colleagues" is a real group on the fake server and not one of this
           client's four. It must not end up as a key in a
           `Record<Group, number>` that the template iterates - and the four
           it does know must all be present, so `counts()[group]` is never
           undefined. */
        expect(seen[0]?.counts).toEqual({ family: 0, friends: 0, work: 2, other: 0 });
    });

    it('rejects a response in the wrong shape rather than trusting the generic', () => {
        const errors: unknown[] = [];
        api.list(DEFAULT_QUERY).subscribe({ error: (error: unknown) => errors.push(error) });

        /* A 200 with a perfectly good JSON body of the wrong shape, which is
           the failure `http.get<ContactPage>()` would have waved through. */
        http.expectOne((request) => request.url === '/api/contacts').flush({ contacts: 'nope' });

        expect(errors[0]).toBeInstanceOf(ApiError);
        expect((errors[0] as ApiError).kind).toBe('malformed');
    });

    /* ---- Day 55: one contact, by id ---- */

    it('asks for one contact by its id', () => {
        const seen: Contact[] = [];
        api.get('c1').subscribe((contact) => seen.push(contact));

        const request = http.expectOne('/api/contacts/c1');

        expect(request.request.method).toBe('GET');
        /* The bare record, not an envelope - one resource, one body. */
        request.flush(ADA);

        expect(seen[0]?.name).toBe('Ada Lovelace');
    });

    it('escapes an id in a GET as well as in a DELETE', () => {
        api.get('a/b?c').subscribe({ error: () => undefined });

        http.expectOne('/api/contacts/a%2Fb%3Fc').flush(null, {
            status: 404,
            statusText: 'Not Found'
        });
    });

    it('reports a missing contact as notFound rather than as a server error', () => {
        const errors: ApiError[] = [];
        api.get('nope').subscribe({ error: (error: unknown) => errors.push(error as ApiError) });

        http.expectOne('/api/contacts/nope').flush(
            { message: 'No such contact.' },
            { status: 404, statusText: 'Not Found' }
        );

        /* The detail page renders "No such contact" from exactly this kind,
           and anything else from a different branch - so the kind is the
           contract between this file and that template. */
        expect(errors[0]?.kind).toBe('notFound');
    });

    /* ---- mutations ---- */

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
        api.list(DEFAULT_QUERY).subscribe({ error: (error: unknown) => errors.push(error) });

        http.expectOne((request) => request.url === '/api/contacts').flush(
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

        TestBed.inject(ContactsApi).list(DEFAULT_QUERY).subscribe();

        const scopedHttp = TestBed.inject(HttpTestingController);
        const request = scopedHttp.expectOne((candidate) => candidate.url === '/v2/contacts');

        expect(request.request.method).toBe('GET');
        request.flush(envelope());
        scopedHttp.verify();
    });
});

/* ---- Day 58: the one-second window on GET /api/contacts/:id ----

   The behaviour these tests are about is not visible from any one caller. A
   resolver asks for a record, a component asks for the same record a few
   milliseconds later, and one request goes out. Nothing in either of those
   files says so, which is exactly why the rule belongs here with tests on it.

   Note what `HttpTestingController` makes possible: `expectNone` after a
   subscribe is an assertion about a request that was NEVER MADE, which is the
   only direct way to test a cache. The probe can count requests in the log
   afterwards; it cannot say that a second subscription did not cause one. */
describe('ContactsApi, the record cache', () => {
    let api: ContactsApi;
    let http: HttpTestingController;

    const configure = (cacheMs: number) => {
        TestBed.resetTestingModule();
        TestBed.configureTestingModule({
            providers: [
                provideHttpClient(),
                provideHttpClientTesting(),
                { provide: RECORD_CACHE_MS, useValue: cacheMs }
            ]
        });

        api = TestBed.inject(ContactsApi);
        http = TestBed.inject(HttpTestingController);
    };

    beforeEach(() => { configure(1000); });

    afterEach(() => { http.verify(); });

    const sleep = (ms: number) => new Promise<void>((resolve) => { setTimeout(resolve, ms); });

    it('answers a second subscriber from the first request', () => {
        const first: Contact[] = [];
        const second: Contact[] = [];

        api.get('c1').subscribe((contact) => first.push(contact));
        http.expectOne('/api/contacts/c1').flush(ADA);

        api.get('c1').subscribe((contact) => second.push(contact));

        /* The assertion the whole day is about. */
        http.expectNone('/api/contacts/c1');

        expect(first).toEqual([ADA]);
        /* And synchronously, which is why the detail page has no loading
           state on a cold URL any more: `shareReplay` replays its buffer the
           moment something subscribes. */
        expect(second).toEqual([ADA]);
    });

    it('shares a request that is still in flight', () => {
        const seen: Contact[] = [];

        api.get('c1').subscribe((contact) => seen.push(contact));
        api.get('c1').subscribe((contact) => seen.push(contact));

        /* Both subscribers before any answer: ONE request, not two, which is
           the case a cache of parsed values would have needed a separate
           in-flight map for. Holding the observable handles both. */
        http.expectOne('/api/contacts/c1').flush(ADA);

        expect(seen).toEqual([ADA, ADA]);
    });

    it('asks again once the window has passed', async () => {
        configure(5);

        api.get('c1').subscribe();
        http.expectOne('/api/contacts/c1').flush(ADA);

        await sleep(20);

        api.get('c1').subscribe();
        http.expectOne('/api/contacts/c1').flush(ADA);
    });

    it('does not cache a failure', () => {
        const errors: unknown[] = [];

        api.get('c1').subscribe({ error: (error: unknown) => errors.push(error) });
        http.expectOne('/api/contacts/c1').flush(
            { message: 'The fake server was told to fail this one.' },
            { status: 503, statusText: 'Service Unavailable' }
        );

        expect(errors.length).toBe(1);

        /* The retry button on the detail page is this test. A cached 503
           would answer it instantly with the same failure for a second, and
           pressing a button that visibly does nothing is worse than waiting
           for a request. */
        api.get('c1').subscribe({ error: () => {} });
        http.expectOne('/api/contacts/c1').flush(
            { message: 'No.' },
            { status: 503, statusText: 'Service Unavailable' }
        );
    });

    it('forgets the record after a PATCH', () => {
        api.get('c1').subscribe();
        http.expectOne('/api/contacts/c1').flush(ADA);

        api.setFavourite('c1', true).subscribe();
        http.expectOne('/api/contacts/c1').flush({ ...ADA, favourite: true });

        const seen: Contact[] = [];
        api.get('c1').subscribe((contact) => seen.push(contact));

        /* Without the `tap(forget)` in `setFavourite`, this line is
           `expectNone` and the test passes while the app lies: the detail
           page re-reads the record it just changed and is handed the version
           from before the write. */
        http.expectOne('/api/contacts/c1').flush({ ...ADA, favourite: true });

        expect(seen[0]?.favourite).toBe(true);
    });

    it('forgets the record after a PUT', () => {
        api.get('c1').subscribe();
        http.expectOne('/api/contacts/c1').flush(ADA);

        api.update('c1', DRAFT).subscribe();
        http.expectOne('/api/contacts/c1').flush({ ...ADA, name: 'Ada King' });

        api.get('c1').subscribe();
        http.expectOne('/api/contacts/c1').flush({ ...ADA, name: 'Ada King' });
    });

    it('forgets the record after a DELETE', () => {
        api.get('c1').subscribe();
        http.expectOne('/api/contacts/c1').flush(ADA);

        api.remove('c1').subscribe();
        http.expectOne('/api/contacts/c1').flush(null, { status: 204, statusText: 'No Content' });

        /* And the next read gets the server's 404 rather than a record the
           server no longer has. */
        api.get('c1').subscribe({ error: () => {} });
        http.expectOne('/api/contacts/c1').flush(
            { message: 'No such contact.' },
            { status: 404, statusText: 'Not Found' }
        );
    });

    it('keeps one entry per id', () => {
        api.get('c1').subscribe();
        http.expectOne('/api/contacts/c1').flush(ADA);

        api.get('c2').subscribe();
        http.expectOne('/api/contacts/c2').flush({ ...ADA, id: 'c2', name: 'Grace Hopper' });

        /* Two ids, two requests, and neither answered the other - which is
           worth a test because a cache keyed on something too coarse (the
           endpoint, say) is a bug that only shows up on the second record. */
        api.get('c1').subscribe();
        api.get('c2').subscribe();
        http.expectNone('/api/contacts/c1');
        http.expectNone('/api/contacts/c2');
    });

    it('makes no request at all when the window is 0', () => {
        configure(0);

        api.get('c1').subscribe();
        http.expectOne('/api/contacts/c1').flush(ADA);

        /* Off means off: the second read goes to the server. */
        api.get('c1').subscribe();
        http.expectOne('/api/contacts/c1').flush(ADA);
    });

    it('is a shorter window than the detail poll interval', () => {
        /* A test of two numbers, which is unusual and earns its place: these
           defaults are coupled and the coupling is invisible. A cache window
           at or above the poll interval would answer every poll out of the
           cache, so the page would re-render the same record for ever and look
           like a server that never changes anything. */
        TestBed.resetTestingModule();
        TestBed.configureTestingModule({ providers: [] });

        expect(TestBed.inject(RECORD_CACHE_MS)).toBeLessThan(TestBed.inject(DETAIL_POLL_MS));
    });
});

/* Day 60 - GET /api/tags, from the client's side.

   Three things to establish, and they are the same three the record cache
   needed: that the request is made and parsed, that two readers are one
   request, and that every write throws the answer away. The third is the one
   that would rot silently: a stale tag list looks exactly like a correct one
   until you go looking for the tag you just typed. */
describe('ContactsApi, the tag list', () => {
    let api: ContactsApi;
    let http: HttpTestingController;

    const configure = (tagsMs = 30_000) => {
        TestBed.resetTestingModule();
        TestBed.configureTestingModule({
            providers: [
                provideHttpClient(),
                provideHttpClientTesting(),
                { provide: TAGS_CACHE_MS, useValue: tagsMs }
            ]
        });

        api = TestBed.inject(ContactsApi);
        http = TestBed.inject(HttpTestingController);
    };

    beforeEach(() => { configure(); });

    afterEach(() => { http.verify(); });

    const answer = (tags: unknown) => {
        http.expectOne('/api/tags').flush({ tags });
    };

    it('asks for the tags and reads the envelope', () => {
        let tags: readonly { name: string; count: number }[] = [];
        api.tags().subscribe((value) => { tags = value; });

        answer([{ name: 'maths', count: 2 }, { name: 'logic', count: 1 }]);

        expect(tags).toEqual([{ name: 'maths', count: 2 }, { name: 'logic', count: 1 }]);
    });

    it('keeps the order it was given', () => {
        let names: string[] = [];
        api.tags().subscribe((tags) => { names = tags.map((tag) => tag.name); });

        answer([{ name: 'zeta', count: 9 }, { name: 'alpha', count: 1 }]);

        /* The server sorts by use. A client that re-sorted would be deriving
           an aggregate over rows it does not have, which is the mistake Day 55
           wrote a rule about. */
        expect(names).toEqual(['zeta', 'alpha']);
    });

    it('drops a row that is not a tag and keeps the rest', () => {
        let names: string[] = [];
        api.tags().subscribe((tags) => { names = tags.map((tag) => tag.name); });

        answer(['maths', null, 42, { count: 3 }, { name: '' }, { name: 'logic', count: 1 }]);

        /* Deliberately NOT a throw. A malformed envelope means the response is
           not a tag list at all and the next test asserts the error; one bad
           row means one suggestion is missing, and losing the datalist over it
           would be the wrong trade. */
        expect(names).toEqual(['logic']);
    });

    it('defaults a missing count rather than dropping the tag', () => {
        let tags: readonly { name: string; count: number }[] = [];
        api.tags().subscribe((value) => { tags = value; });

        answer([{ name: 'maths' }, { name: 'logic', count: -4 }]);

        /* The name is what the datalist needs; the count only orders it. A
           tag with an unusable count is still a usable suggestion. */
        expect(tags).toEqual([{ name: 'maths', count: 0 }, { name: 'logic', count: 0 }]);
    });

    it('fails with a malformed error when the envelope has no tags', async () => {
        const failure = firstValueFrom(api.tags());

        http.expectOne('/api/tags').flush({ nope: [] });

        await expect(failure).rejects.toMatchObject({ kind: 'malformed' });
    });

    it('answers a second reader from the first request', () => {
        const first: unknown[] = [];
        const second: unknown[] = [];

        api.tags().subscribe((tags) => first.push(tags));
        answer([{ name: 'maths', count: 1 }]);

        api.tags().subscribe((tags) => second.push(tags));

        http.expectNone('/api/tags');
        expect(second).toEqual(first);
    });

    it('does not cache a failure', async () => {
        const failure = firstValueFrom(api.tags());
        http.expectOne('/api/tags').flush({ message: 'nope' }, { status: 503, statusText: 'Nope' });
        await expect(failure).rejects.toBeDefined();

        /* A cached 503 would mean an empty datalist for the whole window with
           nothing on the page to explain it. */
        api.tags().subscribe();
        http.expectOne('/api/tags').flush({ tags: [] });
    });

    it('goes to the server every time with the cache turned off', () => {
        configure(0);

        api.tags().subscribe();
        answer([]);

        api.tags().subscribe();
        answer([]);
    });

    /* The four writes. Each one gets its own test for the reason the record
       cache's three do: the way this breaks is that somebody adds a fifth
       write and does not know this line exists. */
    const prime = () => {
        api.tags().subscribe();
        answer([{ name: 'maths', count: 1 }]);
    };

    const expectRefetched = () => {
        api.tags().subscribe();
        answer([{ name: 'maths', count: 1 }]);
    };

    it('forgets the tags after a create, which may have introduced one', () => {
        prime();

        api.create({ name: 'Jean Bartik', group: 'work', tags: ['eniac'], favourite: false }).subscribe();
        http.expectOne('/api/contacts').flush(ADA);

        expectRefetched();
    });

    it('forgets the tags after an update, which may have dropped the last use', () => {
        prime();

        api.update('c1', { name: 'Ada', group: 'work', tags: [], favourite: false }).subscribe();
        http.expectOne('/api/contacts/c1').flush(ADA);

        expectRefetched();
    });

    it('forgets the tags after a delete', () => {
        prime();

        api.remove('c1').subscribe();
        http.expectOne('/api/contacts/c1').flush(null, { status: 204, statusText: 'No Content' });

        expectRefetched();
    });

    it('forgets the tags after a favourite toggle, which cannot have changed them', () => {
        prime();

        api.setFavourite('c1', true).subscribe();
        http.expectOne('/api/contacts/c1').flush(ADA);

        /* PATCHing `favourite` provably cannot change a tag count, so this
           request is waste - about 40 bytes of it, once per toggle. The
           alternative is `forget` taking an argument for which caches to
           clear, and a caller deciding; that is a decision at every call site
           to save one request, and the failure mode of getting it wrong is the
           invisible kind. Correct and slightly wasteful beats clever here. */
        expectRefetched();
    });

    it('is a much longer window than the record cache, on purpose', () => {
        TestBed.resetTestingModule();
        TestBed.configureTestingModule({ providers: [] });

        /* The record is polled, so a stale one is on screen; the tag list is
           read once per form visit and invalidated by every write, so the only
           way to see a stale one is a write from another client - which this
           app has no mechanism for. Different data, different window, and the
           two numbers are related closely enough to assert. */
        expect(TestBed.inject(TAGS_CACHE_MS)).toBeGreaterThan(TestBed.inject(RECORD_CACHE_MS));
    });
});
