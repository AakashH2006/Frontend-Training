/* Day 52 - the service, with the data somewhere else.

   The shape from Day 47 survives: private writable signals, `.asReadonly()`
   views, derived state as computeds, actions as the only way in. What changed
   is that an action is no longer a function that updates a signal - it is a
   request, and three things follow from that:

     1. The state has a STATUS. Day 50's list was either there or empty;
        this one is loading, ready or failed, and every screen has to render
        all three. Day 18 said "empty and broken are different states"; async
        adds "not yet", which is a third.

     2. An action returns an OBSERVABLE rather than void. The caller has to
        know when it finished, because navigating or showing a notice before
        the server has agreed is a lie - and on a conflict there is nothing to
        navigate to.

     3. The server is the authority. `add` does not construct a contact; it
        asks for one and stores what comes back, including the id and the
        timestamp it did not choose. Day 50's service generated both and that
        was right when it owned the collection. It does not any more. */

import { Injectable, computed, inject, signal } from '@angular/core';
import { catchError, defer, finalize, type Observable, of, tap, throwError } from 'rxjs';

import { ApiError, isApiError } from './api-error';
import { ContactsApi } from './contacts.api';
import {
    GROUPS,
    type Contact,
    type ContactDraft,
    type Filter,
    type Group,
    type Sort
} from './domain';

const COMPARATORS: Record<Sort, (a: Contact, b: Contact) => number> = {
    added: (a, b) => b.addedAt.localeCompare(a.addedAt),
    name: (a, b) => a.name.localeCompare(b.name),
    group: (a, b) => a.group.localeCompare(b.group) || a.name.localeCompare(b.name)
};

export type LoadStatus = 'loading' | 'ready' | 'failed';

@Injectable({ providedIn: 'root' })
export class ContactsService {
    private readonly api = inject(ContactsApi);

    /* Starts EMPTY, not seeded. There is no synchronous source of truth any
       more, and pretending otherwise is how a list flashes the wrong contents
       before the real ones arrive. */
    private readonly contactsSignal = signal<readonly Contact[]>([]);
    private readonly statusSignal = signal<LoadStatus>('loading');
    private readonly errorSignal = signal<ApiError | null>(null);
    private readonly skippedSignal = signal(0);
    /* A count rather than a boolean, because two mutations can overlap and a
       boolean would be cleared by whichever finished first. */
    private readonly inFlightSignal = signal(0);

    private readonly querySignal = signal('');
    private readonly filterSignal = signal<Filter>('all');
    private readonly sortSignal = signal<Sort>('added');

    readonly contacts = this.contactsSignal.asReadonly();
    readonly status = this.statusSignal.asReadonly();
    readonly error = this.errorSignal.asReadonly();
    readonly skipped = this.skippedSignal.asReadonly();
    readonly busy = computed(() => this.inFlightSignal() > 0);

    readonly query = this.querySignal.asReadonly();
    readonly filter = this.filterSignal.asReadonly();
    readonly sort = this.sortSignal.asReadonly();

    readonly total = computed(() => this.contacts().length);

    private readonly byFilter = computed(() => {
        const filter = this.filter();

        if (filter === 'all') return this.contacts();
        if (filter === 'favourites') return this.contacts().filter((c) => c.favourite);
        return this.contacts().filter((c) => c.group === filter);
    });

    private readonly matching = computed(() => {
        const needle = this.query().trim().toLowerCase();
        if (needle.length === 0) return this.byFilter();

        return this.byFilter().filter(
            (contact) =>
                contact.name.toLowerCase().includes(needle) ||
                (contact.email ?? '').toLowerCase().includes(needle) ||
                (contact.phone ?? '').toLowerCase().includes(needle) ||
                contact.tags.some((tag) => tag.toLowerCase().includes(needle))
        );
    });

    readonly visible = computed(() => this.matching().toSorted(COMPARATORS[this.sort()]));

    readonly counts = computed(() =>
        GROUPS.reduce<Record<Group, number>>(
            (totals, group) => ({
                ...totals,
                [group]: this.contacts().filter((c) => c.group === group).length
            }),
            { family: 0, friends: 0, work: 0, other: 0 }
        )
    );

    readonly favourites = computed(() => this.contacts().filter((c) => c.favourite).length);

    readonly filtering = computed(() => this.query().trim().length > 0 || this.filter() !== 'all');

    readonly allTags = computed(() =>
        [...new Set(this.contacts().flatMap((contact) => contact.tags))].toSorted()
    );

    constructor() {
        /* The load starts when the service is first injected, which is the
           first component that needs it. Not in an effect, and not in a
           component's constructor: it is caused by the service existing.

           A service with `providedIn: 'root'` lives as long as the app, so
           this subscription never needs unsubscribing - which is true here
           and is NOT true in a component. Day 53's problem. */
        this.refresh();
    }

    /* ---- loading ---- */

    refresh(): void {
        this.statusSignal.set('loading');
        this.errorSignal.set(null);

        this.api.list().subscribe({
            next: ({ contacts, skipped }) => {
                this.contactsSignal.set(contacts);
                this.skippedSignal.set(skipped);
                this.statusSignal.set('ready');
            },
            error: (error: unknown) => {
                /* `unknown`, and narrowed. The error channel is untyped, so
                   this is the only honest signature - and `asApiError` below
                   is what keeps an unexpected throw from rendering as
                   "[object Object]". */
                this.statusSignal.set('failed');
                this.errorSignal.set(asApiError(error));
            }
        });
    }

    /* ---- actions ---- */

    add(draft: ContactDraft): Observable<Contact> {
        return this.mutate(() =>
            this.api
                .create(draft)
                .pipe(tap((created) => { this.contactsSignal.update((cs) => [created, ...cs]); }))
        );
    }

    update(id: string, draft: ContactDraft): Observable<Contact> {
        return this.mutate(() => this.api.update(id, draft).pipe(tap((saved) => { this.replace(saved); })));
    }

    setFavourite(id: string, favourite: boolean): Observable<Contact> {
        return this.mutate(() =>
            this.api.setFavourite(id, favourite).pipe(tap((saved) => { this.replace(saved); }))
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
                tap(() => {
                    this.contactsSignal.update((cs) => cs.filter((contact) => contact.id !== id));
                })
            )
        );
    }

    /* ---- view state, unchanged from Day 51 ---- */

    setQuery(query: string): void {
        this.querySignal.set(query);
    }

    setFilter(filter: Filter): void {
        this.filterSignal.set(filter);
    }

    setSort(sort: Sort): void {
        this.sortSignal.set(sort);
    }

    byId(id: string): Contact | undefined {
        return this.contacts().find((contact) => contact.id === id);
    }

    clearFilters(): void {
        this.querySignal.set('');
        this.filterSignal.set('all');
    }

    /* The local state the server sent back, put where the old one was. Not
       appended, not re-sorted - the comparators do that, and a `map` keeps
       every other row identical so `track` does not rebuild the list. */
    private replace(saved: Contact): void {
        this.contactsSignal.update((cs) =>
            cs.map((contact) => (contact.id === saved.id ? saved : contact))
        );
    }

    /* `defer`, and this is the subtlest thing I learned today.

       The obvious version increments the counter and then returns the pipeline:

           this.inFlightSignal.update((n) => n + 1);
           return this.api.create(draft).pipe(finalize(...));

       An HttpClient observable is COLD: nothing happens until something
       subscribes. So that line counts a request that may never be made - and
       if the caller never subscribes, `finalize` never runs and the app is
       "busy" for the rest of its life. Nothing in the app does that today,
       which is exactly why it is worth the three extra lines: the bug would
       arrive with the first caller that builds a request and decides not to
       send it.

       `defer` moves the side effect to subscription time, where the request
       is. One subscribe, one increment, one decrement. */
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
