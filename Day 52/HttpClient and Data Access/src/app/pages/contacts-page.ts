/* Day 52 - the list, over a network.

   Day 51's version of this file is unchanged except for the handlers, which is
   the thing worth noticing: the URL-as-state work, the guards on the query
   parameters and the one-way effect all survived the data source changing
   completely. What changed is that two of the handlers can now FAIL, and a
   handler that can fail has to say so.

   Three states to render where Day 51 had one, which is Day 18's lesson
   arriving in a routed app:

       loading  the first request has not answered yet
       failed   it answered badly, and there is a retry
       ready    the list, which may still be empty */

import { Component, effect, inject, input, untracked } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { asApiError, ContactsService } from '../contacts.service';
import { ContactCard } from '../contact-card';
import { EmptyState } from '../empty-state';
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

@Component({
    selector: 'app-contacts-page',
    imports: [Panel, Stat, EmptyState, ContactCard, RouterLink],
    templateUrl: './contacts-page.html'
})
export class ContactsPage {
    readonly q = input<string>();
    readonly filter = input<string>();
    readonly sort = input<string>();

    protected readonly contacts = inject(ContactsService);
    private readonly notifications = inject(NotificationsService);
    private readonly router = inject(Router);
    private readonly route = inject(ActivatedRoute);

    protected readonly groups = GROUPS;
    protected readonly groupLabels = GROUP_LABELS;
    protected readonly filters = FILTERS;
    protected readonly filterLabels = FILTER_LABELS;
    protected readonly sorts = SORTS;
    protected readonly sortLabels = SORT_LABELS;

    constructor() {
        /* URL -> service, one direction, unchanged from Day 51. */
        effect(() => {
            const query = this.q() ?? '';
            const filter = this.filter();
            const sort = this.sort();

            untracked(() => {
                this.contacts.setQuery(query);
                this.contacts.setFilter(isFilter(filter) ? filter : 'all');
                this.contacts.setSort(isSort(sort) ? sort : 'added');
            });
        });
    }

    protected onQuery(event: Event): void {
        const value = (event.target as HTMLInputElement | null)?.value ?? '';
        this.go({ q: value.length === 0 ? null : value }, { replaceUrl: true });
    }

    protected onSort(event: Event): void {
        const value = (event.target as HTMLSelectElement | null)?.value ?? '';
        if (isSort(value)) this.go({ sort: value === 'added' ? null : value });
    }

    protected onFilter(value: string): void {
        if (isFilter(value)) this.go({ filter: value === 'all' ? null : value });
    }

    protected onClearFilters(): void {
        void this.router.navigate([], { relativeTo: this.route });
    }

    protected onEdit(contact: Contact): void {
        void this.router.navigate(['/contacts', contact.id, 'edit']);
    }

    /* The two handlers that now talk to a server.

       `subscribe` with both callbacks, every time. A `subscribe(next)` with no
       error handler does not swallow the failure - it rethrows it as an
       unhandled error, which `provideBrowserGlobalErrorListeners` logs and the
       user never sees. Dropping one handler and driving the 409 proved it:

           url            : /contacts/new
           server-error   : (nothing on screen)
           request log    : POST /api/contacts 409 131ms
           console output : console.error: ERROR ApiError: Another contact
                            already uses margaret@example.com.

       The request happened, the server refused it, and the only report was in
       a console nobody has open.

       Nothing is unsubscribed here, which is wrong in a way that does not
       show: these requests complete, so the subscription ends by itself, but
       if the user navigates away first the callback still runs against a
       destroyed component. Day 53 is `takeUntilDestroyed`. */
    protected onRemove(id: string): void {
        const contact = this.contacts.byId(id);

        this.contacts.remove(id).subscribe({
            next: () => { this.notifications.show(`Removed ${contact?.name ?? id}.`, 'danger'); },
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
