/* Day 52 - the API client.

   This file is the whole of the app's knowledge about HTTP. Nothing else
   imports HttpClient, nothing else knows a URL, and nothing else has seen an
   HttpErrorResponse - which is the same boundary Week 5 drew around
   `localStorage` and Day 47 drew around storage, one layer further out.

   Two things about HttpClient that took a day to properly absorb.

   1. THE OBSERVABLE IS COLD. `http.get(...)` performs no request. It returns a
      recipe, and subscribing runs it; subscribing twice runs it twice. A
      promise from `fetch` is the opposite - the request is already in flight
      before anybody awaits it. Every bug I had today came from forgetting
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
      skip. */

import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { catchError, map, type Observable, throwError } from 'rxjs';

import { ApiError, toApiError } from './api-error';
import { isContact, type Contact, type ContactDraft } from './domain';
import { API_BASE } from './tokens';

/* What a list request produces: the rows this client could read, and a count
   of the ones it could not.

   Day 47's storage service reports skipped rows the same way, for the same
   reason - "4 of 5" and "4" are different facts, and only one of them can be
   shown to a user who is wondering where somebody went. */
export interface ContactList {
    readonly contacts: readonly Contact[];
    readonly skipped: number;
}

@Injectable({ providedIn: 'root' })
export class ContactsApi {
    private readonly http = inject(HttpClient);
    private readonly base = inject(API_BASE);

    /* GET /api/contacts */
    list(): Observable<ContactList> {
        return this.http
            .get<unknown>(`${this.base}/contacts`)
            .pipe(map(parseList), catchError(fail));
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

/* `{ contacts: [...] }` rather than a bare array, which is a choice the server
   made and this parser's job to know about. An envelope leaves room to add a
   total or a cursor without changing the shape; a bare array does not. */
function parseList(body: unknown): ContactList {
    if (typeof body !== 'object' || body === null) {
        throw new ApiError('malformed', 'The contacts service sent something that is not a list.');
    }

    const rows: unknown = (body as Record<string, unknown>)['contacts'];

    if (!Array.isArray(rows)) {
        throw new ApiError('malformed', 'The contacts service sent a list in the wrong shape.');
    }

    /* The same guard the client has used on untrusted data since Week 5, and
       the same treatment: keep what parses, count what does not, carry on.
       An exception here would mean one bad row from a server I do not control
       takes down a screen that could have shown the other four. */
    const contacts = rows.filter(isContact);

    return { contacts, skipped: rows.length - contacts.length };
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
