/* Day 51 - one page, two routes.

       contacts/new        add
       contacts/:id/edit   edit

   Both resolve to this component, and the only difference is whether `id` is
   bound - which is the clearest thing the router has done for me this week.
   Day 50 held that distinction in a signal called `editingId`, set by a click
   handler and cleared in four places. It is now a path segment, so:

     - it survives a reload, which the signal did not
     - it is linkable: an edit screen is a URL somebody can send
     - it cannot get out of step with the form, because leaving the route
       destroys the component

   That last one deletes Day 50's bug outright. The probe there caught the form
   staying in edit mode after a successful save, because the parent's signal
   and the form's own copy disagreed. There is no copy to disagree with now:
   navigating away ends the component's life, and arriving creates a new one.

   `id` is optional here, which is the one place this is less tidy than the
   detail page - `input<string>()` gives `string | undefined`, and undefined is
   how this component knows it is adding rather than editing. */

import { Component, computed, effect, inject, input, viewChild } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { ContactForm } from '../contact-form';
import { Panel } from '../panel';
import { ContactsService } from '../contacts.service';
import { NotificationsService } from '../notifications.service';
import { type ContactDraft } from '../domain';

@Component({
    selector: 'app-contact-form-page',
    imports: [Panel, ContactForm, RouterLink],
    templateUrl: './contact-form-page.html'
})
export class ContactFormPage {
    readonly id = input<string>();

    protected readonly contacts = inject(ContactsService);
    private readonly notifications = inject(NotificationsService);
    private readonly router = inject(Router);

    private readonly form = viewChild(ContactForm);

    protected readonly editing = computed(() => {
        const id = this.id();
        return id === undefined ? undefined : this.contacts.byId(id);
    });

    /* An id in the URL that matches nothing. The same situation as the detail
       page's, and it must not quietly become an add form - which is what
       happens if the only check is `editing() === undefined`. */
    protected readonly missing = computed(
        () => this.id() !== undefined && this.editing() === undefined
    );

    /* Filled once per subject. A plain field rather than a signal, because
       nothing renders it and nothing should react to it.

       An effect rather than a call in a handler, which reverses Day 50's
       decision and is worth being explicit about. There, filling the form was
       caused by a click, and the handler was the honest place for it. Here
       there is no click: the component is constructed by the router, and the
       two things it needs - the contact (from an input) and the form (from
       viewChild) - arrive in an order I do not control. An effect is the only
       thing that runs once both are present.

       Day 34's rule still holds. This is not synchronising state with state;
       it is a one-time view operation whose preconditions arrive separately. */
    private filledFor: string | null = null;

    constructor() {
        effect(() => {
            const form = this.form();
            const contact = this.editing();

            if (form === undefined || contact === undefined) return;
            /* Without this, every change to the contact refills the form -
               including the change caused by saving it, which would throw away
               anything typed since. */
            if (this.filledFor === contact.id) return;

            this.filledFor = contact.id;
            form.fillFrom(contact);
        });
    }

    protected onSave(draft: ContactDraft): void {
        const id = this.id();

        if (id === undefined) {
            const contact = this.contacts.add(draft);
            this.notifications.show(`Added ${contact.name}.`);
            /* Straight to the new record rather than back to the list.

               `router.navigate` with an array is the programmatic twin of
               `routerLink`, and the array is segments rather than a string, so
               the id is escaped for me - Day 36 had the same split between
               <Link> and useNavigate(). */
            void this.router.navigate(['/contacts', contact.id]);
            return;
        }

        this.contacts.update(id, draft);
        this.notifications.show(`Saved ${draft.name}.`);
        void this.router.navigate(['/contacts', id]);
    }

    protected onCancel(): void {
        const id = this.id();
        /* Back to where the user came from, as far as the route table knows
           it. Not `history.back()`: arriving at this URL directly is a normal
           thing to do, and going back would then leave the app. */
        void this.router.navigate(id === undefined ? ['/contacts'] : ['/contacts', id]);
    }
}
