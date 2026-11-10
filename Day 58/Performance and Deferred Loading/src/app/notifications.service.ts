/* Day 48, extended on Day 57 - a service for something no component owns.

   DAY 57: every notice is now also announced. "Added Ada Lovelace." was
   rendered into a `role="status"` paragraph that did not exist until the
   notice did - see announcer.service.ts for why that announces nothing - and
   the fix is for the service that raises the notice to tell the announcer
   too.

   HERE rather than in the notice bar, which was the other candidate. The bar
   is a view of `latest()`, and a view that fires side effects when its input
   changes is an effect synchronising state, which is Day 34's rule. The
   service already knows a notice is NEW; the bar only knows what the newest
   one is.


   A notice is raised by whichever component did the thing, and shown by the
   header. Those two are five levels apart in the tree and neither is an
   ancestor of the other, so there is no common parent to lift it to - which is
   the clearest signal that it belongs in a service.

   That is the rule I settled on today:

       If the producer and the consumer have no useful common parent, it is a
       service. If they do, start with inputs and outputs.

   This one has no persistence, no derived state and three methods. A service
   does not have to be a store. */

import { Injectable, computed, inject, signal } from '@angular/core';

import { Announcer } from './announcer.service';

export interface Notice {
    readonly id: number;
    readonly message: string;
    readonly tone: 'info' | 'danger';
}

@Injectable({ providedIn: 'root' })
export class NotificationsService {
    private nextId = 1;

    private readonly announcer = inject(Announcer);

    private readonly noticesSignal = signal<readonly Notice[]>([]);

    readonly notices = this.noticesSignal.asReadonly();
    readonly latest = computed(() => this.notices().at(-1) ?? null);
    readonly count = computed(() => this.notices().length);

    show(message: string, tone: Notice['tone'] = 'info'): void {
        const notice: Notice = { id: this.nextId++, message, tone };

        /* Keeping the last five. An unbounded log in a service that nothing
           ever clears is a slow leak - and the UI only shows the latest. */
        this.noticesSignal.update((notices) => [...notices.slice(-4), notice]);

        this.announcer.announce(message);
    }

    dismiss(id: number): void {
        this.noticesSignal.update((notices) => notices.filter((notice) => notice.id !== id));
    }

    clear(): void {
        this.noticesSignal.set([]);
    }
}
