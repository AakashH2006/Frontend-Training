/* Day 52 - one error type for everything the API can do to me.

   `HttpErrorResponse` is what HttpClient throws, and it is the wrong thing for
   a component to handle. It carries a status number, a `statusText`, a URL, an
   `error` that may be a parsed body or a `ProgressEvent`, and a `message`
   written for a developer:

       Http failure response for /api/contacts: 409 Conflict

   No part of that belongs on screen. Week 5's rule was that data gets parsed
   at the boundary into a type the rest of the app can trust; this is the same
   rule applied to failures, which I had not thought of as data before today.

   So every request maps its failure into one of five kinds, and the UI
   switches on the kind rather than on a number. The kinds are chosen by what
   the user can DO about them, which is the only distinction that matters at
   the point of rendering:

       offline    -> try again
       notFound   -> the thing is gone; go somewhere else
       conflict   -> change what you typed
       server     -> not your fault; try again later
       malformed  -> nothing; it is my bug, and it is reported honestly */

import { HttpErrorResponse } from '@angular/common/http';

export type ApiErrorKind = 'offline' | 'notFound' | 'conflict' | 'server' | 'malformed';

/* An Error subclass, because RxJS's error channel is untyped - `catchError`
   hands you `any` and a `subscribe({ error })` callback gets `unknown` at best.
   An instance is the only thing a guard can check at runtime, so this is one
   of the few places a class is better than a union of plain objects. */
export class ApiError extends Error {
    constructor(
        readonly kind: ApiErrorKind,
        message: string
    ) {
        super(message);
        /* Required when extending a built-in under a down-levelled target:
           without it `instanceof ApiError` is false, because the prototype
           chain is rebuilt by the Error constructor. The repo targets ES2022
           so it is not strictly needed, and leaving it out would make the
           guard depend on a compiler option. */
        Object.setPrototypeOf(this, ApiError.prototype);
        this.name = 'ApiError';
    }
}

export function isApiError(value: unknown): value is ApiError {
    return value instanceof ApiError;
}

/* The mapping, in one place.

   Status 0 is the one worth knowing: it is not an HTTP status at all. The
   browser uses it when the request never got an answer - no network, DNS
   failure, CORS rejection, or a server that is not running. Day 18 met the
   same thing as a `fetch` that rejects rather than resolving with `ok: false`,
   and this is the Angular shape of that distinction. */
export function toApiError(response: HttpErrorResponse): ApiError {
    if (response.status === 0) {
        return new ApiError(
            'offline',
            'The contacts service could not be reached. Check your connection and try again.'
        );
    }

    if (response.status === 404) {
        return new ApiError('notFound', 'That contact no longer exists on the server.');
    }

    if (response.status === 409) {
        /* The only kind that uses the server's own words, because the server
           is the only thing that knows which field conflicted. Everything
           else gets a message written here, where it can be phrased for a
           reader rather than for a log. */
        return new ApiError('conflict', serverMessage(response) ?? 'That change conflicts with a contact already on the server.');
    }

    if (response.status >= 500) {
        return new ApiError('server', `The contacts service failed (${String(response.status)}). Nothing was saved.`);
    }

    return new ApiError(
        'server',
        `The contacts service refused the request (${String(response.status)}).`
    );
}

/* A JSON error body is `unknown` until it is checked, exactly like a JSON
   success body. The temptation is `response.error.message`, which compiles
   under a loose config and throws on an HTML error page. */
function serverMessage(response: HttpErrorResponse): string | null {
    const body: unknown = response.error;

    if (typeof body !== 'object' || body === null) return null;

    const message: unknown = (body as Record<string, unknown>)['message'];
    return typeof message === 'string' && message.length > 0 ? message : null;
}
