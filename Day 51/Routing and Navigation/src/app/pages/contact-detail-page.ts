/* Day 51 - one contact, addressed by its id.

   The route is `contacts/:id` and the id arrives as an INPUT, because
   `withComponentInputBinding()` is on. So this file has no `ActivatedRoute`,
   no `paramMap` subscription and no snapshot read:

       readonly id = input.required<string>();

   React's equivalent is `useParams()`, which returns `string | undefined`
   whatever the route says, so every page starts by handling a case the router
   has already guaranteed. `input.required` is the stronger claim and it is
   true: the route cannot match without the segment.

   What the route does NOT guarantee is that a contact with that id exists.
   /contacts/does-not-exist matches this route perfectly - the shape was right
   and the record is missing, which is a different failure from a URL that
   matched no route at all, and deserves a different page. Day 18's "empty and
   broken are different states", arriving in routing. */

import { Component, computed, inject, input } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { Panel } from '../panel';
import { ContactsService } from '../contacts.service';
import { NotificationsService } from '../notifications.service';
import { GROUP_LABELS } from '../domain';

@Component({
    selector: 'app-contact-detail-page',
    imports: [Panel, RouterLink],
    templateUrl: './contact-detail-page.html'
})
export class ContactDetailPage {
    readonly id = input.required<string>();

    protected readonly contacts = inject(ContactsService);
    private readonly notifications = inject(NotificationsService);
    private readonly router = inject(Router);

    protected readonly groupLabels = GROUP_LABELS;

    /* Derived from the id, never copied. A `contact` field set once from the
       service would be a second copy that stops agreeing with the list the
       moment anything edits it - Day 30's lesson, and the reason Day 50's
       component kept an id rather than a record too. */
    protected readonly contact = computed(() => this.contacts.byId(this.id()));

    protected onRemove(): void {
        const contact = this.contact();
        if (contact === undefined) return;

        this.contacts.remove(contact.id);
        this.notifications.show(`Removed ${contact.name}.`, 'danger');

        /* Navigating away from a page whose subject no longer exists.

           Day 50 did this with `if (this.editingId() === id) this.cancelEdit()`
           and I called it a habit then. Here the page IS the record, so
           leaving it is the only sensible answer - and without this the page
           would flip to its "no such contact" state, which reads as an error
           rather than as the thing the user just asked for. */
        void this.router.navigate(['/contacts']);
    }
}
