/* Day 42 - a status pill.

   Four lines of template, and it exists so the Status-to-class mapping is
   written once. Day 27's reasoning, unchanged. */

import { Component, computed, input } from '@angular/core';

import { STATUS_LABELS, type Status } from './domain';

const BADGE_CLASS: Record<Status, string> = {
    unread: 'badge',
    reading: 'badge badge--reading',
    finished: 'badge badge--finished'
};

@Component({
    selector: 'app-badge',
    imports: [],
    template: `<span [class]="className()">{{ label() }}</span>`
})
export class Badge {
    readonly status = input.required<Status>();

    /* An inline `template` rather than a templateUrl, because this one is a
       single element. The CLI always generates a separate file and the rule I
       settled on is: inline when it fits on one line and nothing in it needs
       formatting.

       `computed()` rather than a getter. Both work; a computed only
       recalculates when `status` changes, and a getter runs on every
       change-detection pass. For a Record lookup the difference is nothing -
       it is here because Day 46 is about signals and this is the shape. */
    protected readonly className = computed(() => BADGE_CLASS[this.status()]);
    protected readonly label = computed(() => STATUS_LABELS[this.status()]);
}
