/* Day 53 - the directory: data the client never holds.

   Everything so far has been a list small enough to load once and filter in
   memory, which is why none of the operators I was supposed to be learning had
   anything to do. Day 52's search still filtered an array.

   The directory is the opposite case and it is the common one: a few thousand
   people the client has no business downloading, searched by asking. That one
   change is what makes `debounceTime`, `distinctUntilChanged` and `switchMap`
   necessary rather than decorative - and it is why I added a second endpoint
   instead of rewriting the first.

   The fake server is deliberately SLOWER FOR BROADER QUERIES:

       2 letters -> 800ms      more rows to scan
       3 letters -> 500ms
       4 letters -> 200ms
       5+        -> 100ms

   The spread is wider than the client's 250ms debounce on purpose. If it were
   narrower, a stale answer could never overtake a fresh one and the race below
   would be unreachable - which is how most typeaheads pass a demo and fail in
   production.

   which is realistic and, more usefully, makes the response order go wrong on
   purpose. See `directory.service.ts`. */

import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { catchError, map, type Observable, throwError } from 'rxjs';

import { ApiError, toApiError } from './api-error';
import { API_BASE } from './tokens';

export interface DirectoryEntry {
    readonly id: string;
    readonly name: string;
    readonly title: string;
    readonly email: string;
}

export function isDirectoryEntry(value: unknown): value is DirectoryEntry {
    if (typeof value !== 'object' || value === null) return false;

    const entry = value as Record<string, unknown>;

    return (
        typeof entry['id'] === 'string' &&
        typeof entry['name'] === 'string' &&
        typeof entry['title'] === 'string' &&
        typeof entry['email'] === 'string'
    );
}

@Injectable({ providedIn: 'root' })
export class DirectoryApi {
    private readonly http = inject(HttpClient);
    private readonly base = inject(API_BASE);

    /* GET /api/directory?q=...

       `params` rather than string concatenation, because HttpClient encodes
       them - `?q=a%20b` is done for me, and a query with an `&` in it does not
       silently become two parameters. Day 51 learned the same thing about
       route segments in `router.navigate`. */
    search(query: string): Observable<readonly DirectoryEntry[]> {
        return this.http
            .get<unknown>(`${this.base}/directory`, { params: { q: query } })
            .pipe(map(parsePeople), catchError(fail));
    }

    /* GET /api/directory/size - one number, wanted by two components.

       This exists for the `shareReplay` demonstration in the service, and it
       is the honest version of it: two unrelated components want the same
       fact, and without sharing they each pay for it. */
    size(): Observable<number> {
        return this.http.get<unknown>(`${this.base}/directory/size`).pipe(
            map((body) => {
                const total: unknown =
                    typeof body === 'object' && body !== null
                        ? (body as Record<string, unknown>)['total']
                        : undefined;

                if (typeof total !== 'number') {
                    throw new ApiError('malformed', 'The directory sent a size that is not a number.');
                }

                return total;
            }),
            catchError(fail)
        );
    }
}

function parsePeople(body: unknown): readonly DirectoryEntry[] {
    if (typeof body !== 'object' || body === null) {
        throw new ApiError('malformed', 'The directory sent something that is not a list.');
    }

    const rows: unknown = (body as Record<string, unknown>)['people'];

    if (!Array.isArray(rows)) {
        throw new ApiError('malformed', 'The directory sent a list in the wrong shape.');
    }

    return rows.filter(isDirectoryEntry);
}

function fail(error: unknown): Observable<never> {
    if (error instanceof ApiError) return throwError(() => error);
    if (error instanceof HttpErrorResponse) return throwError(() => toApiError(error));
    return throwError(() => new ApiError('server', 'Something went wrong searching the directory.'));
}
