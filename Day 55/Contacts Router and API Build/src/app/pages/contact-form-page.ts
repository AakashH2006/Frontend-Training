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

import { Component, computed, effect, inject, input, signal, viewChild } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { catchError, map, type Observable, of, startWith, switchMap } from 'rxjs';

import { ContactForm } from '../contact-form';
import { Panel } from '../panel';
import { asApiError, ContactsService } from '../contacts.service';
import { NotificationsService } from '../notifications.service';
import { type Contact, type ContactDraft } from '../domain';
import { type ApiError } from '../api-error';

/* Day 55: the same three-field outcome as the detail page and the service.

   Three files with the same little interface is a smell I thought about for a
   while and decided to leave. Extracting it would mean a shared generic
   `Outcome<T>` plus a helper that builds the pipeline, and the three pipelines
   differ in ways that would become parameters: one carries a previous page,
   one carries a previous record, this one has a branch for "no id at all".
   An abstraction over three things that are nearly the same is how you get one
   thing that fits none of them - Day 44's note about premature components,
   applying to streams. */
interface Outcome {
    readonly status: 'loading' | 'ready' | 'failed';
    readonly contact: Contact | null;
    readonly error: ApiError | null;
}

const BLANK: Outcome = { status: 'ready', contact: null, error: null };

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

    /* Day 55: this page fetches the record it is editing, for the same reason
       the detail page does - `byId` searched a list that is now one page of a
       server-side query, so /contacts/c9/edit would have said "nothing to
       edit" about a contact on page 3.

       The `id === undefined` branch is why this pipeline is not quite the
       other two: on /contacts/new there is nothing to fetch and the answer is
       immediate. `of(BLANK)` rather than a separate `@if` in the template,
       because then every state below is read the same way whichever route is
       active. */
    private readonly outcome = toSignal(
        toObservable(computed(() => this.id())).pipe(
            switchMap((id) =>
                id === undefined
                    ? of(BLANK)
                    : this.contacts.one(id).pipe(
                          map((contact): Outcome => ({ status: 'ready', contact, error: null })),
                          catchError((error: unknown): Observable<Outcome> =>
                              of({ status: 'failed', contact: null, error: asApiError(error) })
                          ),
                          startWith<Outcome>({ status: 'loading', contact: null, error: null })
                      )
            )
        ),
        { initialValue: BLANK }
    );

    protected readonly editing = computed(() => this.outcome().contact ?? undefined);

    protected readonly loading = computed(() => this.outcome().status === 'loading');

    /* An id in the URL that the server has nothing under.

       Day 52's version of this needed a `status() === 'ready'` guard, because
       "not in the loaded list" was true for the whole of the first request and
       the page said "nothing to edit" before showing the form. There is no
       guard here: a 404 is an answer, and an unanswered request is `loading`. */
    protected readonly missing = computed(() => this.outcome().error?.kind === 'notFound');

    protected readonly failed = computed(
        () => this.outcome().status === 'failed' && !this.missing()
    );

    protected readonly outcomeError = computed(() => this.outcome().error?.message ?? null);

    /* What the server said when it refused the last save.

       Not a notice: a notice is for things that happened elsewhere, and this
       belongs next to the form that caused it. And NOT cleared by typing -
       it is cleared by the next submit, because a message that disappears as
       soon as you touch the field is one you cannot read while fixing it. */
    protected readonly serverError = signal<string | null>(null);
    protected readonly saving = computed(() => this.contacts.busy());

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
        this.serverError.set(null);

        /* The shape of every mutation on this page: subscribe, and do the
           visible thing in `next`.

           Day 51 called `add` and navigated on the following line, because
           `add` returned the contact it had just created. It now returns an
           Observable of what the SERVER created, so the id is not known until
           the response arrives - and navigating to `/contacts/undefined` is
           what happens if you forget that. */
        if (id === undefined) {
            this.contacts.add(draft).subscribe({
                next: (contact) => {
                    this.notifications.show(`Added ${contact.name}.`);
                    /* The server's id, not one this app made up. */
                    void this.router.navigate(['/contacts', contact.id]);
                },
                error: (error: unknown) => { this.serverError.set(asApiError(error).message); }
            });
            return;
        }

        this.contacts.update(id, draft).subscribe({
            next: (saved) => {
                this.notifications.show(`Saved ${saved.name}.`);
                void this.router.navigate(['/contacts', id]);
            },
            error: (error: unknown) => { this.serverError.set(asApiError(error).message); }
        });
    }

    protected onCancel(): void {
        const id = this.id();
        /* Back to where the user came from, as far as the route table knows
           it. Not `history.back()`: arriving at this URL directly is a normal
           thing to do, and going back would then leave the app. */
        void this.router.navigate(id === undefined ? ['/contacts'] : ['/contacts', id]);
    }
}
