/* Day 48 - a service for something no component owns.

   A notice is raised by whichever component did the thing, and shown by the
   header. Those two are five levels apart in the tree and neither is an
   ancestor of the other, so there is no common parent to lift it to - which is
   the clearest signal that it belongs in a service.

   That is the rule I settled on today:

       If the producer and the consumer have no useful common parent, it is a
       service. If they do, start with inputs and outputs.

   This one has no persistence, no derived state and three methods. A service
   does not have to be a store. */

import { Injectable, computed, signal } from '@angular/core';

export interface Notice {
    readonly id: number;
    readonly message: string;
    readonly tone: 'info' | 'danger';
}

@Injectable({ providedIn: 'root' })
export class NotificationsService {
    private nextId = 1;

    private readonly noticesSignal = signal<readonly Notice[]>([]);

    readonly notices = this.noticesSignal.asReadonly();
    readonly latest = computed(() => this.notices().at(-1) ?? null);
    readonly count = computed(() => this.notices().length);

    show(message: string, tone: Notice['tone'] = 'info'): void {
        const notice: Notice = { id: this.nextId++, message, tone };

        /* Keeping the last five. An unbounded log in a service that nothing
           ever clears is a slow leak - and the UI only shows the latest. */
        this.noticesSignal.update((notices) => [...notices.slice(-4), notice]);
    }

    dismiss(id: number): void {
        this.noticesSignal.update((notices) => notices.filter((notice) => notice.id !== id));
    }

    clear(): void {
        this.noticesSignal.set([]);
    }
}
