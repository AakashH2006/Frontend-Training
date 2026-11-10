/* Day 52 - every request, in one list, with how long it took.

   This started as a `console.debug` in an interceptor and became a service for
   the reason Day 48 gave: a notice raised in one place and shown in another
   with no common parent is a service. It is also the only way to *verify* an
   interceptor from outside the app - a probe can read a rendered list and
   cannot read the console.

   What it demonstrates is the thing that makes interceptors worth having:
   this file knows nothing about contacts, and it sees every request the app
   makes, including the ones the fake backend answers without a network. */

import { HttpErrorResponse, HttpEventType, type HttpInterceptorFn } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { tap } from 'rxjs';

export interface HttpLogEntry {
    readonly id: number;
    readonly method: string;
    readonly url: string;
    /* `null` while the request is in flight, which is a state the UI shows and
       therefore a state the type has to allow. */
    readonly status: number | null;
    readonly ms: number | null;
    /* Day 56: the correlation id, read from the header another interceptor
       put on the request - and `null` when there is not one, which is the
       honest type for "this depends on what sits above me in the chain". If
       `requestIdInterceptor` were moved below the log, every entry here would
       show null and nothing else would break. That is the whole lesson about
       order, expressible as a type. */
    readonly requestId: string | null;
}

@Injectable({ providedIn: 'root' })
export class HttpLogService {
    private nextId = 1;

    private readonly entriesSignal = signal<readonly HttpLogEntry[]>([]);

    readonly entries = this.entriesSignal.asReadonly();
    readonly pending = computed(() => this.entries().filter((e) => e.status === null).length);

    start(method: string, url: string, requestId: string | null): number {
        const id = this.nextId++;

        this.entriesSignal.update((entries) => [
            /* Last six. Day 48's notifications service keeps five for the same
               reason: an unbounded log in a root service is a slow leak. */
            ...entries.slice(-5),
            { id, method, url, status: null, ms: null, requestId }
        ]);

        return id;
    }

    finish(id: number, status: number, ms: number): void {
        this.entriesSignal.update((entries) =>
            entries.map((entry) => (entry.id === id ? { ...entry, status, ms: Math.round(ms) } : entry))
        );
    }
}

/* The interceptor itself is a function, which is new since the NgModule days -
   `HttpInterceptor` was a class with an `intercept` method and had to be
   provided with a multi-provider and `useExisting`. A functional interceptor
   is a function in an array, and `inject()` works inside it because it runs in
   an injection context.

   The signature is the whole model: `(req, next) => Observable<HttpEvent>`.
   `next(req)` passes the request down the chain, and whatever comes back is a
   stream of events. So an interceptor can change the request on the way in,
   the response on the way out, both, or neither - and it is the same shape as
   middleware anywhere else. */
export const logInterceptor: HttpInterceptorFn = (req, next) => {
    const log = inject(HttpLogService);
    const started = performance.now();

    /* Day 56: reading a header that an interceptor ABOVE this one set.

       This line is the proof that the chain is ordered, and it is one line.
       `requestIdInterceptor` runs first, clones the request with the header,
       and passes the clone down - so by the time this function is called, `req`
       is the clone and the header is there. Nothing here knows which
       interceptor set it or that one exists. */
    const id = log.start(req.method, req.urlWithParams, req.headers.get('X-Request-Id'));

    return next(req).pipe(
        tap({
            next: (event) => {
                /* The chain emits more than one kind of event - Sent, then
                   UploadProgress, then Response - and the type discriminant is
                   how you tell them apart. Treating every `next` as the
                   response is a mistake that only shows up once you turn on
                   progress reporting. */
                if (event.type === HttpEventType.Response) {
                    log.finish(id, event.status, performance.now() - started);
                }
            },
            /* An error is a notification on the same stream, not a separate
               channel - so without this the entry would stay "pending"
               forever, which is exactly what the first version did. */
            error: (error: unknown) => {
                const status = error instanceof HttpErrorResponse ? error.status : 0;
                log.finish(id, status, performance.now() - started);
            }
        })
    );
};
