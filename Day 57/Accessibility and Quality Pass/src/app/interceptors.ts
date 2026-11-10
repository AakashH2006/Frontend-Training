/* Day 56 - two more interceptors, and what their ORDER does.

   Day 52 had two: a log and a whole fake backend. Both were obviously useful
   and neither made me think about the chain. These two do, because one changes
   the request on the way down and the other re-sends it, and the order they
   sit in decides what the other one sees.

       withInterceptors([requestId, log, retry, fakeApi])

   A request walks DOWN that array; the response walks back UP it. So:

     - `requestId` is first, so every request below it has the header -
       including the ones `retry` re-sends, which carry the SAME id, so a
       server's logs can tell "asked once, failed twice" from "asked twice"
     - `log` is below `requestId`, which is the only reason it can print that
       id at all
     - `retry` is above the backend, so what it resubscribes to is the request
       itself and nothing else gets re-run
     - `fakeApi` is last, which is where a backend belongs

   AND ONE PREDICTION HERE WAS WRONG, which is worth more than the rest of this
   comment. I had written that moving `log` below `retry` turns one failed
   request into three log lines. It does not: interceptors.spec.ts measures one
   line either way, because an interceptor's BODY runs once per request. The
   chain is built by calling each function to get an observable, so
   `log.start()` has already happened before anybody subscribes; what a retry
   resubscribes to is the observable, which reaches the backend and re-sends
   without re-running any interceptor function.

   The rule that replaces it, which the spec checks on four numbers rather than
   on my description: ORDER decides what an interceptor can SEE - the header,
   the error, the final response - and EAGERNESS decides how often its body
   runs. A `defer` below the retry runs once per attempt; everything else runs
   once per request, wherever it sits. */

import {
    HttpErrorResponse,
    type HttpInterceptorFn,
    type HttpRequest
} from '@angular/common/http';
import { inject } from '@angular/core';
import { retry, throwError, timer } from 'rxjs';

import { API_RETRIES, API_RETRY_DELAY } from './tokens';

/* ---- a correlation id ---- */

/* The one-line interceptor, and the shape worth remembering: change the
   request by CLONING it.

       req.clone({ setHeaders: { … } })

   An `HttpRequest` is immutable and `clone` is the only way to change one -
   the same design as `HttpParams` on Day 55 and for the same reason. Mutating
   `req.headers` would either throw or silently do nothing depending on the
   property, and `setHeaders` merges rather than replacing, so this cannot
   accidentally drop a Content-Type somebody else set.

   What it is for: a real server logs this and so does the client, so one id
   links a line in the browser's log to a line in the server's. There is no
   real server here, so the visible half is `logInterceptor` reading the header
   back off the request and the shell printing it - which is also the proof
   that this interceptor runs above that one, since a log above this would
   print nothing. */
export const requestIdInterceptor: HttpInterceptorFn = (req, next) =>
    next(req.clone({ setHeaders: { 'X-Request-Id': newId() } }));

let counter = 0;

function newId(): string {
    counter += 1;

    /* `crypto.randomUUID()` is available and a UUID in a log line is six
       characters of signal and thirty of noise. A short counter plus a random
       suffix is readable, unique within a session, and obviously not meant to
       be a database key. */
    return `r${counter}-${Math.random().toString(36).slice(2, 7)}`;
}

/* ---- retrying ---- */

/* `retry` from RxJS, not a loop.

   Because an HttpClient observable is COLD - Day 52's first lesson - resubscribing
   to it performs the request AGAIN. That is the entire implementation of a
   retry, and it is the first time coldness has been something I wanted rather
   than something to be careful about.

       retry({ count, delay })

   `delay` as a FUNCTION rather than a number, because a fixed delay is the
   wrong shape: if a server is briefly overloaded, every client retrying at
   exactly 300ms arrives together and overloads it again. Doubling (300, 600)
   spreads them out. Real backoff adds jitter; two attempts do not need it, and
   writing jitter I cannot observe would be decoration.

   The base comes from `API_RETRY_DELAY` rather than being the literal 300 it
   was until the spec was written, so a test can wait 20ms instead of 300 and
   still wait on the real scheduler.

   WHAT IS NOT RETRIED is the more important half.

     - Only GET. A POST that timed out may well have succeeded, and re-sending
       it is how you create two contacts. Idempotency is the property that
       makes a retry safe, and only the method can tell us.
     - Only 0 and 5xx. A 404 will be a 404 next time; a 409 is a decision, not
       a failure; a 400 is this client's bug. Retrying any of them is latency
       spent to get the same answer, and for a 409 it is a second chance to
       confuse the user.

   `throwError` for anything else, which re-raises immediately and lets
   `api-error.ts` map it as usual. */
export const retryInterceptor: HttpInterceptorFn = (req, next) => {
    const attempts = inject(API_RETRIES);
    const base = inject(API_RETRY_DELAY);

    if (attempts < 1 || !isRetryable(req)) return next(req);

    return next(req).pipe(
        retry({
            count: attempts,
            delay: (error: unknown, attempt: number) => {
                if (!worthRetrying(error)) return throwError(() => error);

                /* 300ms, then 600ms, with the default base. `attempt` is
                   1-based, which is the off-by-one worth checking: using it
                   directly would make the first wait 600ms. */
                return timer(base * 2 ** (attempt - 1));
            }
        })
    );
};

function isRetryable(req: HttpRequest<unknown>): boolean {
    return req.method === 'GET';
}

function worthRetrying(error: unknown): boolean {
    if (!(error instanceof HttpErrorResponse)) return false;

    /* 0 is "no answer at all" - offline, DNS, a connection refused. The one
       most worth retrying and the one a status-code check written from a
       table of HTTP codes would miss. */
    return error.status === 0 || error.status >= 500;
}
