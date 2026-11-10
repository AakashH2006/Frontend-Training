/* Day 51 - one contact, addressed by its id.

   The route is `contacts/:id` and the id arrives as an INPUT, because
   `withComponentInputBinding()` is on. So this file has no `ActivatedRoute`,
   no `paramMap` subscription and no snapshot read:

       readonly id = input.required<string>();

   React's equivalent is `useParams()`, which returns `string | undefined`
   whatever the route says, so every page starts by handling a case the router
   has already guaranteed. `input.required` is the stronger claim and it is
   true: the route cannot match without the segment.

   What the route does NOT guarantee is that a contact with that id exists.
   /contacts/does-not-exist matches this route perfectly - the shape was right
   and the record is missing, which is a different failure from a URL that
   matched no route at all, and deserves a different page. Day 18's "empty and
   broken are different states", arriving in routing. */

import { Component, computed, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { interval } from 'rxjs';

import { Panel } from '../panel';
import { asApiError, ContactsService } from '../contacts.service';
import { NotificationsService } from '../notifications.service';
import { GROUP_LABELS } from '../domain';

/* Short, because the point is to see it happen. A real one would be longer,
   and on Day 58 it would be a token so the page could be told. */
const POLL_MS = 1500;

@Component({
    selector: 'app-contact-detail-page',
    imports: [Panel, RouterLink],
    templateUrl: './contact-detail-page.html'
})
export class ContactDetailPage {
    readonly id = input.required<string>();

    protected readonly contacts = inject(ContactsService);
    private readonly notifications = inject(NotificationsService);
    private readonly router = inject(Router);

    protected readonly groupLabels = GROUP_LABELS;

    /* Day 53: a poll, and the one subscription in this app that genuinely
       needs `takeUntilDestroyed`.

       A contact can change in another tab, so a page showing one re-checks
       every few seconds. That is a real enough feature; it is also here
       because I wanted a subscription that OUTLIVES nothing by itself -
       `interval` never completes, so without cleanup it keeps firing after
       the page is gone, and the request log makes that visible rather than
       theoretical.

       `takeUntilDestroyed()` with no argument has to be called in an injection
       context, which a field initialiser is. Elsewhere it takes a
       `DestroyRef`. That is the whole API, and it replaces the
       `private destroy$ = new Subject()` / `ngOnDestroy` pattern that every
       older Angular codebase has in every component. */
    private readonly polls = signal(0);

    protected readonly polled = this.polls.asReadonly();

    constructor() {
        interval(POLL_MS)
            .pipe(takeUntilDestroyed())
            .subscribe(() => {
                this.polls.update((n) => n + 1);
                this.contacts.refresh();
            });
    }

    /* Derived from the id, never copied. A `contact` field set once from the
       service would be a second copy that stops agreeing with the list the
       moment anything edits it - Day 30's lesson, and the reason Day 50's
       component kept an id rather than a record too. */
    protected readonly contact = computed(() => this.contacts.byId(this.id()));

    /* Day 52: the three states again, and this page is where the need for them
       was least obvious and most important.

       Day 51's template was `@if (contact()) { ... } @else { no such contact }`,
       which was correct when the list was already in memory. Over HTTP a cold
       load of /contacts/c1 has an empty list for as long as the request takes,
       so the @else branch renders - and the page says the contact does not
       exist, for 120ms, before showing it. A confident wrong answer, which is
       the worst kind.

       The fix is to make "not found" a claim this page is only allowed to make
       once the data has arrived. */
    protected readonly loading = computed(() => this.contacts.status() === 'loading');
    protected readonly failed = computed(() => this.contacts.status() === 'failed');
    protected readonly missing = computed(
        () => this.contacts.status() === 'ready' && this.contact() === undefined
    );

    protected onRemove(): void {
        const contact = this.contact();
        if (contact === undefined) return;

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
        if (contact === undefined) return;

        this.contacts.setFavourite(contact.id, !contact.favourite).subscribe({
            error: (error: unknown) => {
                this.notifications.show(asApiError(error).message, 'danger');
            }
        });
    }

    protected onRetry(): void {
        this.contacts.refresh();
    }
}
