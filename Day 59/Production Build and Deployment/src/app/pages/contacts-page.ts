/* Day 51, rebuilt on Day 55 - the list, and now the URL really is the query.

   Day 51 put `q`, `filter` and `sort` in the URL and copied them into the
   service, which filtered a list it had already downloaded. Day 55 sends them
   to the server, adds `page`, and the service turns each change into a
   request. The file that changed least is this one, and that is the finding:
   the URL-as-state work from Day 51 was right, and what was behind it was
   replaceable.

   Three things in here are new.

   ONE QUERY, NOT THREE SIGNALS. The effect below sets a whole `ContactQuery`
   in one call. Day 51 called `setQuery`, `setFilter` and `setSort`, which was
   free when they fed computeds and is not free when each one feeds a request:
   three intermediate states meant three requests per navigation, two of which
   `switchMap` would cancel. Cancelling two requests you should not have made
   is correct behaviour and a waste of it.

   TYPING IS DEBOUNCED HERE, NOT IN THE SERVICE. Day 53 debounced inside the
   directory's pipeline, because the keystrokes went straight to the stream.
   Here they go to the URL first, and a history entry per keystroke is its own
   bug - so the debounce belongs on the navigation. `replaceUrl: true` on top
   of it, so even the debounced writes replace rather than stack: typing
   "doudna" and pressing Back should return to the list, not to "doudn".

   THE SERVER CAN DISAGREE ABOUT THE PAGE. `?page=99` of a two-page result is
   answered with page 2 and a `page: 2` in the envelope, and the effect below
   writes that back to the URL. It is the only place in this app where state
   flows from the service to the URL, and it took care to make it not loop. */

import { Component, DestroyRef, effect, inject, input, untracked } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { Announcer } from '../announcer.service';
import { asApiError, ContactsService, queryFromParams } from '../contacts.service';
import { ContactCard } from '../contact-card';
import { DirectorySearch } from '../directory-search';
import { EmptyState } from '../empty-state';
import { Pagination } from '../pagination';
import { Panel } from '../panel';
import { Stat } from '../stat';
import { NotificationsService } from '../notifications.service';
import {
    FILTERS,
    FILTER_LABELS,
    GROUPS,
    GROUP_LABELS,
    SORTS,
    isFilter,
    isSort,
    type Contact
} from '../domain';

const SORT_LABELS: Record<(typeof SORTS)[number], string> = {
    added: 'Recently added',
    name: 'Name',
    group: 'Group'
};

/* Long enough that a word typed at speed is one request, short enough that it
   does not feel broken. Day 53 measured 250ms against the directory and it is
   the same number here for the same reason - except that what it delays is a
   navigation rather than a fetch, and the fetch follows from it. */
const TYPING_MS = 250;

@Component({
    selector: 'app-contacts-page',
    imports: [Panel, Stat, EmptyState, ContactCard, Pagination, RouterLink, DirectorySearch],
    templateUrl: './contacts-page.html'
})
export class ContactsPage {
    readonly q = input<string>();
    readonly filter = input<string>();
    readonly sort = input<string>();
    readonly page = input<string>();

    protected readonly contacts = inject(ContactsService);
    private readonly notifications = inject(NotificationsService);
    private readonly announcer = inject(Announcer);
    private readonly router = inject(Router);

    /* What was last said, so that an answer identical to the previous one is
       not announced again. The service pads a repeat so it WOULD be read out,
       which is right for a typeahead - "no matches" twice is two useful
       answers - and wrong here: two filter clicks that happen to produce the
       same count are not news. */
    private lastAnnounced: string | null = null;
    private readonly route = inject(ActivatedRoute);

    protected readonly groups = GROUPS;
    protected readonly groupLabels = GROUP_LABELS;
    protected readonly filters = FILTERS;
    protected readonly filterLabels = FILTER_LABELS;
    protected readonly sorts = SORTS;
    protected readonly sortLabels = SORT_LABELS;

    /* The search box is not bound to `contacts.query().q`.

       It was on Day 51, and that was fine when the signal updated
       synchronously. With a debounce in between, binding the input's value to
       the service would make the box fight the user: type a letter, the value
       is still the old one for 250ms, and the cursor jumps. So the box owns its
       own text and the URL is written from it - which is the "uncontrolled
       input with a debounce" pattern from Day 34, in Angular. */
    private typingTimer: ReturnType<typeof setTimeout> | null = null;

    constructor() {
        /* Day 57: the page announces its own results.

           The shell announces a page by name when the PATH changes, and on
           this page the path never changes: Day 55 put the query in the URL,
           so filtering, searching and paging are all navigations to
           /contacts?something. "Contacts" read out again after a filter click
           is true and useless. The count is what changed, and this is the only
           component that knows it.

           Null on the first load, which is deliberate and matches the shell:
           the screen reader is about to read the page anyway. */
        effect(() => {
            if (this.contacts.status() !== 'ready') return;

            const summary = `${this.contacts.matched()} ${
                this.contacts.matched() === 1 ? 'contact' : 'contacts'
            } matched, page ${this.contacts.pageNumber()} of ${this.contacts.pages()}`;

            const previous = untracked(() => this.lastAnnounced);
            this.lastAnnounced = summary;

            if (previous === null || previous === summary) return;

            this.announcer.announce(summary);
        });

        /* The timer's `takeUntilDestroyed`, by hand.

           A pending `setTimeout` survives the component, so navigating away
           mid-word would navigate BACK to the list 250ms later. Day 53's rule
           was "takeUntilDestroyed for a read, never for a write"; this is the
           same rule for a timer, and `DestroyRef.onDestroy` is what the
           operator uses underneath. */
        inject(DestroyRef).onDestroy(() => {
            if (this.typingTimer !== null) clearTimeout(this.typingTimer);
        });

        /* URL -> service, one direction. Day 51's effect, with one call
           instead of three. */
        effect(() => {
            const query = queryFromParams({
                q: this.q(),
                filter: this.filter(),
                sort: this.sort(),
                page: this.page()
            });

            /* `untracked`, so that reading the service inside this effect does
               not make the effect depend on the service and re-run when the
               request lands. Day 51's note: an effect that writes to something
               it also reads is a loop waiting for a reason. */
            untracked(() => { this.contacts.setQuery(query); });
        });

        /* service -> URL, exactly once and only for this.

           The server clamps `page` and reports what it served. If that differs
           from what the URL asked for, the URL is wrong and gets corrected -
           otherwise `?page=99` stays in the address bar, is bookmarkable, and
           reads as a page that exists.

           The guards are what keep it from looping:

             - `status() === 'ready'`, so a clamp is never inferred from the
               `pages: 1` default that an unanswered request reports
             - comparing against the URL's own value, so the navigation only
               happens when it would change something
             - `replaceUrl`, so a correction does not add a history entry and
               Back does not bounce between the two

           Writing the corrected value also makes the effect's own input
           change, which re-runs it - and the second run finds the values equal
           and does nothing. That is the termination argument, and it is the
           reason this is a comparison rather than an assignment. */
        effect(() => {
            /* `clampedPage()` is non-null only when one single answer
               disagrees with its own request - asked for page 99, served page
               2. Two earlier versions of this compared the newest answer
               against the newest URL and both navigated backwards on a click
               the user had just made; the service's comment has the request
               logs. The condition below is now "the server corrected me, and
               the URL has not caught up yet". */
            const served = this.contacts.clampedPage();
            if (served === null) return;

            const asked = queryFromParams({ page: this.page() }).page;

            if (served === asked) return;

            untracked(() => {
                this.go({ page: served === 1 ? null : String(served) }, { replaceUrl: true });
            });
        });
    }

    protected onQuery(event: Event): void {
        const value = (event.target as HTMLInputElement | null)?.value ?? '';

        if (this.typingTimer !== null) clearTimeout(this.typingTimer);

        this.typingTimer = setTimeout(() => {
            this.typingTimer = null;
            /* `page: null` as well, because the page the user was on has no
               meaning under a different search - and "no results" on page 3 of
               a one-page result is the bug that looks like a broken search.
               Every filter change below does the same. */
            this.go({ q: value.length === 0 ? null : value, page: null }, { replaceUrl: true });
        }, TYPING_MS);
    }

    protected onSort(event: Event): void {
        const value = (event.target as HTMLSelectElement | null)?.value ?? '';
        if (isSort(value)) this.go({ sort: value === 'added' ? null : value, page: null });
    }

    protected onFilter(value: string): void {
        if (isFilter(value)) this.go({ filter: value === 'all' ? null : value, page: null });
    }

    protected onClearFilters(): void {
        void this.router.navigate([], { relativeTo: this.route });
    }

    protected onEdit(contact: Contact): void {
        void this.router.navigate(['/contacts', contact.id, 'edit']);
    }

    /* The two handlers that talk to a server.

       `subscribe` with both callbacks, every time. A `subscribe(next)` with no
       error handler does not swallow the failure - it rethrows it as an
       unhandled error, which `provideBrowserGlobalErrorListeners` logs and the
       user never sees. Dropping one handler and driving the 409 proved it on
       Day 52:

           url            : /contacts/new
           server-error   : (nothing on screen)
           request log    : POST /api/contacts 409 131ms
           console output : console.error: ERROR ApiError: Another contact
                            already uses margaret@example.com.

       The request happened, the server refused it, and the only report was in
       a console nobody has open. */
    protected onRemove(contact: Contact): void {
        this.contacts.remove(contact.id).subscribe({
            next: () => { this.notifications.show(`Removed ${contact.name}.`, 'danger'); },
            error: (error: unknown) => { this.notifications.show(asApiError(error).message, 'danger'); }
        });
    }

    protected onToggleFavourite(contact: Contact): void {
        this.contacts.setFavourite(contact.id, !contact.favourite).subscribe({
            /* No notice on success. The card changes, which is the feedback -
               a notice for something the user can see happen is noise, and
               Day 38 made that point about live regions. */
            error: (error: unknown) => { this.notifications.show(asApiError(error).message, 'danger'); }
        });
    }

    private go(
        queryParams: Record<string, string | null>,
        options: { replaceUrl?: boolean } = {}
    ): void {
        void this.router.navigate([], {
            relativeTo: this.route,
            queryParams,
            queryParamsHandling: 'merge',
            ...options
        });
    }
}
