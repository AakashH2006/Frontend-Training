/* Day 52, rebuilt on Day 55 - the service, now a query rather than a cache.

   Day 52's shape was: load everything once into a signal, then derive. Day 55
   replaces the load with a PIPELINE, because the query lives in the URL and
   every change to it is a new request:

       querySignal           a ContactQuery, set from the route's parameters
         -> toObservable     the signal as a stream
         -> distinctUntilChanged   the same question is not asked twice
         -> switchMap        the previous answer is abandoned, not ignored
         -> toSignal         back to a signal, for the templates

   That is Day 53's directory pipeline applied to the app's main screen, and
   the reason this is the week's build: the router supplies the query, RxJS
   sequences it, HttpClient performs it, and Day 54's tools are what let me
   assert that the cancellation actually happens.

   WHAT WAS LOST, and it is worth being honest about it. Day 50 derived
   `counts`, `favourites` and `allTags` from the full list with computeds, and
   I wrote at the time that derived state cannot go stale because there is
   nothing to keep in sync. All three are gone from here. Not because the
   technique stopped working - because the PREMISE did. A computed can only
   derive what the client has, and the client now has three rows out of five.
   `counts` and `favourites` come from the server in the envelope; `allTags`
   was only ever feeding the form's datalist and now comes from the rows on
   screen, which makes it a worse suggestion list and an honest one.

   DAY 60 finished that sentence properly. "A worse suggestion list and an
   honest one" was a fair description of a limitation and a bad excuse for
   leaving it: the list got worse the more contacts existed, which is the
   wrong direction for anything to scale. There is now a `GET /api/tags`, and
   `tags()` below is a request rather than a computed - for the same reason
   `one(id)` is. All three of Day 55's lost aggregates are now transmitted.

   The rule that replaces it: derived state is only derivable while you hold
   all the data. The moment a server pages, every aggregate is a fact about
   rows you have not seen, and it has to be transmitted rather than computed. */

import { Injectable, computed, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import {
    catchError,
    defer,
    distinctUntilChanged,
    filter,
    finalize,
    map,
    type Observable,
    of,
    scan,
    startWith,
    switchMap,
    tap,
    throwError
} from 'rxjs';

import { ApiError, isApiError } from './api-error';
import { ContactsApi, type ContactPage, type ContactQuery } from './contacts.api';
import {
    isFilter,
    isSort,
    type Contact,
    type ContactDraft,
    type Group,
    type TagCount
} from './domain';

export type LoadStatus = 'loading' | 'ready' | 'failed';

export const DEFAULT_QUERY: ContactQuery = { q: '', filter: 'all', sort: 'added', page: 1 };

const EMPTY_COUNTS: Record<Group, number> = { family: 0, friends: 0, work: 0, other: 0 };

/* What the stream carries.

   One object rather than three signals, because `status`, `page` and `error`
   change together and three signals can disagree for one tick - which is Day
   42's argument for a computed, arriving in a stream. */
interface Outcome {
    readonly status: LoadStatus;
    readonly page: ContactPage | null;
    readonly error: ApiError | null;
    /* WHICH query this answer is for, which the first version did not carry
       and had to learn to. The contacts page corrects the URL when the server
       clamps the page number, and without this it was comparing the newest
       answer against the newest question - two things that are only about the
       same search when nothing is in flight. Day 55's router spec caught it
       as a stray navigation and a second request; the symptom on screen would
       have been a filter click that bounced back to page 2. */
    readonly query: ContactQuery | null;
}

const INITIAL: Outcome = { status: 'loading', page: null, error: null, query: null };

/* A query plus a nonce, and the nonce is the interesting half.

   `distinctUntilChanged` is what stops the same question being asked twice -
   and it also stops `refresh()` working, because a deliberate reload IS the
   same question. Day 53 hit the harmless version of this (retyping a word the
   directory had already answered) and wanted the request suppressed. Here it
   has to be possible to say "ask again anyway", so the counter is part of what
   the comparison sees. */
interface Request {
    readonly query: ContactQuery | null;
    readonly nonce: number;
}

const keyOf = ({ query, nonce }: Request): string =>
    query === null
        ? `none#${nonce}`
        : `${query.q}\u0000${query.filter}\u0000${query.sort}\u0000${query.page}\u0000${nonce}`;

@Injectable({ providedIn: 'root' })
export class ContactsService {
    private readonly api = inject(ContactsApi);

    /* `null` until a page says what it wants, which is not how this started.

       The first version defaulted to DEFAULT_QUERY and requested page 1
       immediately. Day 55's router spec caught what that cost: navigating
       straight to /contacts/c1 made TWO requests, one for the contact and one
       for a list of contacts nobody was looking at - because this service is
       `providedIn: 'root'`, the detail page injects it for its mutations, and
       injecting it started the pipeline.

       On screen that is invisible. In the request log it is one wasted request
       on every cold load of a detail or form URL, and `http.verify()` is what
       turned it into a failing test. */
    private readonly querySignal = signal<ContactQuery | null>(null);
    private readonly nonceSignal = signal(0);
    private readonly inFlightSignal = signal(0);

    /* Templates want a query whatever the state, so the null is absorbed
       here rather than in every binding. */
    readonly query = computed<ContactQuery>(() => this.querySignal() ?? DEFAULT_QUERY);
    /* A count rather than a boolean, because two mutations can overlap and a
       boolean would be cleared by whichever finished first. */
    readonly busy = computed(() => this.inFlightSignal() > 0);

    private readonly request = computed<Request>(() => ({
        query: this.querySignal(),
        nonce: this.nonceSignal()
    }));

    /* The pipeline.

       No `subscribe` anywhere, and no constructor. Day 52's service called
       `this.refresh()` in its constructor and subscribed by hand; `toSignal`
       subscribes on creation and unsubscribes when the injector is destroyed,
       which for a root service is the life of the app. The first request still
       happens when the service is first injected - for the same reason, by a
       different mechanism. */
    private readonly outcome = toSignal(
        toObservable(this.request).pipe(
            distinctUntilChanged((a, b) => keyOf(a) === keyOf(b)),

            /* Nothing is asked for until something asks. `filter` with a type
               predicate, so the `switchMap` below is handed a ContactQuery
               rather than a nullable one - a guard doing the narrowing an
               `if` would otherwise do imperatively inside the operator. */
            filter((request): request is Request & { query: ContactQuery } => request.query !== null),

            switchMap(({ query }) =>
                this.api.list(query).pipe(
                    map((page): Outcome => ({ status: 'ready', page, error: null, query })),

                    /* INSIDE the switchMap, which is Day 53's rule and the
                       one that matters most in this file. Outside, the first
                       failed request would end the stream and the screen
                       would never load again - silently, because there is no
                       error state for "the pipeline is dead". */
                    catchError((error: unknown): Observable<Outcome> =>
                        of({ status: 'failed', page: null, error: asApiError(error), query })
                    ),

                    /* A synchronous 'loading' per request, which is what makes
                       the spinner appear without a `tap` writing to a signal
                       from inside the stream. `switchMap` cancels the previous
                       inner observable, so the loading emission belongs to the
                       newest query and nothing else. */
                    startWith<Outcome>({ status: 'loading', page: null, error: null, query })
                )
            ),

            /* `scan` to carry the last page forward.

               A stream that has to remember one thing needs an accumulator; a
               signal updated from a `tap` would also work and would put a
               write inside a pipeline, which is the thing I have been avoiding
               since Day 53.

               What it buys on screen: changing to page 2 keeps page 1 visible
               until page 2 arrives, instead of blanking the list for 120ms.
               The status still says 'loading', so the page can dim it or show
               a bar - but it has something to dim. */
            scan((previous, next) => ({ ...next, page: next.page ?? previous.page }), INITIAL)
        ),
        { initialValue: INITIAL }
    );

    readonly status = computed(() => this.outcome().status);
    readonly error = computed(() => this.outcome().error);

    /* The rows on THIS page. Not "the contacts" - that word now means
       something the client does not have, and `total` below is how many there
       are. */
    readonly contacts = computed<readonly Contact[]>(() => this.outcome().page?.contacts ?? []);
    readonly skipped = computed(() => this.outcome().page?.skipped ?? 0);

    /* The four numbers about rows that are not on screen. */
    readonly matched = computed(() => this.outcome().page?.matched ?? 0);
    readonly total = computed(() => this.outcome().page?.total ?? 0);
    readonly pageNumber = computed(() => this.outcome().page?.page ?? 1);
    readonly pages = computed(() => this.outcome().page?.pages ?? 1);

    /* Transmitted, not derived - see the file header. */
    readonly counts = computed<Record<Group, number>>(() => this.outcome().page?.counts ?? EMPTY_COUNTS);
    readonly favourites = computed(() => this.outcome().page?.favourites ?? 0);

    /* The page the server served when it was asked for a different one -
       and `null` whenever it served what it was asked for.

       A clamp is a disagreement WITHIN ONE ANSWER: this request asked for
       page 99 and this response says page 2. That is the whole definition,
       and getting to it took two wrong versions that the router spec caught
       in turn.

       The first compared `pageNumber()` - the newest answer's page, whatever
       question it answered - against the URL. Clicking a filter while page 2
       was on screen compared 2 against 1, concluded the server had clamped,
       and navigated back to `?page=2`: a filter that appeared to work and
       then undid half of itself.

       The second compared the answer's query against the current one to rule
       that out, matching on `q` and `filter`. It let the same bug through one
       step later: clicking Next from page 1 of a search compared the page-1
       answer (which is for the same search) against the page-2 URL, called it
       a clamp, and navigated back to page 1. The request log was

           /api/contacts?sort=added&page=2&q=ada
           /api/contacts?sort=added&page=1&q=ada

       - forward, then straight back, in one click.

       Comparing an answer with itself has neither problem and needs no
       knowledge of what is current. The general lesson, which I have now
       learned twice in one day: when a question and its answer have to be
       compared, carry the question along with the answer. Comparing the
       newest answer against the newest question is only correct when nothing
       is in flight, which is exactly the case this app is built to handle. */
    readonly clampedPage = computed<number | null>(() => {
        const { status, page, query } = this.outcome();

        if (status !== 'ready' || page === null || query === null) return null;

        return page.page === query.page ? null : page.page;
    });

    readonly filtering = computed(() => {
        const { q, filter } = this.query();
        return q.trim().length > 0 || filter !== 'all';
    });

    /* Day 60: what the rows on screen use, which is no longer the datalist.

       Kept, because the list page shows it - the tags of the page you are
       looking at are a fact about that page, and that is a different question
       from "every tag in the collection". Day 59 would have had to delete one
       of the two to keep the other; having both is what made it obvious they
       were never the same thing. */
    readonly visibleTags = computed(() =>
        [...new Set(this.contacts().flatMap((contact) => contact.tags))].toSorted()
    );

    /* ---- the query ---- */

    /* One setter for the whole query, because the URL changes as a whole.

       Day 51 had `setQuery`, `setFilter` and `setSort`, and the page called
       all three from one effect. Three signals meant three intermediate states
       - and with a request attached to each, three requests for one
       navigation. `switchMap` would have cancelled two of them, which is the
       right behaviour and a waste of the right behaviour. */
    setQuery(query: ContactQuery): void {
        this.querySignal.set(query);
    }

    refresh(): void {
        this.nonceSignal.update((n) => n + 1);
    }

    /* ---- one contact, by id ---- */

    /* Day 55, and the reason the detail page changed too.

       `byId(id)` is gone. It searched the loaded list, which was correct when
       the list was everything and is wrong now: a link to a contact on page 3
       would have rendered "No such contact" about a record the server holds.
       Hiding that behind a service method would make it look like state when
       it is a request. */
    one(id: string): Observable<Contact> {
        return this.api.get(id);
    }

    /* Day 60: every tag the server holds, most used first.

       A method and not a signal, like `one(id)`, and the distinction is the
       one this service has been making since Day 55: state that identifies
       the screen lives here, and a request belongs to whoever is looking at
       the answer. The form page wraps this in an `rxResource`, so it is
       fetched when that page exists and not before - which is also why the
       list page, which injects this service, makes no request for tags.

       The caching, the sharing and the invalidation are all in `ContactsApi`.
       This line exists so that a page does not have to inject the API client
       to ask a question, which has been the rule since Day 52. */
    tags(): Observable<readonly TagCount[]> {
        return this.api.tags();
    }

    /* ---- actions ---- */

    /* Every mutation ends in `refresh()`.

       Day 52 patched the local array - `contactsSignal.update(cs => [created,
       ...cs])` - which was right when the array was the whole truth. It is now
       one page of a server-side query, and the client cannot know what adding
       a contact does to it: the new row may sort onto page 1, push a row onto
       page 2, change `matched`, change `pages`, and change a group count. All
       of that is the server's answer to a question only the server can answer.

       The cost is a second request per write, and it is real. A production app
       would send the mutation and the fresh page in one response, or use
       `rxResource` to tie the two together - which is Day 58. The thing I am
       not willing to do is guess, because a guessed page that disagrees with
       the server is the bug that makes a list flicker between two states. */
    add(draft: ContactDraft): Observable<Contact> {
        return this.mutate(() => this.api.create(draft).pipe(tap(() => { this.refresh(); })));
    }

    update(id: string, draft: ContactDraft): Observable<Contact> {
        return this.mutate(() => this.api.update(id, draft).pipe(tap(() => { this.refresh(); })));
    }

    setFavourite(id: string, favourite: boolean): Observable<Contact> {
        return this.mutate(() =>
            this.api.setFavourite(id, favourite).pipe(tap(() => { this.refresh(); }))
        );
    }

    remove(id: string): Observable<void> {
        return this.mutate(() =>
            this.api.remove(id).pipe(
                /* A 404 on a DELETE is the outcome the user asked for.

                   The server saying "no such contact" means the contact is
                   gone, which is what the button was for. Day 51 would have
                   shown an error and left the row on screen - the probe did
                   exactly that, and the result reads as a failure for
                   something that succeeded.

                   This is the first decision I have made that depends on the
                   KIND of error rather than on there being one, which is what
                   `api-error.ts` was for. The other four kinds still fail. */
                catchError((error: unknown) =>
                    isApiError(error) && error.kind === 'notFound'
                        ? of(undefined)
                        : throwError(() => error)
                ),
                tap(() => { this.refresh(); })
            )
        );
    }

    /* `defer`, and this is the subtlest thing Day 52 taught me.

       The obvious version increments the counter and then returns the pipeline:

           this.inFlightSignal.update((n) => n + 1);
           return this.api.create(draft).pipe(finalize(...));

       An HttpClient observable is COLD: nothing happens until something
       subscribes. So that line counts a request that may never be made - and
       if the caller never subscribes, `finalize` never runs and the app is
       "busy" for the rest of its life. Nothing in the app does that today,
       which is exactly why it is worth the three extra lines: the bug would
       arrive with the first caller that builds a request and decides not to
       send it. Day 54's spec asserts it. */
    private mutate<T>(source: () => Observable<T>): Observable<T> {
        return defer(() => {
            this.inFlightSignal.update((n) => n + 1);
            return source();
        }).pipe(finalize(() => { this.inFlightSignal.update((n) => n - 1); }));
    }
}

export function asApiError(error: unknown): ApiError {
    return isApiError(error)
        ? error
        : new ApiError('server', 'Something went wrong talking to the contacts service.');
}

/* Kept as a module function rather than inlined, because the contacts page
   and the form page both need to turn URL text into a query and they must
   agree. Day 51 guarded the parameters in the page; the guards moved here when
   a second page needed them. */
export function queryFromParams(params: {
    q?: string | undefined;
    filter?: string | undefined;
    sort?: string | undefined;
    page?: string | undefined;
}): ContactQuery {
    const page = Number.parseInt(params.page ?? '1', 10);

    return {
        q: params.q ?? '',
        /* The same two guards Day 51 wrote, imported rather than repeated.
           They take `unknown`, which is what a URL parameter is. */
        filter: isFilter(params.filter) ? params.filter : 'all',
        sort: isSort(params.sort) ? params.sort : 'added',
        /* A URL is typed by people and written by other programs, so `?page=`,
           `?page=abc` and `?page=-3` all have to mean page 1. The server
           clamps the top end, because only it knows how many pages there are. */
        page: Number.isFinite(page) && page >= 1 ? page : 1
    };
}
