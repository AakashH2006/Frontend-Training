/* Day 56 - the interceptor chain, which is the first thing this week that is
   easier to test than to see.

   `HttpTestingController` replaces the BACKEND, not the chain - so a request
   made through `HttpClient` here walks down the real interceptors, reaches the
   testing backend instead of the fake server, and walks back up. That makes
   the chain itself the thing under test, which is what Day 52's spec could not
   do: it tested the fake backend by asking it questions, and never looked at
   the pipeline above it.

   Two things in here are only testable because the array is a value.

   THE ORDER IS A PARAMETER. `setup()` takes the interceptors to install, so
   the ordering claims in app.config.ts stop being comments and become tests
   with numbers in them. One of those claims turned out to be wrong - I had
   predicted that moving the log below the retry would turn one request into
   three log lines, and it does not - and the last describe block is the
   measurement and the explanation. Being able to be wrong in a way that
   prints a number is the reason to write the spec at all.

   THE DELAYS ARE REAL. These tests wait for the backoff rather than faking
   the clock, because a fake clock would mean the thing being asserted is my
   model of RxJS's scheduler rather than the behaviour - and the backoff is the
   part most likely to be wrong.

   What they do not wait for is 300ms. The first version of this file used the
   interceptor's real base, and the suite went from Day 55's 3.8s to 14.2s -
   10.2s of it these nineteen tests sleeping. So the base became
   `API_RETRY_DELAY`, a token, and this spec asks for 20ms: real timers, real
   scheduler, a quarter of the waiting. Measured after: 2.6s for this file,
   7.3s for the suite. One test keeps the production value, because "the
   default is 300ms" is itself worth asserting. */

import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { type HttpInterceptorFn } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { defer, firstValueFrom, lastValueFrom } from 'rxjs';

import { HttpLogService, logInterceptor } from './http-log.service';
import { requestIdInterceptor, retryInterceptor } from './interceptors';
import { API_RETRIES, API_RETRY_DELAY } from './tokens';

/* The real app's order, named once so the tests that use it read as "the
   chain as shipped" rather than as four imports in a row. The fake backend is
   not in it: the testing backend takes its place. */
const AS_SHIPPED: readonly HttpInterceptorFn[] = [
    requestIdInterceptor,
    logInterceptor,
    retryInterceptor
];

describe('the interceptor chain', () => {
    let http: HttpTestingController;
    let client: HttpClient;
    let log: HttpLogService;

    /* 20ms, not 300. See the note at the top of the file. Every `await` below
       is a multiple of this. */
    const FAST = 20;

    const setup = (
        chain: readonly HttpInterceptorFn[] = AS_SHIPPED,
        retries = 2,
        delay: number = FAST
    ) => {
        TestBed.resetTestingModule();

        TestBed.configureTestingModule({
            providers: [
                provideHttpClient(withInterceptors([...chain])),
                provideHttpClientTesting(),
                /* A token, overridden per test - which is the distinction
                   Day 56's settings service is built on. The retry count is
                   configuration: decided once, injected, never changed by a
                   person. The latency is state, and lives in a signal. */
                { provide: API_RETRIES, useValue: retries },
                { provide: API_RETRY_DELAY, useValue: delay }
            ]
        });

        http = TestBed.inject(HttpTestingController);
        client = TestBed.inject(HttpClient);
        log = TestBed.inject(HttpLogService);
    };

    /* Long enough for one backoff to have fired, and nothing longer - a test
       that waits for the whole chain of delays at once cannot say which attempt
       it is looking at. The first backoff is FAST, the second is twice that,
       and these add a margin on top. */
    const waitForBackoff = (ms: number) => new Promise<void>((resolve) => { setTimeout(resolve, ms); });
    const firstBackoff = () => waitForBackoff(FAST * 4);
    const secondBackoff = () => waitForBackoff(FAST * 6);

    const serverError = { status: 503, statusText: 'Service Unavailable' };

    afterEach(() => {
        http.verify();
    });

    describe('the correlation id', () => {
        beforeEach(() => { setup(); });

        it('puts an id on every request', async () => {
            const result = firstValueFrom(client.get('/api/contacts'));
            const request = http.expectOne('/api/contacts');

            /* The shape, not the value: r<counter>-<five random characters>.
               Asserting the exact string would be asserting Math.random. */
            expect(request.request.headers.get('X-Request-Id')).toMatch(/^r\d+-[a-z0-9]{1,5}$/);

            request.flush({ contacts: [] });
            await result;
        });

        it('gives two requests two different ids', async () => {
            const first = firstValueFrom(client.get('/api/a'));
            const firstRequest = http.expectOne('/api/a');
            firstRequest.flush({});
            await first;

            const second = firstValueFrom(client.get('/api/b'));
            const secondRequest = http.expectOne('/api/b');
            secondRequest.flush({});
            await second;

            expect(firstRequest.request.headers.get('X-Request-Id')).not.toBe(
                secondRequest.request.headers.get('X-Request-Id')
            );
        });

        it('reuses one id across the retries of a single request', async () => {
            const result = lastValueFrom(client.get('/api/flaky'));

            const first = http.expectOne('/api/flaky');
            const id = first.request.headers.get('X-Request-Id');
            first.flush({ message: 'nope' }, serverError);

            await firstBackoff();

            const second = http.expectOne('/api/flaky');

            /* The same id, which is the whole reason `requestIdInterceptor`
               sits ABOVE the retry. A server's log can then tell "this client
               asked once and we failed it twice" from "this client asked
               twice", and that distinction is the only thing a correlation id
               is for. Below the retry, each attempt would get a fresh id and
               the header would be decoration. */
            expect(second.request.headers.get('X-Request-Id')).toBe(id);

            second.flush({ ok: true });
            await result;
        });

        it('is readable by the log, which sits below it', async () => {
            const result = firstValueFrom(client.get('/api/contacts'));
            const request = http.expectOne('/api/contacts');
            request.flush({});
            await result;

            /* The log did not invent this - it read a header off a request
               something above it had cloned. */
            expect(log.entries()[0]?.requestId).toBe(
                request.request.headers.get('X-Request-Id')
            );
        });

        it('leaves the log nothing to read when it runs below the log', async () => {
            setup([logInterceptor, requestIdInterceptor, retryInterceptor]);

            const result = firstValueFrom(client.get('/api/contacts'));
            http.expectOne('/api/contacts').flush({});
            await result;

            /* Null, and nothing else breaks - which is exactly why an ordering
               mistake in a chain is hard to notice. The app works; one column
               is empty. */
            expect(log.entries()[0]?.requestId).toBeNull();
        });
    });

    describe('retrying', () => {
        beforeEach(() => { setup(); });

        it('re-sends a GET that failed with a 5xx and returns the second answer', async () => {
            const result = lastValueFrom(client.get<{ ok: boolean }>('/api/flaky'));

            http.expectOne('/api/flaky').flush({ message: 'nope' }, serverError);

            /* Nothing yet: the backoff is a timer, so there is deliberately no
               request in flight for 300ms. A test without this wait sees the
               retry as missing. */
            http.expectNone('/api/flaky');

            await firstBackoff();

            http.expectOne('/api/flaky').flush({ ok: true });

            /* The caller never knew. That is the point of a retry and the
               reason it needs a settings page to be observable at all. */
            expect(await result).toEqual({ ok: true });
        });

        it('sends three requests in total before giving up, with the count from the token', async () => {
            const result = lastValueFrom(client.get('/api/always-broken')).catch(
                (error: unknown) => error
            );

            /* One attempt plus two retries. `count` is the number of RETRIES,
               not the number of attempts, and reading it the other way is an
               off-by-one that only shows up under load. */
            http.expectOne('/api/always-broken').flush({ message: '1' }, serverError);
            await firstBackoff();

            http.expectOne('/api/always-broken').flush({ message: '2' }, serverError);
            await secondBackoff();

            http.expectOne('/api/always-broken').flush({ message: '3' }, serverError);

            const error = await result;

            /* And the error that reaches the app is the LAST one, not the
               first - so a server that fails differently each time reports the
               attempt the user actually waited for. */
            expect((error as { status: number }).status).toBe(503);
        });

        it('honours a retry count of zero by not retrying at all', async () => {
            setup(AS_SHIPPED, 0);

            const result = lastValueFrom(client.get('/api/flaky')).catch(() => 'failed');

            http.expectOne('/api/flaky').flush({ message: 'nope' }, serverError);
            await firstBackoff();

            /* The early return in the interceptor, as a test: with the count at
               zero it calls `next` and gets out of the way rather than
               installing a `retry` that does nothing. */
            http.expectNone('/api/flaky');
            expect(await result).toBe('failed');
        });

        it('does not re-send a POST, however the server failed', async () => {
            const result = lastValueFrom(client.post('/api/contacts', { name: 'Grace' })).catch(
                () => 'failed'
            );

            http.expectOne('/api/contacts').flush({ message: 'nope' }, serverError);
            await firstBackoff();

            /* The most important assertion in this file. A POST that timed out
               may well have succeeded, so re-sending it is how an app creates
               two contacts from one click - a bug that cannot be found by
               looking at the client. */
            http.expectNone('/api/contacts');
            expect(await result).toBe('failed');
        });

        it('does not re-send a DELETE either', async () => {
            const result = lastValueFrom(client.delete('/api/contacts/c1')).catch(() => 'failed');

            http.expectOne('/api/contacts/c1').flush({ message: 'nope' }, serverError);
            await firstBackoff();

            http.expectNone('/api/contacts/c1');
            expect(await result).toBe('failed');
        });

        for (const status of [400, 404, 409, 422]) {
            it(`does not re-send a GET that was refused with a ${status}`, async () => {
                const result = lastValueFrom(client.get('/api/contacts/nope')).catch(() => 'failed');

                http.expectOne('/api/contacts/nope').flush(
                    { message: 'no' },
                    { status, statusText: 'Refused' }
                );
                await firstBackoff();

                /* A 404 will be a 404 next time; a 409 is a decision rather
                   than a failure. Retrying any of them spends latency to get
                   the same answer, and for the 409 it is a second chance to
                   confuse somebody. */
                http.expectNone('/api/contacts/nope');
                expect(await result).toBe('failed');
            });
        }

        it('re-sends a GET that got no answer at all', async () => {
            const result = lastValueFrom(client.get<{ ok: boolean }>('/api/offline'));

            /* Status 0: offline, DNS failure, connection refused. The case most
               worth retrying and the one a check written from a table of HTTP
               status codes misses, because 0 is not an HTTP status. */
            http.expectOne('/api/offline').error(new ProgressEvent('error'), { status: 0 });

            await firstBackoff();

            http.expectOne('/api/offline').flush({ ok: true });
            expect(await result).toEqual({ ok: true });
        });
    });

    /* The ordering experiment, and the one I got wrong - which makes it the
       most valuable thing in this file.

       WHAT I PREDICTED, in app.config.ts and in interceptors.ts, both written
       before this spec: a log BELOW the retry records three entries for a
       request that is sent three times, because the retry resubscribes to
       everything beneath it. I wrote it as a settled fact, twice.

       WHAT IS MEASURED: one entry either way. Below the retry, three attempts
       over 1112ms produced exactly one log line, status 503 - the same shape as
       above the retry.

       WHY, and this is worth more than the prediction was. A functional
       interceptor's BODY runs once per request. Angular builds the chain and
       calls each function to obtain an observable; `log.start()` is a
       statement in that body, so it has already happened by the time anybody
       subscribes. What a retry resubscribes to is the OBSERVABLE each
       interceptor returned - which reaches the backend and re-sends the
       request, without re-running any interceptor function above it.

       So the general rule, which I now believe because the next two tests
       check the mechanism rather than my description of it: an eager statement
       in an interceptor happens once per REQUEST and a `defer` happens once
       per ATTEMPT, and position in the array has nothing to do with it. Order
       decides what each interceptor SEES - the header, the error, the final
       response - and not how often it runs. */
    describe('what a retry re-runs', () => {
        /* Two interceptors that differ in one way: where the counting happens.
           Local to this spec because they exist to demonstrate a mechanism and
           the app has no use for them. */
        const counters = () => {
            const counts = { eager: 0, deferred: 0 };

            const eager: HttpInterceptorFn = (req, next) => {
                counts.eager += 1;
                return next(req);
            };

            const deferred: HttpInterceptorFn = (req, next) =>
                defer(() => {
                    counts.deferred += 1;
                    return next(req);
                });

            return { counts, eager, deferred };
        };

        const threeFailedAttempts = async () => {
            const result = lastValueFrom(client.get('/api/always-broken')).catch(() => 'failed');

            http.expectOne('/api/always-broken').flush({ message: '1' }, serverError);
            await firstBackoff();
            http.expectOne('/api/always-broken').flush({ message: '2' }, serverError);
            await secondBackoff();
            http.expectOne('/api/always-broken').flush({ message: '3' }, serverError);

            await result;
        };

        it('re-runs a deferred interceptor below it, and nothing else', async () => {
            const { counts, eager, deferred } = counters();

            /* Both BELOW the retry, which is where I should have put them the
               first time: my first version of this test had them above and
               measured 1 and 1, which is correct and proves nothing. A retry
               resubscribes to what is beneath it and cannot reach what is
               above. */
            setup([requestIdInterceptor, retryInterceptor, eager, deferred]);

            await threeFailedAttempts();

            /* ONE for the eager body. It ran when Angular built the chain, to
               obtain the observable the retry is resubscribing to - so there is
               nothing left to re-run. Every `log.start()`-shaped statement in
               every interceptor in this app behaves this way, which is the
               finding. */
            expect(counts.eager).toBe(1);

            /* THREE for the deferred one, because `defer` moves its body to
               subscription time and a resubscription is a subscription. This is
               the only shape that can count attempts - and it is also how to
               write a per-attempt log if that is what you want. */
            expect(counts.deferred).toBe(3);
        });

        it('cannot reach either of them above it', async () => {
            const { counts, eager, deferred } = counters();

            setup([eager, deferred, retryInterceptor]);

            await threeFailedAttempts();

            /* Above the retry, even the deferred one runs once: it is
               subscribed once, by HttpClient, and the resubscriptions happen
               further down. Position decides what an interceptor can SEE;
               eagerness decides how often its body runs. Both matter and they
               are different axes, which is the sentence I could not have
               written before measuring these four numbers. */
            expect(counts.eager).toBe(1);
            expect(counts.deferred).toBe(1);
        });

        it('records one log entry for three attempts, whichever side of the retry it is on', async () => {
            setup(AS_SHIPPED);

            const above = lastValueFrom(client.get('/api/always-broken')).catch(() => 'failed');

            http.expectOne('/api/always-broken').flush({ message: '1' }, serverError);
            await firstBackoff();
            http.expectOne('/api/always-broken').flush({ message: '2' }, serverError);
            await secondBackoff();
            http.expectOne('/api/always-broken').flush({ message: '3' }, serverError);
            await above;

            expect(log.entries().length).toBe(1);
            expect(log.entries()[0]?.status).toBe(503);

            /* And now the other order, which I expected to be three. */
            setup([requestIdInterceptor, retryInterceptor, logInterceptor]);

            const below = lastValueFrom(client.get('/api/always-broken')).catch(() => 'failed');

            http.expectOne('/api/always-broken').flush({ message: '1' }, serverError);
            await firstBackoff();
            http.expectOne('/api/always-broken').flush({ message: '2' }, serverError);
            await secondBackoff();
            http.expectOne('/api/always-broken').flush({ message: '3' }, serverError);
            await below;

            expect(log.entries().length).toBe(1);
            expect(log.entries()[0]?.status).toBe(503);
        });

        it('times the whole thing either way, because the clock starts in the body too', async () => {
            /* The one test at the PRODUCTION base, so the 300ms default is
               asserted somewhere rather than only configured. Everything else
               in this file runs at 20ms. */
            setup(AS_SHIPPED, 2, 300);

            const result = lastValueFrom(client.get('/api/flaky'));

            http.expectOne('/api/flaky').flush({ message: 'nope' }, serverError);
            await waitForBackoff(400);
            http.expectOne('/api/flaky').flush({ ok: true });
            await result;

            /* `performance.now()` is read in the body, next to `log.start()`,
               so the duration spans every attempt and both backoffs - which is
               the number a person waited and the reason this is the right place
               for it. Measured at 1112ms for three attempts; asserted as a
               lower bound, because an upper bound would fail on a busy
               machine. */
            expect(log.entries()[0]?.ms).toBeGreaterThanOrEqual(300);
        });
    });
});
