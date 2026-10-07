/* Day 45 - the controls, as a component with inputs and outputs.

   Day 44 had all of this inline in app.html. Pulling it out is the same
   decision as Day 29's React FilterBar: it owns no state, takes the three
   current values as inputs, and reports changes as outputs.

   The one thing that is new is `model()`. */

import { Component, input, model, output } from '@angular/core';

import { FILTERS, SORTS, STATUS_LABELS, type Filter, type Sort } from './domain';

const FILTER_LABELS: Record<Filter, string> = {
    all: 'All',
    unread: STATUS_LABELS.unread,
    reading: STATUS_LABELS.reading,
    finished: STATUS_LABELS.finished
};

const SORT_LABELS: Record<Sort, string> = {
    added: 'Recently added',
    title: 'Title',
    author: 'Author',
    year: 'Year published'
};

@Component({
    selector: 'app-filter-bar',
    imports: [],
    templateUrl: './filter-bar.html'
})
export class FilterBar {
    /* `model()` is an input and an output in one, and it is what makes
       `[(query)]` work on the parent.

       It is a WRITABLE signal inside this component: `query.set(...)` here
       updates the parent's signal, because `model()` emits `queryChange`
       behind the scenes. That is the `[(x)] == [x] + (xChange)` identity from
       Day 43, with Angular generating the output.

       Used here and not for `filter` or `sort`, deliberately - see below. */
    readonly query = model<string>('');

    /* These two are a plain input plus a named output rather than a model,
       because the parent does more than store them: clearing the list also
       resets the filter, and the parent needs to be the one deciding that.

       A `model()` would let this component write the parent's state directly,
       which reads as convenient and makes the parent's state harder to reason
       about - the Day 29 lesson about who owns what, in Angular's shape. */
    readonly filter = input.required<Filter>();
    readonly filterChange = output<Filter>();

    readonly sort = input.required<Sort>();
    readonly sortChange = output<Sort>();

    readonly shown = input.required<number>();
    readonly total = input.required<number>();

    protected readonly filters = FILTERS;
    protected readonly filterLabels = FILTER_LABELS;
    protected readonly sorts = SORTS;
    protected readonly sortLabels = SORT_LABELS;

    protected onQuery(event: Event): void {
        const input = event.target as HTMLInputElement | null;
        /* Writing to the model signal. The parent sees it on the next change
           detection, with no handler written on either side. */
        this.query.set(input?.value ?? '');
    }

    protected onSort(event: Event): void {
        const value = (event.target as HTMLSelectElement | null)?.value ?? '';
        if ((SORTS as readonly string[]).includes(value)) this.sortChange.emit(value as Sort);
    }
}
