/* Day 56 - the knobs the settings page turns, and why they are a service
   rather than more tokens.

   `API_LATENCY` is an injection token and stays one. A token is CONFIGURATION:
   decided when the app is built or when a test is set up, injected once, never
   changed. These are STATE: changed by a person, at runtime, while the app is
   running, and read again on the next request.

   That distinction took me three days to be able to state. Day 47 introduced
   tokens and I used them for anything adjustable; Day 52 added `API_LATENCY`
   and a probe that overrode it. Both of those are configuration. A slider on a
   settings page is not, and the giveaway is that a token's value cannot change
   after injection - so a token read once by the fake server could never follow
   it.

   So the token supplies the DEFAULT, injected here as the initial value, and
   the service owns what happens after. Nothing else changes: `fake-api.ts`
   injects this instead of the token and reads a signal instead of a number. */

import { Injectable, inject, signal } from '@angular/core';

import { API_LATENCY } from './tokens';

@Injectable({ providedIn: 'root' })
export class SettingsService {
    private readonly latencySignal = signal(inject(API_LATENCY));

    /* How many of the next requests the fake server should refuse with a 503.

       This is the only reason the retry interceptor is observable in the real
       app rather than only in its spec. Two attempts and a server that fails
       once means the user sees nothing at all - which is the point of a retry
       and is indistinguishable from nothing happening unless you can cause it
       deliberately and watch the log.

       A countdown rather than a boolean, so "fail once" and "fail everything"
       are both expressible. */
    private readonly failuresSignal = signal(0);

    readonly latency = this.latencySignal.asReadonly();
    readonly failures = this.failuresSignal.asReadonly();

    setLatency(ms: number): void {
        /* Clamped, because this comes from a range input whose attributes are
           a suggestion rather than a guarantee - and a negative latency would
           reach `timer(-1)`, which fires immediately and looks like the
           setting did nothing. */
        this.latencySignal.set(Math.min(2000, Math.max(0, Math.round(ms))));
    }

    failNext(count: number): void {
        this.failuresSignal.set(Math.min(10, Math.max(0, Math.round(count))));
    }

    /* Called by the fake server, which is the only caller: it asks whether
       THIS request should fail and the answer consumes one of the failures.

       A method that mutates and returns, which I would normally avoid - but
       the alternative is the server reading a signal and then calling a
       separate `consume()`, and two calls that must happen together are worse
       than one that does both. */
    shouldFail(): boolean {
        if (this.failuresSignal() === 0) return false;

        this.failuresSignal.update((n) => n - 1);
        return true;
    }
}
