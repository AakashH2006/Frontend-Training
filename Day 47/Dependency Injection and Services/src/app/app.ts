/* Day 47 - the component, after the state moved out.

   Compare with Day 46:

       Day 46   4 signals, 6 computeds, 7 handlers, 150 lines
       Day 47   1 injected service, 0 signals, 0 computeds, 0 handlers

   Every method below is a one-line forward to the service, and most of the
   template calls the service directly. The component is a view now, which is
   what it was supposed to be all along.

   This is Week 7's conclusion reached by a different route: the reducer and
   context there, a service here, and in both cases the component stopped
   owning things that more than one component needs. */

import { Component, inject } from '@angular/core';

import { Panel } from './panel';
import { Stat } from './stat';
import { BookCard } from './book-card';
import { FilterBar } from './filter-bar';
import { EmptyState } from './empty-state';
import { Counter, CounterOwn, CounterService } from './injector-demo';
import { ReadingListService } from './reading-list.service';
import { StorageService } from './storage.service';
import { LIST_OPTIONS } from './tokens';
import { STATUSES, STATUS_LABELS, type Filter, type Sort, type Status } from './domain';

@Component({
    selector: 'app-root',
    imports: [Panel, Stat, BookCard, FilterBar, EmptyState, Counter, CounterOwn],
    /* The root-level CounterService for the two plain counters. Without it
       they would throw NullInjectorError, because CounterService has no
       `providedIn`. */
    providers: [CounterService],
    templateUrl: './app.html'
})
export class App {
    /* `protected`, so the template can call it. Injecting the service and
       using it directly from the template is the Angular idiom, and it took a
       moment to stop wanting a wrapper method for every call. */
    protected readonly list = inject(ReadingListService);
    protected readonly storage = inject(StorageService);

    /* Injecting a token's value. Nothing here knows whether it came from the
       token's own factory or from an override in app.config.ts. */
    protected readonly options = inject(LIST_OPTIONS);

    protected readonly statuses = STATUSES;
    protected readonly statusLabels = STATUS_LABELS;

    /* The four forwards that remain. They exist because FilterBar and BookCard
       emit typed payloads and the template reads better calling a named method
       than an inline `list.setFilter($event)`.

       That is a judgement call rather than a rule - `(click)="list.reset()"`
       in the template is fine and is what the Reset button does. */
    protected onStatusChange(id: string, status: Status): void {
        this.list.setStatus(id, status);
    }

    protected onFilterChange(filter: Filter): void {
        this.list.setFilter(filter);
    }

    protected onSortChange(sort: Sort): void {
        this.list.setSort(sort);
    }

    protected onQueryChange(query: string): void {
        this.list.setQuery(query);
    }
}
