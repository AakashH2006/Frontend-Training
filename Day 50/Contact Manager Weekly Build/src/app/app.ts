/* Day 50 - the Week 10 build.

   The component is a view and a coordinator. It holds one piece of state - which
   contact is being edited - and everything else lives in a service. */

import { Component, computed, inject, signal, viewChild } from '@angular/core';

import { Panel } from './panel';
import { Stat } from './stat';
import { EmptyState } from './empty-state';
import { NoticeBar } from './notice-bar';
import { ContactCard } from './contact-card';
import { ContactForm } from './contact-form';
import { ContactsService } from './contacts.service';
import { NotificationsService } from './notifications.service';
import { StorageService } from './storage.service';
import {
    FILTERS,
    FILTER_LABELS,
    GROUPS,
    GROUP_LABELS,
    SORTS,
    isFilter,
    isSort,
    type Contact,
    type ContactDraft
} from './domain';

const SORT_LABELS: Record<(typeof SORTS)[number], string> = {
    added: 'Recently added',
    name: 'Name',
    group: 'Group'
};

@Component({
    selector: 'app-root',
    imports: [Panel, Stat, EmptyState, NoticeBar, ContactCard, ContactForm],
    templateUrl: './app.html'
})
export class App {
    protected readonly contacts = inject(ContactsService);
    protected readonly notifications = inject(NotificationsService);
    protected readonly storage = inject(StorageService);

    protected readonly groups = GROUPS;
    protected readonly groupLabels = GROUP_LABELS;
    protected readonly filters = FILTERS;
    protected readonly filterLabels = FILTER_LABELS;
    protected readonly sorts = SORTS;
    protected readonly sortLabels = SORT_LABELS;

    /* The ONLY state in this component, and it is an id rather than a contact.
       Keeping the record would be a second copy that goes stale the moment it
       is edited - Day 30, and it has been true in all three frameworks. */
    protected readonly editingId = signal<string | null>(null);

    /* Derived from the id, so it cannot disagree with the list. */
    protected readonly editing = computed(() => {
        const id = this.editingId();
        return id === null ? undefined : this.contacts.byId(id);
    });

    private readonly form = viewChild(ContactForm);

    protected onSave(draft: ContactDraft): void {
        const id = this.editingId();

        if (id === null) {
            const contact = this.contacts.add(draft);
            this.notifications.show(`Added ${contact.name}.`);
            return;
        }

        this.contacts.update(id, draft);
        this.notifications.show(`Saved ${draft.name}.`);
        this.editingId.set(null);
    }

    protected startEdit(contact: Contact): void {
        this.editingId.set(contact.id);
        /* Called in the handler that caused it, not from an effect watching
           `editingId`. Day 34, and Day 49 found what the effect version costs. */
        this.form()?.fillFrom(contact);
    }

    protected cancelEdit(): void {
        this.editingId.set(null);
        this.form()?.clear();
    }

    protected onRemove(id: string): void {
        const contact = this.contacts.byId(id);
        this.contacts.remove(id);

        /* Closing the editor when its subject is deleted. Without this,
           `editing()` becomes undefined and the panel's heading changes with
           no explanation - Day 30's bug, which I now check for by habit. */
        if (this.editingId() === id) this.cancelEdit();

        this.notifications.show(`Removed ${contact?.name ?? id}.`, 'danger');
    }

    protected onToggleFavourite(id: string): void {
        this.contacts.toggleFavourite(id);
    }

    protected onQuery(event: Event): void {
        const input = event.target as HTMLInputElement | null;
        this.contacts.setQuery(input?.value ?? '');
    }

    protected onSort(event: Event): void {
        const value = (event.target as HTMLSelectElement | null)?.value ?? '';
        if (isSort(value)) this.contacts.setSort(value);
    }

    protected onFilter(value: string): void {
        if (isFilter(value)) this.contacts.setFilter(value);
    }
}
