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
    HttpResponse,
    type HttpEvent,
    type HttpInterceptorFn
} from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { type Observable, switchMap, tap, throwError, timer } from 'rxjs';

import { API_BASE, API_LATENCY, SERVER_STORE_KEY } from './tokens';

const VERSION = 1;

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

    /* Anything that is not the contacts API goes straight through. An
       interceptor that forgets to call `next` for requests it does not handle
       is an app where nothing else can ever load. */
    if (!req.url.startsWith(`${base}/contacts`)) return next(req);

    const path = req.url.slice(base.length);
    const id = /^\/contacts\/(.+)$/.exec(path)?.[1];

    if (req.method === 'GET' && id === undefined) {
        const rows = store.rows();

        if (rows !== null) return ok(200, { contacts: rows }, latency);

        /* Never seeded, so this one request is allowed through to the real
           static file - with the URL rewritten, which is the other thing
           interceptors are for.

           `req.clone({ url })` rather than mutating: an HttpRequest is
           immutable, and `clone` is the only way to change one. That is a
           deliberate design choice by the framework and it matters here,
           because the log interceptor upstream has already recorded the
           original URL. */
        return next(req.clone({ url: `${base}/contacts.json` })).pipe(
            tap((event) => {
                if (event instanceof HttpResponse) store.write(extractRows(event.body));
            })
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
