/* Day 50 - one contact.

   Inputs in, outputs out. It injects nothing, so it can be rendered twice
   against different data and tested without the service - Day 48's test for a
   presentational component. */

import { Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';

import { GROUP_LABELS, type Contact } from './domain';

@Component({
    selector: 'app-contact-card',
    imports: [RouterLink],
    templateUrl: './contact-card.html',
    styleUrl: './contact-card.css'
})
export class ContactCard {
    readonly contact = input.required<Contact>();

    /* Day 51: where the heading links to, as segments, passed in by whoever
       renders the card.

       This is the compromise I had to think hardest about today. The card now
       imports `RouterLink`, so it is coupled to the ROUTER - but not to this
       app's route table, which is the part that would make it unusable
       anywhere else. Rendering the title as a link and letting the caller say
       where it goes keeps a real <a> with a real href, which Day 36 argued for
       and a click handler cannot give.

       The alternative was a fourth output - (view)="..." - and a parent that
       navigates. That keeps the card free of @angular/router entirely and
       turns a link back into a div with a click handler, which is worse for
       anyone using a keyboard or a middle mouse button. Not every route is
       worth that trade; a title is.

       `null` renders plain text, so the card still works with no router at
       all - which is how Day 54's tests render it. */
    readonly detailLink = input<(string | number)[] | null>(null);

    readonly edit = output<Contact>();
    readonly remove = output<string>();
    readonly toggleFavourite = output<string>();

    protected readonly groupLabels = GROUP_LABELS;

    /* Derived on the class rather than in the template, because it is three
       branches. Day 42's rule: anything past a ternary belongs here. */
    protected readonly reachLine = computed(() => {
        const { email, phone } = this.contact();

        if (email !== undefined && phone !== undefined) return `${email} · ${phone}`;
        if (email !== undefined) return email;
        if (phone !== undefined) return phone;
        /* Unreachable through the form, which requires one of the two - but
           reachable through storage written by an older version, so it has a
           rendering rather than an empty line. */
        return 'No contact details';
    });
}
