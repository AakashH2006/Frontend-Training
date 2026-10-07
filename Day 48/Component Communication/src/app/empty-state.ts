/* Day 42 - the empty case.

   Three of them in the app by now, and they were three different paragraphs
   with three different classes. Day 18's point was that empty is a state of
   its own and deserves the same care as success; this is that, reusable. */

import { Component, input } from '@angular/core';

@Component({
    selector: 'app-empty-state',
    imports: [],
    template: `
        <div class="empty-state">
            <p>{{ message() }}</p>
            <!-- Projected, so the caller supplies the hint and this component
                 does not need a second input for every possible wording. If
                 nothing is projected, nothing renders - no guard needed. -->
            <ng-content />
        </div>
    `
})
export class EmptyState {
    readonly message = input.required<string>();
}
