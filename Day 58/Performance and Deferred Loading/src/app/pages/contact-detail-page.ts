/* Day 51, rebuilt on Day 55 - one contact, addressed by its id.

   The route is `contacts/:id` and the id arrives as an INPUT, because
   `withComponentInputBinding()` is on. So this file has no `ActivatedRoute`,
   no `paramMap` subscription and no snapshot read:

       readonly id = input.required<string>();

   React's equivalent is `useParams()`, which returns `string | undefined`
   whatever the route says, so every page starts by handling a case the router
   has already guaranteed. `input.required` is the stronger claim and it is
   true: the route cannot match without the segment.

   DAY 55's CHANGE, and it is the one I am most glad to have made.

   Day 51 found the contact with `contacts.byId(id)` - a lookup in the loaded
   list. That was fine while the list was everything, and became wrong the
   moment the list became one page of a server-side query: a link to a contact
   on page 3, or one the current filter excludes, would have rendered "No such
   contact" about a record the server holds perfectly well. A bookmarked URL
   working only if you happened to have the right page loaded is not a working
   URL.

   So this page asks for its own record: GET /api/contacts/:id. The route is
   the request, which is what putting state in the URL was for all along and is
   the first time in this project it has actually meant something.

   Two consequences worth noting.

   "NOT FOUND" IS NOW THE SERVER'S WORD. Day 52's version inferred it from an
   absence in a list it had loaded; this one renders it when the server answers
   404. That is a much stronger claim and it needs no `status() === 'ready'`
   guard to avoid lying during the first request - a thing I got wrong on Day
   51, fixed on Day 52, and have now made structurally impossible.

   THE POLL GOT SMALLER. It used to call `contacts.refresh()`, re-fetching the
   whole list to see whether one record had changed. Now it re-fetches the one
   record. */

import { Component, computed, effect, inject, input, linkedSignal, signal } from '@angular/core';
import { rxResource, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { interval } from 'rxjs';

import { Panel } from '../panel';
import { Announcer } from '../announcer.service';
import { asApiError, ContactsService } from '../contacts.service';
import { NotificationsService } from '../notifications.service';
import { GROUP_LABELS, type Contact } from '../domain';
import { DETAIL_POLL_MS } from '../tokens';

/* DAY 58 - the same page, as a resource.

   Day 55 built the request by hand, and the shape is worth keeping in view
   because it is what `rxResource` replaces:

       request  = computed(() => ({ id: this.id(), tick: this.ticks() }))
       outcome  = toSignal(toObservable(request).pipe(
                      switchMap(({ id }) => this.contacts.one(id).pipe(
                          map(ready), catchError(failed), startWith(loading))),
                      scan(carryTheRecordAcross)))

   Four operators and a hand-rolled state machine - an `Outcome` interface, an
   `INITIAL` constant and a `scan` whose only job was to stop a poll replacing
   the page with a spinner every 1500ms. All of it is `rxResource`'s subject
   matter, so all of it is gone.

   WHY `rxResource` AND NOT `httpResource`. Day 56's notes promised
   `httpResource` here and that was the wrong promise. `httpResource` takes a
   URL and gives back a resource, which means the page would build
   `/api/contacts/${id}` itself and lose everything `ContactsApi.one` does on
   the way past: the runtime parse that turns `unknown` into a `Contact`, the
   `ApiError` mapping that the whole app's error states are written against,
   and the one place where the base path is decided. `rxResource` takes an
   Observable, so the service keeps all of that and the component gets the
   state machine. The URL belongs to the API layer; the loading state belongs
   to the page.

   It also would not have fixed what Day 56 thought it would. The second
   request for this record comes from the title resolver, not from this file -
   two consumers, two requests - and no amount of resource API changes that.
   The fix for THAT is a cache in the API layer, which is the other half of
   today and is measured in the notes. */

@Component({
    selector: 'app-contact-detail-page',
    imports: [Panel, RouterLink],
    templateUrl: './contact-detail-page.html'
})
export class ContactDetailPage {
    readonly id = input.required<string>();

    private readonly contacts = inject(ContactsService);
    private readonly notifications = inject(NotificationsService);
    private readonly router = inject(Router);
    private readonly pollMs = inject(DETAIL_POLL_MS);
    private readonly announcer = inject(Announcer);

    /* The last thing said about a failure, so that a poll failing every 1500ms
       does not say the same sentence every 1500ms. */
    private lastAnnounced: string | null = null;

    protected readonly groupLabels = GROUP_LABELS;

    /* Day 53's poll, still here and now re-checking one record instead of the
       whole list. A contact can change in another tab, so a page showing one
       re-asks every few seconds.

       `takeUntilDestroyed()` with no argument has to be called in an injection
       context, which a field initialiser and a constructor both are. It
       replaces the `private destroy$ = new Subject()` / `ngOnDestroy` pattern
       that every older Angular codebase has in every component. `interval`
       never completes, so without it the timer keeps firing after the page is
       gone - which Day 53 demonstrated by leaving it out and watching the
       request log carry on. */
    private readonly ticks = signal(0);

    protected readonly polled = this.ticks.asReadonly();

    constructor() {
        interval(this.pollMs)
            .pipe(takeUntilDestroyed())
            .subscribe(() => {
                this.ticks.update((n) => n + 1);
                /* `reload()` rather than a tick the request depends on, and
                   this is the difference that deleted the `scan`.

                   A tick in the params means "a different question", so the
                   resource throws away what it has and starts again from
                   nothing - which is what made the page flicker on Day 53 and
                   needed the scan to paper over. `reload()` means "the same
                   question, asked again": the status goes to 'reloading' and
                   `value()` keeps the record it already has until the new one
                   arrives. The behaviour I wrote 4 lines of rxjs for is the
                   default. */
                this.record.reload();
            });

        /* Day 58, finishing Day 57's job on this page: a re-check that failed
           while a record is on screen is a thing a sighted user can see - the
           line above the record says so - and was silent for everybody else.
           The paragraph that carried it claimed `role="status"` from inside an
           `@if`, which announces nothing.

           Announced once per distinct message. "Showing the last known
           details" read out on every poll would be the live region turning
           into the reason somebody switches the page off. */
        effect(() => {
            if (!this.stale()) {
                this.lastAnnounced = null;
                return;
            }

            const message = `Showing the last known details. ${this.error()?.message ?? ''}`.trim();

            /* A plain field rather than a signal, deliberately: it is read
               and written inside this effect, and a signal would make the
               effect depend on its own output - which is Day 57's infinite
               loop, discovered the hard way and worth not repeating. */
            if (this.lastAnnounced === message) return;
            this.lastAnnounced = message;

            this.announcer.announce(message);
        });
    }

    /* The request, as a resource.

       `params` is the reactive part: it re-reads `id()` and a change means a
       new question, so navigating from one contact to another discards the
       first one's record rather than showing it under the new name. The
       subscription is managed by the resource - no `takeUntilDestroyed` here,
       exactly as `toSignal` needed none, and for the same reason: it is tied
       to the injector rather than to a hand-written `subscribe`. The poll
       above still needs one, which is the clearest illustration of the rule I
       have. */
    private readonly record = rxResource<Contact | null, string>({
        params: () => this.id(),
        stream: ({ params }) => this.contacts.one(params),
        defaultValue: null
    });

    /* `value()` THROWS in the error state unless there is a default, which is
       the first thing about this API I got wrong, and `hasValue()` is the
       guard that says whether there is anything to read. Worth stating
       because the obvious `value() ?? null` is a crash waiting for a 503. */
    protected readonly contact = linkedSignal<
        { id: string; loaded: Contact | null },
        Contact | null
    >({
        source: () => ({
            id: this.id(),
            loaded: this.record.hasValue() ? this.record.value() : null
        }),

        /* Day 53's "showing the last known details" behaviour, which the
           resource does NOT give for free: a failed re-check is an error
           state, and an error state has no value. So the previous one is kept
           here - and only for the same id, or navigating to a contact whose
           first request fails would show the record from the page before it,
           which is a worse bug than the one this is fixing.

           `linkedSignal` rather than an effect writing to a signal: this is
           derived state that remembers, which is the thing it is for, and
           Day 57 is a fresh reminder of what writing signals from effects
           costs. */
        computation: (source, previous) => {
            if (source.loaded !== null) return source.loaded;
            if (previous !== undefined && previous.source.id === source.id) return previous.value;
            return null;
        }
    });

    protected readonly error = computed(() => {
        const problem = this.record.error();
        return problem === undefined ? null : asApiError(problem);
    });

    /* Only while there is nothing to show. A re-check of a record already on
       screen is not a loading state, it is a background request - which the
       resource says in its own vocabulary: 'loading' is the first request for
       a question, 'reloading' is the same question again. */
    protected readonly loading = computed(
        () => this.record.status() === 'loading' && this.contact() === null
    );

    /* 404, specifically - the server saying the id does not exist. Any other
       failure is "could not load", which is a different sentence and a
       different thing to do about it. */
    protected readonly missing = computed(() => this.error()?.kind === 'notFound');

    protected readonly failed = computed(() => this.error() !== null && !this.missing());

    /* A record on screen AND a failed re-check: the page is showing something
       true-as-of-a-moment-ago and says so, rather than throwing away a good
       record because a poll failed. */
    protected readonly stale = computed(() => this.contact() !== null && this.failed());

    protected onRetry(): void {
        this.recheck();
    }

    protected onRemove(): void {
        const contact = this.contact();
        if (contact === null) return;

        /* Navigate on SUCCESS, not on the click.

           Day 51 removed and navigated in two consecutive statements, which
           was right when `remove` could not fail. It can now, and leaving the
           page before the server has agreed would show the list without a
           record the server still has. */
        this.contacts.remove(contact.id).subscribe({
            next: () => {
                this.notifications.show(`Removed ${contact.name}.`, 'danger');
                /* Leaving a page whose subject is gone. Day 51's reasoning
                   stands: the page IS the record, so there is nothing to show,
                   and staying would flip it to "no such contact" - which reads
                   as an error rather than as the thing just asked for. */
                void this.router.navigate(['/contacts']);
            },
            error: (error: unknown) => {
                this.notifications.show(asApiError(error).message, 'danger');
            }
        });
    }

    protected onToggleFavourite(): void {
        const contact = this.contact();
        if (contact === null) return;

        this.contacts.setFavourite(contact.id, !contact.favourite).subscribe({
            /* Re-asks for this record rather than patching it locally. The
               service already reloads the list; this page's copy is a separate
               request and has to be told too. One toggle, three requests -
               PATCH, the list, this record - which is the honest cost of two
               screens reading the same row through two endpoints.

               Day 58 note: this is also the request that proves the cache in
               `contacts.api.ts` is invalidated on a write. Without that, this
               reload would be answered out of the cache with the record as it
               was BEFORE the PATCH, and the button would appear not to work -
               which is precisely the bug Day 57 found in the fake server and
               would have been a second, identical-looking one on the client
               side. There is a spec for it. */
            next: () => { this.recheck(); },
            error: (error: unknown) => {
                this.notifications.show(asApiError(error).message, 'danger');
            }
        });
    }

    /* The same thing the poll does. A `refresh()` method that re-ran the
       request another way would be a second code path to the one request this
       page makes. */
    private recheck(): void {
        this.record.reload();
    }
}
