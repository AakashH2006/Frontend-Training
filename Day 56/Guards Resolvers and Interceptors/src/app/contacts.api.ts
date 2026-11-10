/* Day 52, rewritten on Day 55 - the API client, now with a query in it.

   This file is the whole of the app's knowledge about HTTP. Nothing else
   imports HttpClient, nothing else knows a URL, and nothing else has seen an
   HttpErrorResponse - which is the same boundary Week 5 drew around
   `localStorage` and Day 47 drew around storage, one layer further out.

   Two things about HttpClient that took a day to properly absorb.

   1. THE OBSERVABLE IS COLD. `http.get(...)` performs no request. It returns a
      recipe, and subscribing runs it; subscribing twice runs it twice. A
      promise from `fetch` is the opposite - the request is already in flight
      before anybody awaits it. Every bug I had on Day 52 came from forgetting
      this, in both directions:

          this.api.list();                 // nothing happens at all
          source$.subscribe(); source$.subscribe();   // two requests

   2. THE GENERIC IS AN ASSERTION, NOT A CHECK.

          http.get<Contact[]>(url)     // "trust me"

      There is no validation anywhere in that line. The response is parsed as
      JSON and handed over as `Contact[]` because I said so. If the server
      sends a string, every consumer type-checks perfectly and fails at
      runtime. So this file asks for `unknown` and parses, which is Week 5's
      rule and the first time I have seen a framework make it this easy to
      skip.

   DAY 55's CHANGE. `list()` took no arguments and returned everything the
   server had; the client then filtered, searched, sorted and counted it with
   computeds. That works for five contacts and is a lie about how an API is
   used: the query belongs to the request. So `list` now takes a
   `ContactQuery` and returns one PAGE, and the server decides what matches.

   What that costs is the subject of today's notes, and it is not small:
   `counts` can no longer be derived, because a page of five rows cannot say
   how many contacts are in the "work" group. They arrive in the envelope
   instead, which is the server telling the client a fact about data the client
   has never seen. */

import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { catchError, map, type Observable, throwError } from 'rxjs';

import { ApiError, toApiError } from './api-error';
import { GROUPS, isContact, type Contact, type ContactDraft, type Filter, type Group, type Sort } from './domain';
import { API_BASE } from './tokens';

/* What the client asks for. Every field has a value - there is no
   `q?: string` - because an absent query and an empty one are the same request
   and two representations of one thing is how they drift apart. The service
   owns the defaults. */
export interface ContactQuery {
    readonly q: string;
    readonly filter: Filter;
    readonly sort: Sort;
    /* 1-based, because it appears in the URL and `?page=0` reads as a bug.
       The 0-based version of this is an off-by-one waiting in the template. */
    readonly page: number;
}

/* What a list request produces.

   Day 52's version was `{ contacts, skipped }`. The four new numbers are all
   facts about rows this response does not contain, which is exactly why they
   have to be in it:

     matched  how many rows the query matched, across every page
     total    how many rows the server holds, ignoring the query
     page     which page the server actually served - NOT which was asked for
     pages    how many pages the query has

   `page` being the server's answer rather than the client's question is the
   detail I would have left out. Asking for page 9 of a 2-page result has to do
   something, and "serve the last page and say so" beats both an empty screen
   and a 404. */
export interface ContactPage {
    readonly contacts: readonly Contact[];
    readonly skipped: number;
    readonly matched: number;
    readonly total: number;
    readonly page: number;
    readonly pages: number;
    /* Derived state that is no longer derivable. Day 50 computed these from
       the full list; there is no full list on the client any more. */
    readonly counts: Record<Group, number>;
    readonly favourites: number;
}

@Injectable({ providedIn: 'root' })
export class ContactsApi {
    private readonly http = inject(HttpClient);
    private readonly base = inject(API_BASE);

    /* GET /api/contacts?q=&filter=&sort=&page=

       `HttpParams` rather than string concatenation, which encodes values and
       is the reason `?q=a%20%26%20b` works without my thinking about it.

       It is also IMMUTABLE - `set` returns a new instance and does not modify
       the receiver - so this reads as reassignment rather than as a builder.
       Writing `params.set(...)` on its own line and expecting it to stick is
       the mistake the type system cannot catch, because the return value is
       simply discarded. Same shape as `HttpRequest.clone()` in `fake-api.ts`,
       and the same design decision behind both. */
    list(query: ContactQuery): Observable<ContactPage> {
        let params = new HttpParams().set('sort', query.sort).set('page', String(query.page));

        /* Omitted when they are the default, so the common request is
           `?sort=added&page=1` and the URL stays readable in the log. The
           server treats absent and default identically. */
        if (query.q.length > 0) params = params.set('q', query.q);
        if (query.filter !== 'all') params = params.set('filter', query.filter);

        return this.http
            .get<unknown>(`${this.base}/contacts`, { params })
            .pipe(map(parsePage), catchError(fail));
    }

    /* GET /api/contacts/:id - Day 55, and the request the app should have had
       since Day 51.

       Day 52's detail page found its contact with `contacts.byId(id)`, which
       worked because the whole list was in memory. Now that the list is one
       page of a server-side query, a pasted link to a contact on page 3 - or
       to one that the current filter excludes - would render "No such
       contact" about a record that exists.

       So a page addressed by an id fetches by that id. The route is the
       request, which is the whole point of putting state in the URL and took
       until now to actually mean something. */
    get(id: string): Observable<Contact> {
        return this.http
            .get<unknown>(`${this.base}/contacts/${encodeURIComponent(id)}`)
            .pipe(map(parseOne), catchError(fail));
    }

    /* POST /api/contacts

       The body is a draft - no id and no addedAt - because the server
       generates both. Day 50's service generated the id itself and I noted
       then that identity belongs to whatever owns the collection. The
       collection is now on the server, so the id is too, and `add()` has to
       wait for the answer to know what was created. */
    create(draft: ContactDraft): Observable<Contact> {
        return this.http
            .post<unknown>(`${this.base}/contacts`, draft)
            .pipe(map(parseOne), catchError(fail));
    }

    /* PUT /api/contacts/:id - the whole record, replaced. */
    update(id: string, draft: ContactDraft): Observable<Contact> {
        return this.http
            .put<unknown>(`${this.base}/contacts/${encodeURIComponent(id)}`, draft)
            .pipe(map(parseOne), catchError(fail));
    }

    /* PATCH /api/contacts/:id - one field.

       Favouriting is a single boolean and PUT would mean sending the whole
       contact back to change it, which is both wasteful and a way to
       accidentally overwrite a field somebody else changed. This is the first
       time I have had a reason to care about the difference. */
    setFavourite(id: string, favourite: boolean): Observable<Contact> {
        return this.http
            .patch<unknown>(`${this.base}/contacts/${encodeURIComponent(id)}`, { favourite })
            .pipe(map(parseOne), catchError(fail));
    }

    /* DELETE /api/contacts/:id

       `<void>` because a 204 has no body. Asking for `<Contact>` here would
       type-check and hand every subscriber `null`. */
    remove(id: string): Observable<void> {
        return this.http
            .delete<void>(`${this.base}/contacts/${encodeURIComponent(id)}`)
            .pipe(catchError(fail));
    }
}

/* ---- the boundary ---- */

/* `{ contacts: [...], matched, total, page, pages, counts, favourites }`.

   An envelope rather than a bare array, which was Day 52's choice and is the
   reason today's change did not break the shape: "an envelope leaves room to
   add a total or a cursor without changing the shape; a bare array does not".
   Five fields later, that has held. */
function parsePage(body: unknown): ContactPage {
    if (typeof body !== 'object' || body === null) {
        throw new ApiError('malformed', 'The contacts service sent something that is not a list.');
    }

    const envelope = body as Record<string, unknown>;
    const rows: unknown = envelope['contacts'];

    if (!Array.isArray(rows)) {
        throw new ApiError('malformed', 'The contacts service sent a list in the wrong shape.');
    }

    /* The same guard the client has used on untrusted data since Week 5, and
       the same treatment: keep what parses, count what does not, carry on.
       An exception here would mean one bad row from a server I do not control
       takes down a screen that could have shown the other four. */
    const contacts = rows.filter(isContact);

    return {
        contacts,
        skipped: rows.length - contacts.length,
        /* Every number parsed, not asserted - the same rule as the rows.

           A server that sends `"matched": null` would otherwise give a
           template `null of 5` and a pagination bar with NaN pages, which is
           the sort of failure that gets blamed on the template. `count`
           defaults rather than throwing, because a missing total is a
           degraded screen and a missing list is a broken one. */
        matched: count(envelope['matched'], contacts.length),
        total: count(envelope['total'], contacts.length),
        page: count(envelope['page'], 1),
        pages: count(envelope['pages'], 1),
        counts: parseCounts(envelope['counts']),
        favourites: count(envelope['favourites'], 0)
    };
}

function count(value: unknown, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function parseCounts(value: unknown): Record<Group, number> {
    const source = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};

    /* Built from GROUPS rather than from the response, so a server that adds
       a group this client does not know about cannot put an extra key into a
       `Record<Group, number>` that the template then iterates. Week 5's rule
       about parsing into the shape you want, rather than checking the shape
       you were given. */
    return GROUPS.reduce<Record<Group, number>>(
        (totals, group) => ({ ...totals, [group]: count(source[group], 0) }),
        { family: 0, friends: 0, work: 0, other: 0 }
    );
}

function parseOne(body: unknown): Contact {
    if (!isContact(body)) {
        throw new ApiError('malformed', 'The contacts service sent a contact in the wrong shape.');
    }

    return body;
}

/* One `catchError` per request, and all of them land here.

   The signature is the awkward part of RxJS's error channel: `error` is `any`,
   so this function has to decide what it was given. An ApiError is already
   mapped (thrown by the parsers above) and must pass through unchanged -
   without that check, a malformed body would be reported as a server error. */
function fail(error: unknown): Observable<never> {
    if (error instanceof ApiError) return throwError(() => error);

    if (error instanceof HttpErrorResponse) return throwError(() => toApiError(error));

    return throwError(
        () => new ApiError('server', 'Something went wrong talking to the contacts service.')
    );
}
