/* Day 52 - the server, such as it is.

   THIS FILE IS NOT THE APP. It is a stand-in for a backend that does not exist
   yet, and everything in it would be deleted the day a real one did. It is in
   the project because the alternative was learning HttpClient against a server
   I would also have had to write, and that is Week 13's problem rather than
   this week's.

   It is an interceptor, which is the part worth learning from. An interceptor
   can answer a request itself - returning a response without calling `next` -
   and nothing on the client side can tell the difference. `contacts.api.ts`
   issues real requests through real HttpClient machinery, the log interceptor
   times them, the error mapper handles their failures, and the only thing that
   changes when a real API appears is that this file stops being provided.

   What it gives me that a hand-written service full of `of(...)` would not:

     - real HTTP semantics: 201, 204, 404, 409, and a body I have to parse
     - real latency, so the loading states have to exist and get seen
     - a SERVER-SIDE rule the client cannot see (see `emailTaken` below), which
       turned out to be the most interesting thing I built today

   The storage boundary moved in here too. Day 47's `storage.service.ts` was
   the client's persistence; the client no longer persists anything, so the
   file has gone and its four failure modes live in `FakeApiStore` below -
   which is where they belong now, because a server is the thing that owns
   durability. The logic is unchanged for the third time, which keeps being the
   evidence that it was never framework code. */

import {
    HttpErrorResponse,
    HttpParams,
    HttpResponse,
    type HttpEvent,
    type HttpHandlerFn,
    type HttpInterceptorFn,
    type HttpRequest
} from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { type Observable, switchMap, throwError, timer } from 'rxjs';

import { isDirectoryEntry, type DirectoryEntry } from './directory.api';
import { API_BASE, API_LATENCY, SERVER_STORE_KEY } from './tokens';

const VERSION = 1;

/* Day 55: the page size is the SERVER's, and the client is never told it.

   The envelope carries `pages`, so the pagination bar can be rendered without
   knowing how many rows a page holds. That is not a detail I would have got
   right by instinct - the obvious design puts PAGE_SIZE in a shared constants
   file and has the client compute `Math.ceil(matched / PAGE_SIZE)`, which
   makes a server-side change a client bug.

   Three, because five contacts have to paginate for the feature to be visible
   at all. A real one would be 20 or 50. */
const PAGE_SIZE = 3;

interface Envelope {
    readonly version: number;
    readonly savedAt: string;
    /* `unknown[]`, not `Contact[]`, and that is the point of the type.

       The server's rows are not the client's model. One of the five rows in
       `public/api/contacts.json` has a group this app does not recognise, and
       the server neither knows nor cares - it stores what it was given and
       serves it back. Typing this as `Contact[]` would be the server adopting
       the client's assumptions, which is the mistake that makes a mock backend
       useless for finding real bugs. */
    readonly rows: readonly unknown[];
}

@Injectable({ providedIn: 'root' })
export class FakeApiStore {
    private readonly key = inject(SERVER_STORE_KEY);

    /* Probed with a real write inside a try, because in Safari private mode
       and with site data blocked `localStorage` exists and throws on access.
       Day 19 found that out the hard way and it has been the same four lines
       in three frameworks. */
    readonly available = ((): boolean => {
        try {
            const probe = '__probe__';
            localStorage.setItem(probe, probe);
            localStorage.removeItem(probe);
            return true;
        } catch {
            return false;
        }
    })();

    /* When storage is blocked, the server keeps its rows in memory for the
       life of the page. The app then works and does not persist, which is the
       honest degradation - and is what the client's storage service did on Day
       47 for the same reason. */
    private memory: readonly unknown[] | null = null;

    /* `null` means "never seeded", which is different from "seeded and empty".
       Day 24's distinction, and the thing that decides whether a GET falls
       through to the static file. */
    rows(): readonly unknown[] | null {
        if (!this.available) return this.memory;

        let raw: string | null = null;

        try {
            raw = localStorage.getItem(this.key);
        } catch {
            return this.memory;
        }

        if (raw === null) return null;

        let parsed: unknown;

        try {
            parsed = JSON.parse(raw);
        } catch {
            /* Unreadable JSON: start again rather than fail. The data was
               written by an older version of this code and is not worth a
               recovery routine. */
            return null;
        }

        if (typeof parsed !== 'object' || parsed === null) return null;

        const envelope = parsed as Partial<Envelope>;

        /* The version envelope, for the third time. The check is cheap and the
           alternative is a crash in a shape that is hard to recognise. */
        if (envelope.version !== VERSION || !Array.isArray(envelope.rows)) return null;

        return envelope.rows;
    }

    write(rows: readonly unknown[]): void {
        this.memory = rows;

        if (!this.available) return;

        const envelope: Envelope = { version: VERSION, savedAt: new Date().toISOString(), rows };

        try {
            localStorage.setItem(this.key, JSON.stringify(envelope));
        } catch {
            /* Quota, or storage that was available at startup and is not now.
               The rows stay in memory, so the request still succeeds - which
               is the server lying slightly, and is better than a 500 for a
               fake. */
        }
    }

    find(id: string): Record<string, unknown> | undefined {
        return (this.rows() ?? [])
            .filter((row): row is Record<string, unknown> => typeof row === 'object' && row !== null)
            .find((row) => row['id'] === id);
    }

    /* The server-side uniqueness rule, and the reason this file earned its
       keep today.

       It reads EVERY row, including the one the client cannot parse. So the
       client's own `uniqueEmail` validator - which can only see the four rows
       it managed to read - will happily accept an address the server already
       has, and the server will answer 409. That is not a contrived case: it is
       exactly what happens whenever a client's copy of the data is partial,
       which it always is.

       Day 50 called `uniqueEmail` a validator. After today it is a
       convenience, and this is the authority. */
    emailTaken(email: string, exceptId: string | null): boolean {
        const needle = email.trim().toLowerCase();
        if (needle.length === 0) return false;

        return (this.rows() ?? []).some((row) => {
            if (typeof row !== 'object' || row === null) return false;

            const record = row as Record<string, unknown>;
            if (record['id'] === exceptId) return false;

            const stored: unknown = record['email'];
            return typeof stored === 'string' && stored.trim().toLowerCase() === needle;
        });
    }
}

/* ---- the interceptor ---- */

export const fakeApiInterceptor: HttpInterceptorFn = (req, next) => {
    const base = inject(API_BASE);
    const latency = inject(API_LATENCY);
    const store = inject(FakeApiStore);

    /* Anything that is not this API goes straight through. An interceptor
       that forgets to call `next` for requests it does not handle is an app
       where nothing else can ever load. */
    if (!req.url.startsWith(`${base}/`)) return next(req);

    /* Day 53: the directory, which is the endpoint that makes the operators
       necessary - a list the client never downloads, searched by asking.

       The latency is deliberately WORSE FOR BROADER QUERIES, which is both
       realistic (more rows to scan) and the thing that makes a stale response
       overtake a fresh one. With `mergeMap` in the service the answer to "a"
       lands after the answer to "ada" and wins. */
    if (req.url.startsWith(`${base}/directory`)) {
        return directory(req, next, base, latency);
    }

    const path = req.url.slice(base.length);
    const id = /^\/contacts\/(.+)$/.exec(path)?.[1];

    /* Day 55: both GETs need the rows, and either may be the first request of
       the session - so seeding is factored out rather than living inside the
       list branch. */
    if (req.method === 'GET') {
        return withRows(req, next, base, store, (rows) =>
            id === undefined
                ? ok(200, runQuery(rows, req.params), latency)
                : serveOne(rows, id, latency)
        );
    }

    if (req.method === 'POST' && id === undefined) {
        const draft = asRecord(req.body);

        const name = typeof draft['name'] === 'string' ? draft['name'].trim() : '';
        if (name.length === 0) {
            return fail(400, 'A contact needs a name.', latency);
        }

        const email = typeof draft['email'] === 'string' ? draft['email'] : '';
        if (store.emailTaken(email, null)) {
            return fail(409, `Another contact already uses ${email}.`, latency);
        }

        const created = {
            ...draft,
            /* Identity and the timestamp belong to whoever owns the
               collection, which is now this. Day 50's service did both and
               had to stop. */
            id: `srv-${crypto.randomUUID().slice(0, 8)}`,
            addedAt: new Date().toISOString()
        };

        store.write([created, ...(store.rows() ?? [])]);

        /* 201, and the created record in the body. The client needs the id it
           was given, so an empty 201 with a Location header - which is the
           other convention - would mean a second request to find out what just
           happened. */
        return ok(201, created, latency);
    }

    if (id !== undefined && (req.method === 'PUT' || req.method === 'PATCH')) {
        const existing = store.find(id);
        if (existing === undefined) return fail(404, 'No such contact.', latency);

        const body = asRecord(req.body);

        if (req.method === 'PUT') {
            const email = typeof body['email'] === 'string' ? body['email'] : '';
            /* Excluding the record being edited, or saving an unchanged
               address would conflict with itself - Day 49's bug, in its
               server-side form. */
            if (store.emailTaken(email, id)) {
                return fail(409, `Another contact already uses ${email}.`, latency);
            }
        }

        /* PUT replaces the fields it was given; PATCH merges. Both keep `id`
           and `addedAt`, because the server owns them - spread order, Day 30,
           still earning its place. */
        const updated =
            req.method === 'PUT'
                ? { ...body, id: existing['id'], addedAt: existing['addedAt'] }
                : { ...existing, ...body, id: existing['id'], addedAt: existing['addedAt'] };

        store.write((store.rows() ?? []).map((row) => (row === existing ? updated : row)));

        return ok(200, updated, latency);
    }

    if (id !== undefined && req.method === 'DELETE') {
        const existing = store.find(id);
        if (existing === undefined) return fail(404, 'No such contact.', latency);

        store.write((store.rows() ?? []).filter((row) => row !== existing));

        /* 204: no content, and the client asks for `<void>` to match. */
        return ok(204, null, latency);
    }

    return fail(405, `The fake API does not handle ${req.method} ${path}.`, latency);
};

/* ---- Day 55: the server-side query ---- */

/* Seeding, hoisted out of the list branch.

   Day 52 served the static file's body STRAIGHT BACK on the first request and
   wrote it to the store as a side effect. That worked only because the file's
   shape and the server's response shape happened to be identical. They are not
   any more - the server now answers with `matched`, `page`, `pages` and
   `counts` - so the first request of a session would have been the one
   response in the app with a different shape from every other, which is the
   kind of bug that shows up once and is impossible to reproduce.

   `switchMap` rather than `tap`: seed, then answer the question that was
   actually asked, from the rows just seeded. */
function withRows(
    req: HttpRequest<unknown>,
    next: HttpHandlerFn,
    base: string,
    store: FakeApiStore,
    serve: (rows: readonly unknown[]) => Observable<HttpEvent<unknown>>
): Observable<HttpEvent<unknown>> {
    const rows = store.rows();
    if (rows !== null) return serve(rows);

    /* `req.clone({ url })` rather than mutating: an HttpRequest is immutable,
       and `clone` is the only way to change one. That is a deliberate design
       choice by the framework and it matters here, because the log interceptor
       upstream has already recorded the original URL.

       The params are dropped as well. A static file does not care about
       `?q=ada&page=2`, and leaving them on makes the one request in the log
       that is not really a query look like one. */
    return next(req.clone({ url: `${base}/contacts.json`, params: new HttpParams() })).pipe(
        switchMap((event) => {
            if (!(event instanceof HttpResponse)) return [event];

            const seeded = extractRows(event.body);
            store.write(seeded);

            return serve(seeded);
        })
    );
}

function serveOne(
    rows: readonly unknown[],
    id: string,
    latency: number
): Observable<HttpEvent<unknown>> {
    const found = rows.find((row) => read(row, 'id') === id);

    /* Served as the bare record, not wrapped. One resource, one body - and
       `contacts.api.ts` parses it with the same `parseOne` that handles the
       answer to a POST, which is what makes a 200 from here and a 201 from a
       create interchangeable to the client. */
    return found === undefined
        ? fail(404, 'No such contact.', latency)
        : ok(200, found, latency);
}

/* The query itself: filter, then sort, then slice.

   Everything here reads the rows LOOSELY, with `read` and `str` below, because
   the server's rows are `unknown[]` and one of them is a record this client
   cannot parse. A real server would have a schema and a database doing this
   work; the thing worth keeping from the exercise is the ORDER, which is
   forced: paging has to come last, because a page of the unsorted set is a
   different set of rows. */
function runQuery(rows: readonly unknown[], params: HttpParams): unknown {
    const q = (params.get('q') ?? '').trim().toLowerCase();
    const filter = params.get('filter') ?? 'all';
    const sort = params.get('sort') ?? 'added';
    const asked = Number.parseInt(params.get('page') ?? '1', 10);

    const matching = rows.filter((row) => matchesQuery(row, q) && matchesFilter(row, filter));
    const sorted = [...matching].sort(serverComparator(sort));

    const pages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));

    /* Clamped, and the clamped value goes back in the response.

       `?page=99` is reachable by typing, by a stale bookmark, and by deleting
       enough contacts that page 3 stops existing. A 404 would be defensible
       and unhelpful; an empty list would be a screen that looks broken. The
       last page, plus a `page` field saying which one that was, lets the
       client correct its own URL - which is what it does. */
    const page = Math.min(Math.max(Number.isFinite(asked) ? asked : 1, 1), pages);
    const start = (page - 1) * PAGE_SIZE;

    return {
        contacts: sorted.slice(start, start + PAGE_SIZE),
        matched: sorted.length,
        /* `rows.length`, so `total` counts the row this client cannot read.
           "5 contacts, 4 of them readable" is the honest statement and the
           client renders both numbers. */
        total: rows.length,
        page,
        pages,
        /* Over EVERY row, ignoring q and filter, because the group chips are a
           way of changing the filter and have to say how many are there - not
           how many are there given the filter they would replace. */
        counts: countGroups(rows),
        favourites: rows.filter((row) => read(row, 'favourite') === true).length
    };
}

function matchesQuery(row: unknown, needle: string): boolean {
    if (needle.length === 0) return true;

    const tags: unknown = read(row, 'tags');
    const haystack = [
        str(row, 'name'),
        str(row, 'email'),
        str(row, 'phone'),
        ...(Array.isArray(tags) ? tags.map((tag) => (typeof tag === 'string' ? tag : '')) : [])
    ];

    return haystack.some((value) => value.toLowerCase().includes(needle));
}

function matchesFilter(row: unknown, filter: string): boolean {
    if (filter === 'all') return true;
    if (filter === 'favourites') return read(row, 'favourite') === true;

    return str(row, 'group') === filter;
}

function serverComparator(sort: string): (a: unknown, b: unknown) => number {
    if (sort === 'name') return (a, b) => str(a, 'name').localeCompare(str(b, 'name'));

    if (sort === 'group') {
        return (a, b) =>
            str(a, 'group').localeCompare(str(b, 'group')) ||
            str(a, 'name').localeCompare(str(b, 'name'));
    }

    /* The default, and newest-first - which matches the client-side
       comparator Day 50 wrote, because the sort moving to the server must not
       change what the user sees. */
    return (a, b) => str(b, 'addedAt').localeCompare(str(a, 'addedAt'));
}

function countGroups(rows: readonly unknown[]): Record<string, number> {
    const totals: Record<string, number> = {};

    for (const row of rows) {
        const group = str(row, 'group');
        if (group.length === 0) continue;

        totals[group] = (totals[group] ?? 0) + 1;
    }

    /* "colleagues" is in here, and the client's parser drops it - which is
       the right division: the server reports what it holds, and the client
       decides what it can show. */
    return totals;
}

function read(row: unknown, key: string): unknown {
    return typeof row === 'object' && row !== null ? (row as Record<string, unknown>)[key] : undefined;
}

function str(row: unknown, key: string): string {
    const value = read(row, key);
    return typeof value === 'string' ? value : '';
}

/* The directory handler.

   It needs the source file, so the first request for it falls through to the
   real static asset exactly as the contacts GET does - and then the rows are
   kept on the injectable below, because a server does not re-read its database
   from disk for every query. */
function directory(
    req: HttpRequest<unknown>,
    next: HttpHandlerFn,
    base: string,
    latency: number
): Observable<HttpEvent<unknown>> {
    const cache = inject(DirectoryCache);
    const path = req.url.slice(base.length);

    if (req.method !== 'GET') return fail(405, `The fake API does not handle ${req.method}.`, latency);

    const serve = (people: readonly DirectoryEntry[]): Observable<HttpEvent<unknown>> => {
        if (path.startsWith('/directory/size')) {
            return ok(200, { total: people.length }, latency);
        }

        const query = (req.params.get('q') ?? '').trim().toLowerCase();

        const matches =
            query.length === 0
                ? []
                : people.filter(
                      (person) =>
                          person.name.toLowerCase().includes(query) ||
                          person.title.toLowerCase().includes(query) ||
                          person.email.toLowerCase().includes(query)
                  );

        /* 800ms for a two-letter query, 100ms for anything precise. The
           spread has to be wider than the client's debounce, or a stale
           answer can never overtake a fresh one and the race this endpoint
           exists to demonstrate is not reachable. */
        const cost = Math.min(1200, Math.max(100, 1400 - 300 * query.length));

        return ok(200, { people: matches }, cost);
    };

    const cached = cache.people();
    if (cached !== null) return serve(cached);

    return next(req.clone({ url: `${base}/directory.json`, params: req.params.delete('q') })).pipe(
        switchMap((event) => {
            if (!(event instanceof HttpResponse)) return [event];

            const body: unknown = event.body;
            const rows: unknown =
                typeof body === 'object' && body !== null
                    ? (body as Record<string, unknown>)['people']
                    : [];

            const people = (Array.isArray(rows) ? rows : []).filter(isDirectoryEntry);
            cache.set(people);

            return serve(people);
        })
    );
}

/* `providedIn: 'root'`, so the rows survive between requests the way a
   server's would. A module-level `let` would do the same thing and would also
   be shared between two apps in one test run, which is the bug I would rather
   not write. */
@Injectable({ providedIn: 'root' })
export class DirectoryCache {
    private rows: readonly DirectoryEntry[] | null = null;

    people(): readonly DirectoryEntry[] | null {
        return this.rows;
    }

    set(rows: readonly DirectoryEntry[]): void {
        this.rows = rows;
    }
}

/* `timer().pipe(switchMap(...))` rather than `of(...).pipe(delay(...))`.

   `delay` does not delay an error notification. Measured, because I did not
   believe it:

       throwError().pipe(delay(200))                  -> error at 0ms
       of('ok').pipe(delay(200))                      -> value at 218ms
       timer(200).pipe(switchMap(() => throwError())) -> error at 219ms

   So a "slow failure" built with `delay` arrives instantly, the loading state
   never renders, and the failure path is tested under conditions that cannot
   happen in production. */
function ok(status: number, body: unknown, latency: number): Observable<HttpEvent<unknown>> {
    return timer(latency).pipe(
        switchMap(() => [new HttpResponse({ status, body, url: '/api/contacts' })])
    );
}

function fail(status: number, message: string, latency: number): Observable<never> {
    return timer(latency).pipe(
        switchMap(() =>
            throwError(
                () =>
                    new HttpErrorResponse({
                        status,
                        statusText: message,
                        /* The body a real API would send. `api-error.ts` reads
                           `message` out of it for the 409, which is the one
                           case where the server's wording is the only wording
                           that could be right. */
                        error: { message },
                        url: '/api/contacts'
                    })
            )
        )
    );
}

function asRecord(body: unknown): Record<string, unknown> {
    return typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
}

function extractRows(body: unknown): readonly unknown[] {
    if (typeof body !== 'object' || body === null) return [];

    const rows: unknown = (body as Record<string, unknown>)['contacts'];
    return Array.isArray(rows) ? rows : [];
}
