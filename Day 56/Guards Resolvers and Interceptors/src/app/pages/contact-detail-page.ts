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

import { Component, computed, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { catchError, interval, map, type Observable, of, scan, startWith, switchMap } from 'rxjs';

import { Panel } from '../panel';
import { asApiError, ContactsService } from '../contacts.service';
import { NotificationsService } from '../notifications.service';
import { GROUP_LABELS, type Contact } from '../domain';
import { type ApiError } from '../api-error';

/* Short, because the point is to see it happen. A real one would be longer,
   and on Day 58 it would be a token so the page could be told. */
const POLL_MS = 1500;

interface Outcome {
    readonly status: 'loading' | 'ready' | 'failed';
    readonly contact: Contact | null;
    readonly error: ApiError | null;
}

const INITIAL: Outcome = { status: 'loading', contact: null, error: null };

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
        interval(POLL_MS)
            .pipe(takeUntilDestroyed())
            .subscribe(() => { this.ticks.update((n) => n + 1); });
    }

    /* The id and the tick together, so a poll re-asks the same question and a
       navigation asks a new one through exactly the same path. */
    private readonly request = computed(() => ({ id: this.id(), tick: this.ticks() }));

    /* The same pipeline shape as the service's, at component scope.

       There is no `takeUntilDestroyed` on this one and it does not need one:
       `toSignal` subscribes when the component is created and unsubscribes
       when its injector is destroyed. The poll above needs it because it is a
       hand-written `subscribe`. One component, both answers to "who cleans
       this up", which is the clearest illustration of the rule I have. */
    private readonly outcome = toSignal(
        toObservable(this.request).pipe(
            switchMap(({ id }) =>
                this.contacts.one(id).pipe(
                    map((contact): Outcome => ({ status: 'ready', contact, error: null })),
                    catchError((error: unknown): Observable<Outcome> =>
                        of({ status: 'failed', contact: null, error: asApiError(error) })
                    ),
                    startWith<Outcome>({ status: 'loading', contact: null, error: null })
                )
            ),
            /* Carries the record across a re-check, so a poll every 1500ms
               does not replace the page with a spinner twice a second. That
               was the first thing I got wrong today: the pipeline worked and
               the screen flickered. */
            scan((previous, next) => ({ ...next, contact: next.contact ?? previous.contact }), INITIAL)
        ),
        { initialValue: INITIAL }
    );

    protected readonly contact = computed(() => this.outcome().contact);
    protected readonly error = computed(() => this.outcome().error);

    /* Only while there is nothing to show. A re-check of a record already on
       screen is not a loading state, it is a background request. */
    protected readonly loading = computed(
        () => this.outcome().status === 'loading' && this.contact() === null
    );

    /* 404, specifically - the server saying the id does not exist. Any other
       failure is "could not load", which is a different sentence and a
       different thing to do about it. */
    protected readonly missing = computed(() => this.error()?.kind === 'notFound');

    protected readonly failed = computed(
        () => this.outcome().status === 'failed' && !this.missing()
    );

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
               screens reading the same row through two endpoints, and what
               Day 58's `rxResource` is for. */
            next: () => { this.recheck(); },
            error: (error: unknown) => {
                this.notifications.show(asApiError(error).message, 'danger');
            }
        });
    }

    /* Bumping the tick, which is the same thing the poll does. A `refresh()`
       method that re-ran the request another way would be a second code path
       to the one request this page makes. */
    private recheck(): void {
        this.ticks.update((n) => n + 1);
    }
}
