/* Day 50 - one contact.

   Inputs in, outputs out. It injects nothing, so it can be rendered twice
   against different data and tested without the service - Day 48's test for a
   presentational component. */

import { Component, computed, input, output } from '@angular/core';

import { GROUP_LABELS, type Contact } from './domain';

@Component({
    selector: 'app-contact-card',
    imports: [],
    templateUrl: './contact-card.html',
    styleUrl: './contact-card.css'
})
export class ContactCard {
    readonly contact = input.required<Contact>();

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
