/* Day 49 - the form, wired to the service. */

import { Component, inject, signal, viewChild } from '@angular/core';

import { Panel } from './panel';
import { Stat } from './stat';
import { BookCard } from './book-card';
import { FilterBar } from './filter-bar';
import { EmptyState } from './empty-state';
import { NoticeBar } from './notice-bar';
import { BookForm, type BookDraft } from './book-form';
import { ReadingListService } from './reading-list.service';
import { NotificationsService } from './notifications.service';
import { STATUSES, STATUS_LABELS, type Book, type Filter, type Sort, type Status } from './domain';

@Component({
    selector: 'app-root',
    imports: [Panel, Stat, BookCard, FilterBar, EmptyState, NoticeBar, BookForm],
    templateUrl: './app.html'
})
export class App {
    protected readonly list = inject(ReadingListService);
    protected readonly notifications = inject(NotificationsService);

    protected readonly statuses = STATUSES;
    protected readonly statusLabels = STATUS_LABELS;

    /* An id, not the book. Day 30's lesson: keeping the whole book would be a
       second copy that goes stale the moment it is edited. */
    protected readonly editingId = signal<string | null>(null);

    /* `viewChild` is the signal query - the current replacement for
       @ViewChild. It gives a signal holding the child component instance, so
       the parent can call `fillFrom()` on it.

       Reaching into a child like this is worth being uncomfortable about, and
       I kept it for one reason: filling a form is an EVENT, not a state, and
       the alternative is an effect watching `editingId` that fights whatever
       the user is typing. Day 34's rule.

       The React version solved the same problem with `key`, which remounts the
       component. Angular has no equivalent for a form that should keep its
       instance, so this is the call. */
    private readonly form = viewChild(BookForm);

    protected editing(): Book | undefined {
        const id = this.editingId();
        return id === null ? undefined : this.list.books().find((book) => book.id === id);
    }

    protected onSave(draft: BookDraft): void {
        const id = this.editingId();

        if (id === null) {
            const book: Book = {
                ...draft,
                id: crypto.randomUUID(),
                addedAt: new Date().toISOString()
            };
            this.list.add(book);
            this.notifications.show(`Added "${book.title}".`);
            return;
        }

        this.list.update(id, draft);
        this.notifications.show(`Saved "${draft.title}".`);
        this.editingId.set(null);
    }

    protected startEdit(book: Book): void {
        this.editingId.set(book.id);
        /* Called here, in the handler that caused it. */
        this.form()?.fillFrom(book);
    }

    protected cancelEdit(): void {
        this.editingId.set(null);
        this.form()?.clear();
    }

    protected onStatusChange(id: string, status: Status): void {
        this.list.setStatus(id, status);
    }

    protected onRemove(id: string): void {
        const book = this.list.books().find((entry) => entry.id === id);
        this.list.remove(id);
        if (this.editingId() === id) this.cancelEdit();
        this.notifications.show(`Removed "${book?.title ?? id}".`, 'danger');
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
