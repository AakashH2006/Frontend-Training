/* Day 51 - the list, as a route.

   This is the page where the day's real lesson lives, and it is Day 36's:
   **the URL is state**. The search box, the group filter and the sort order
   are query parameters, so a filtered list is a link somebody can send.

   The mechanism is new to me. `withComponentInputBinding()` in app.config.ts
   makes the router set a component's INPUTS from the route - path parameters,
   query parameters and route data, all by name. So this page reads the URL
   without injecting `ActivatedRoute` and without subscribing to anything:

       /contacts?q=ada&filter=work   ->   q() === 'ada', filter() === 'work'

   React's `useSearchParams` returns the params to the component that asks.
   This arrives as an input, which means the page can be rendered in a test by
   setting three inputs and never mentioning the router at all. That is a
   bigger difference than it first looked.

   Two things it does NOT do, both of which bit me:

     - the inputs are `string | undefined`, because a parameter that is not in
       the URL has no value. `input<string>('all')` would be a lie the first
       time somebody removes the parameter.
     - the values are whatever is in the address bar, which is to say
       user-supplied. `?filter=javascript:alert(1)` is a string this component
       is handed. So the URL is a BOUNDARY and gets the same treatment as
       storage did in Week 5: a guard, and a fallback when it fails. */

import { Component, effect, inject, input, untracked } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { ContactCard } from '../contact-card';
import { EmptyState } from '../empty-state';
import { Panel } from '../panel';
import { Stat } from '../stat';
import { ContactsService } from '../contacts.service';
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
    /* Named for the query parameters they read. The name IS the binding, which
       is concise and is also the whole of the contract - a renamed input
       silently stops reading the URL, and nothing type-checks that. */
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
        /* URL -> service, in one direction only.

           The service still owns `query`, `filter` and `sort`, because the
           derivation chain that uses them - three cached computeds - is worth
           keeping. But the URL is now the only thing that WRITES them: the
           toolbar navigates, the router sets these inputs, and this effect
           copies them in. Nothing else calls setQuery.

           An effect is the right tool here for Day 33's reason: the thing on
           the other side of it is outside the signal graph. The URL is as
           outside as `document.title` was.

           `untracked` around the writes so this effect depends on the three
           inputs and on nothing the setters touch. Angular permits writing
           signals from an effect - Day 46 - so this guardrail is mine. */
        effect(() => {
            const query = this.q() ?? '';
            const filter = this.filter();
            const sort = this.sort();

            untracked(() => {
                this.contacts.setQuery(query);
                /* The guards from domain.ts, the same ones storage.service.ts
                   uses on data it reads back off disk. An unrecognised value
                   falls back rather than throwing, because a mistyped URL
                   should show a list, not a stack trace. */
                this.contacts.setFilter(isFilter(filter) ? filter : 'all');
                this.contacts.setSort(isSort(sort) ? sort : 'added');
            });
        });
    }

    protected onQuery(event: Event): void {
        const value = (event.target as HTMLInputElement | null)?.value ?? '';

        /* `replaceUrl` on a keystroke. Without it, typing "ada" leaves three
           history entries and the back button walks the user through their own
           typing - which Day 36 found with React Router's `replace` and is the
           same mistake with the same fix. */
        this.go({ q: value.length === 0 ? null : value }, { replaceUrl: true });
    }

    protected onSort(event: Event): void {
        const value = (event.target as HTMLSelectElement | null)?.value ?? '';
        /* Pushed, not replaced: choosing a sort is a decision, and going back
           to the previous one is a reasonable thing to want. */
        if (isSort(value)) this.go({ sort: value === 'added' ? null : value });
    }

    protected onFilter(value: string): void {
        if (isFilter(value)) this.go({ filter: value === 'all' ? null : value });
    }

    protected onClearFilters(): void {
        /* No `queryParamsHandling`, so this REPLACES the whole query string
           rather than merging into it. Merging `{ q: null, filter: null }`
           would work too and says less about what is meant. */
        void this.router.navigate([], { relativeTo: this.route });
    }

    /* The card emits; the page decides the event means navigation.

       A `routerLink` inside `ContactCard` would be shorter and would make the
       card unusable anywhere that does not have this app's route table - Day
       48's test, now with a sharper example than I had then. */
    protected onEdit(contact: Contact): void {
        void this.router.navigate(['/contacts', contact.id, 'edit']);
    }

    protected onRemove(id: string): void {
        const contact = this.contacts.byId(id);
        this.contacts.remove(id);
        this.notifications.show(`Removed ${contact?.name ?? id}.`, 'danger');
    }

    /* The default of a parameter is its ABSENCE, which is why every handler
       above passes null for the default value. `?filter=all&sort=added` and
       `/contacts` are the same list, and only one of them should be the URL
       somebody copies. A null removes the key; an empty string keeps it with
       nothing after the `=`. */
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
