/* Day 53 - the pipeline, which is the whole point of the day.

   A typeahead is the one piece of UI that needs most of RxJS at once, and
   building it by hand explained more than any amount of reading about
   operators did. The declaration is nine lines and every one of them is load
   bearing:

       query (a signal)
         -> toObservable      cross into the stream world
         -> map(trim)         normalise before anything compares
         -> debounceTime      stop asking on every keystroke
         -> distinctUntilChanged   stop asking the same thing twice
         -> switchMap         abandon the answer to the question I stopped
                              asking
         -> toSignal          cross back, so the template can just read it

   The two boundaries are the interesting part. The state is a signal because
   everything in this app is, and the middle is a stream because *time* is the
   thing being manipulated - and signals have nothing to say about time.

   Day 46 said a signal is a value that notifies. The missing word was "now":
   a signal has no concept of "the value 250ms after the last change", and
   `debounceTime` is exactly that. */

import { Injectable, computed, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import {
    catchError,
    debounceTime,
    distinctUntilChanged,
    map,
    of,
    shareReplay,
    switchMap,
    tap
} from 'rxjs';

import { asApiError } from './contacts.service';
import { DirectoryApi, type DirectoryEntry } from './directory.api';

/* Day 57: results AND the query they answer, carried together.

   The pipeline used to emit a bare array, and that array arrives 250ms plus a
   round trip after the keystroke that asked for it. So between a keystroke and
   its answer there was a window in which `results()` held the previous query's
   rows while `query()` held the new text - and anything that combined the two
   described neither:

       1 match for "ada"      <- typed 'ad'; the count is still ada's
       No matches for "ada"   <- typed 'ada' after clearing; results are empty

   Both of those are real measurements, taken from the live region once the app
   started saying its result counts out loud. The visible paragraph had been
   doing the same thing since Day 53 and nobody noticed, which is the whole
   argument for making an app speak: a wrong count shown for a quarter of a
   second looks like a render, and a wrong count READ OUT is a sentence.

   The fix is to make the answer self-describing. `searching` cannot do this
   job - it is set when the request starts, which is after the debounce, so it
   is false during exactly the window that is wrong. */
interface Answer {
    readonly query: string;
    readonly entries: readonly DirectoryEntry[];
}

/* Below two characters the search does not run at all: one letter matches most
   of a directory and costs the server the most to answer. The server agrees -
   it is slowest for the broadest queries - so this is the client declining to
   ask the expensive question. */
const MIN_QUERY = 2;
const DEBOUNCE_MS = 250;

@Injectable({ providedIn: 'root' })
export class DirectoryService {
    private readonly api = inject(DirectoryApi);

    private readonly querySignal = signal('');
    private readonly searchingSignal = signal(false);
    private readonly errorSignal = signal<string | null>(null);

    readonly query = this.querySignal.asReadonly();
    readonly searching = this.searchingSignal.asReadonly();
    readonly error = this.errorSignal.asReadonly();

    readonly tooShort = computed(
        () => this.query().trim().length > 0 && this.query().trim().length < MIN_QUERY
    );

    private readonly answer = toSignal(
        /* `toObservable` is NOT a cheap conversion to know about: it watches
           the signal with an effect and emits on change, so it emits
           asynchronously and it needs an injection context. In a field
           initialiser of a root service, both are satisfied. */
        toObservable(this.querySignal).pipe(
            map((query) => query.trim()),

            /* debounceTime BEFORE distinctUntilChanged, which matters.

               The other order compares every keystroke and then waits, so
               typing "ada" and deleting back to "ad" sends a request for "ad"
               that the debounce would have swallowed. Debouncing first means
               only what the user settled on is ever compared. */
            debounceTime(DEBOUNCE_MS),

            /* The one that saves the most requests in practice: selecting all
               and retyping the same word, or pressing a modifier key, changes
               the signal without changing the string. */
            distinctUntilChanged(),

            tap((query) => {
                this.errorSignal.set(null);
                this.searchingSignal.set(query.length >= MIN_QUERY);
            }),

            /* switchMap, and this is the operator the whole exercise is about.

               All four of the flattening operators would "work" in the sense
               that results would appear:

                 mergeMap   runs everything, keeps every answer       - WRONG
                 concatMap  runs in order, waits for each             - slow
                 exhaustMap ignores new input while one is running    - worse
                 switchMap  unsubscribes the previous, keeps the last - right

               `mergeMap` is the one that looks right in a demo and is broken
               in production: a slow answer to an abandoned query arrives after
               a fast answer to the current one and overwrites it. The server
               here is deliberately slower for shorter queries so that this
               happens every time, and the measurement is in the notes.

               What `switchMap` actually does is unsubscribe, and unsubscribing
               an HttpClient request aborts it. So the abandoned query is both
               ignored AND cancelled, which is the difference between this and
               filtering stale responses by hand with a request id. */
            switchMap((query) =>
                query.length < MIN_QUERY
                    ? of<Answer>({ query, entries: [] })
                    : this.api.search(query).pipe(
                          map((entries) => ({ query, entries })),
                          /* Inside the switchMap, not outside.

                             A `catchError` on the outer pipeline would end the
                             whole stream on the first failure - the search box
                             would silently stop working for the rest of the
                             session. Inside, it ends only this one request and
                             the next keystroke tries again. That asymmetry is
                             the single most useful thing I now know about
                             error handling in a pipeline. */
                          catchError((error: unknown) => {
                              this.errorSignal.set(asApiError(error).message);
                              /* The query goes into the failure too, so a
                                 failed search is SETTLED - the error belongs
                                 to this query and may be shown against it. */
                              return of<Answer>({ query, entries: [] });
                          })
                      )
            ),

            tap(() => { this.searchingSignal.set(false); })
        ),
        /* An initial value, because a signal must always have one and the
           stream has not emitted yet.

           The alternative is `{ requireSync: true }`, which throws unless the
           source emits synchronously on subscribe. `toObservable` never does -
           it emits from an effect - so `requireSync` here would be a crash on
           startup rather than a type error. Worth knowing which of the two
           options is a promise about timing. */
        { initialValue: { query: '', entries: [] } as Answer }
    );

    readonly results = computed(() => this.answer().entries);

    /* The query the rows in hand are an answer to. */
    readonly answeredQuery = computed(() => this.answer().query);

    /* Whether what is in hand describes what is in the box.

       False from the keystroke until the answer lands, which covers the
       debounce, the request and the gap between them that `searching` misses.
       Anything that renders or announces a count has to check this; see the
       Answer note above for what it looked like when nothing did. */
    readonly settled = computed(() => this.answeredQuery() === this.query().trim());

    /* One request, two consumers.

       `DirectoryApi.size()` is cold, so each subscriber gets its own request.
       Two components want this number - the search panel and the About page -
       and without sharing the log shows two identical GETs.

       `shareReplay({ bufferSize: 1, refCount: false })` makes the first
       subscription perform the request and every later one receive the
       remembered answer. `refCount: false` keeps it cached after the last
       subscriber leaves, which is right for something that does not change;
       `refCount: true` would re-request on the next navigation back.

       The subtlety is that this is a FIELD, so the sharing is per instance of
       this service - and the service is `providedIn: 'root'`, so there is one.
       Writing `shareReplay` inside the method, returning a fresh pipeline each
       call, shares nothing at all and looks identical. */
    readonly size$ = this.api.size().pipe(shareReplay({ bufferSize: 1, refCount: false }));

    setQuery(query: string): void {
        this.querySignal.set(query);
    }

    clear(): void {
        this.querySignal.set('');
    }
}
