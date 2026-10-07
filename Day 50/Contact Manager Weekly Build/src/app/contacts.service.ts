/* Day 50 - the service.

   Day 47's ReadingListService, generalised to a different domain. The shape is
   unchanged and that is the point of the week: private writable signals, public
   `.asReadonly()` views, derived state as computeds, and actions as the only
   way in.

   Persistence goes through an injected StorageService so this file has no
   `localStorage` in it. */

import { Injectable, computed, inject, signal } from '@angular/core';

import { StorageService } from './storage.service';
import {
    GROUPS,
    SEED_CONTACTS,
    type Contact,
    type ContactDraft,
    type Filter,
    type Group,
    type Sort
} from './domain';

const COMPARATORS: Record<Sort, (a: Contact, b: Contact) => number> = {
    added: (a, b) => b.addedAt.localeCompare(a.addedAt),
    /* localeCompare, not `<`. Day 20: plain comparison sorts by code point, so
       every capital lands before every lowercase. */
    name: (a, b) => a.name.localeCompare(b.name),
    group: (a, b) => a.group.localeCompare(b.group) || a.name.localeCompare(b.name)
};

@Injectable({ providedIn: 'root' })
export class ContactsService {
    private readonly storage = inject(StorageService);

    private readonly contactsSignal = signal<readonly Contact[]>(
        this.storage.load() ?? SEED_CONTACTS
    );
    private readonly querySignal = signal('');
    private readonly filterSignal = signal<Filter>('all');
    private readonly sortSignal = signal<Sort>('added');

    /* Readonly views. `service.contacts.set([])` does not compile. */
    readonly contacts = this.contactsSignal.asReadonly();
    readonly query = this.querySignal.asReadonly();
    readonly filter = this.filterSignal.asReadonly();
    readonly sort = this.sortSignal.asReadonly();

    readonly total = computed(() => this.contacts().length);

    /* Three named stages rather than one, so the graph caches each - changing
       the sort does not redo the filtering. Day 46. */
    private readonly byFilter = computed(() => {
        const filter = this.filter();

        if (filter === 'all') return this.contacts();
        if (filter === 'favourites') return this.contacts().filter((c) => c.favourite);
        return this.contacts().filter((c) => c.group === filter);
    });

    private readonly matching = computed(() => {
        const needle = this.query().trim().toLowerCase();
        if (needle.length === 0) return this.byFilter();

        return this.byFilter().filter(
            (contact) =>
                contact.name.toLowerCase().includes(needle) ||
                (contact.email ?? '').toLowerCase().includes(needle) ||
                (contact.phone ?? '').toLowerCase().includes(needle) ||
                contact.tags.some((tag) => tag.toLowerCase().includes(needle))
        );
    });

    readonly visible = computed(() => this.matching().toSorted(COMPARATORS[this.sort()]));

    readonly counts = computed(() =>
        GROUPS.reduce<Record<Group, number>>(
            (totals, group) => ({
                ...totals,
                [group]: this.contacts().filter((c) => c.group === group).length
            }),
            { family: 0, friends: 0, work: 0, other: 0 }
        )
    );

    readonly favourites = computed(() => this.contacts().filter((c) => c.favourite).length);

    readonly filtering = computed(
        () => this.query().trim().length > 0 || this.filter() !== 'all'
    );

    /* All the tags in use, for the datalist on the form. Derived, so it cannot
       go stale - and `Set` then sorted, because duplicates across contacts are
       the normal case. */
    readonly allTags = computed(() =>
        [...new Set(this.contacts().flatMap((contact) => contact.tags))].toSorted()
    );

    /* ---- actions ---- */

    setQuery(query: string): void {
        this.querySignal.set(query);
    }

    setFilter(filter: Filter): void {
        this.filterSignal.set(filter);
    }

    setSort(sort: Sort): void {
        this.sortSignal.set(sort);
    }

    add(draft: ContactDraft): Contact {
        const contact: Contact = {
            ...draft,
            /* Generated HERE, not in the form, and not in the component. The
               service owns identity because it owns the collection - the same
               reason Day 31 put it on the action rather than in the reducer. */
            id: crypto.randomUUID(),
            addedAt: new Date().toISOString()
        };

        this.commit((contacts) => [contact, ...contacts]);
        return contact;
    }

    update(id: string, draft: ContactDraft): void {
        this.commit((contacts) =>
            contacts.map((contact) =>
                /* The draft spread SECOND, so its fields win and `id` and
                   `addedAt` survive. Day 30's spread-order lesson. */
                contact.id === id ? { ...contact, ...draft } : contact
            )
        );
    }

    remove(id: string): void {
        this.commit((contacts) => contacts.filter((contact) => contact.id !== id));
    }

    toggleFavourite(id: string): void {
        this.commit((contacts) =>
            contacts.map((contact) =>
                contact.id === id ? { ...contact, favourite: !contact.favourite } : contact
            )
        );
    }

    byId(id: string): Contact | undefined {
        return this.contacts().find((contact) => contact.id === id);
    }

    clearFilters(): void {
        this.querySignal.set('');
        this.filterSignal.set('all');
    }

    reset(): void {
        this.commit(() => SEED_CONTACTS);
        this.clearFilters();
        this.sortSignal.set('added');
    }

    /* One place that writes, one place that persists. Persisting is caused by
       an action, so it lives in the action path rather than in an effect
       watching the result - Day 47. */
    private commit(change: (contacts: readonly Contact[]) => readonly Contact[]): void {
        this.contactsSignal.update(change);
        this.storage.save(this.contacts());
    }
}
