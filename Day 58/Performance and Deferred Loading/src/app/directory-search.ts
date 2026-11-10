/* Day 53 - the typeahead, and one deliberate NON-use of takeUntilDestroyed.

   The search itself needs no cleanup in here at all, which surprised me: the
   whole pipeline lives in the service and ends in `toSignal`, and `toSignal`
   unsubscribes when the injection context that created it is destroyed. The
   service is root-scoped, so that is never - and the subscription is one, for
   the life of the app, however many times this component is created.

   The add button is the interesting half. See `onAdd`. */

import { Component, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';

import { Announcer } from './announcer.service';
import { asApiError, ContactsService } from './contacts.service';
import { Panel } from './panel';
import { DirectoryService } from './directory.service';
import { NotificationsService } from './notifications.service';
import { type DirectoryEntry } from './directory.api';

@Component({
    selector: 'app-directory-search',
    imports: [Panel],
    templateUrl: './directory-search.html'
})
export class DirectorySearch {
    protected readonly directory = inject(DirectoryService);
    private readonly announcer = inject(Announcer);
    private readonly contacts = inject(ContactsService);
    private readonly notifications = inject(NotificationsService);

    constructor() {
        /* Day 57: the one place in this app where a live region is the whole
           interaction rather than a courtesy.

           A typeahead changes the page without any navigation, any click or
           any form submission. A sighted user sees rows appear; a screen
           reader user gets nothing at all unless the result is announced -
           there is no event for it to describe. That is why this component
           announces and the contacts list's own loading states do not: the
           list is reached by navigating, and a navigation already says
           something.

           Nothing is said while the query is too short or the results do not
           yet answer it. "Searching..." read out on every keystroke is how a
           live region becomes the thing people switch off, and the count
           arrives 250ms later anyway.

           `settled` rather than `searching`, which is the correction the probe
           forced. `searching` is false during the debounce as well as when
           nothing is happening, so this effect ran with the PREVIOUS query's
           rows and the new query's text and announced things that were not
           true - "1 match for ad." where the 1 was ada's. The measurement is
           in the notes; the window is 250ms wide and reliably hit, because a
           keystroke is what opens it. */
        effect(() => {
            if (this.directory.tooShort() || !this.directory.settled()) return;

            /* The query the results answer, not the query in the box. They are
               equal here - that is what `settled` means - and saying so in the
               code is what stops this drifting back. */
            const query = this.directory.answeredQuery();
            if (query.length === 0) return;

            const problem = this.directory.error();
            if (problem !== null) {
                this.announcer.announce(problem);
                return;
            }

            const count = this.directory.results().length;

            /* The query is in the message, not just the count. "3 matches" is
               ambiguous once two searches are a second apart; "3 matches for
               hopper" cannot be mistaken for the previous answer. */
            this.announcer.announce(
                count === 0
                    ? `No matches for ${query}.`
                    : `${count} ${count === 1 ? 'match' : 'matches'} for ${query}.`
            );
        });
    }

    /* Consumer one of `size$`. The About page is consumer two, and the request
       log shows one GET between them - which is `shareReplay` doing its job
       and is the only way to see that it is. */
    protected readonly size = toSignal(this.directory.size$, { initialValue: null });

    /* Which row's button is spinning. An id rather than a boolean, because two
       adds can overlap and a boolean would unspin both. */
    protected readonly adding = signal<string | null>(null);

    protected onInput(event: Event): void {
        this.directory.setQuery((event.target as HTMLInputElement | null)?.value ?? '');
    }

    protected alreadyAContact(entry: DirectoryEntry): boolean {
        return this.contacts.contacts().some((contact) => contact.email === entry.email);
    }

    /* NO takeUntilDestroyed on this one, on purpose.

       It is the obvious place for it - a component subscribing to something -
       and it would be a bug. `takeUntilDestroyed` unsubscribes when the
       component is destroyed, and unsubscribing an HttpClient request CANCELS
       it. So adding somebody and immediately navigating away would silently
       abandon the POST: no contact, no error, nothing.

       I built that version and measured it, and the result is in the notes.

       The rule I came out with:

           takeUntilDestroyed for a READ, never for a WRITE.

       A read nobody is looking at any more is waste. A write is something the
       user asked for, and the component going away does not withdraw the
       request. Anything that must survive the component belongs to a service -
       which is where both the request and the notice live. */
    protected onAdd(entry: DirectoryEntry): void {
        this.adding.set(entry.id);

        this.contacts
            .add({
                name: entry.name,
                email: entry.email,
                group: 'work',
                tags: [entry.title.toLowerCase()],
                favourite: false
            })
            .subscribe({
                next: (contact) => {
                    this.adding.set(null);
                    this.notifications.show(`Added ${contact.name} from the directory.`);
                },
                error: (error: unknown) => {
                    this.adding.set(null);
                    this.notifications.show(asApiError(error).message, 'danger');
                }
            });
    }
}
