/* Day 42 - a section with a heading, and whatever is put inside it.

   This is the component that taught me what composition means in Angular, and
   the answer is `<ng-content>`.

   React passes children as a prop, because an element is a value. Angular
   cannot do that - a template is compiled, not a value - so instead the
   *caller's* markup stays where it was written and `<ng-content>` is a
   placeholder saying where to project it.

   The difference shows up in one place that matters: projected content is
   compiled in the CALLER's context, not this component's. So it can read the
   caller's fields and cannot read mine, which is the opposite of how a
   template normally works and took a moment to accept. */

import { Component, input } from '@angular/core';

@Component({
    selector: 'app-panel',
    imports: [],
    templateUrl: './panel.html',
    styleUrl: './panel.css'
})
export class Panel {
    readonly heading = input.required<string>();

    /* Optional, with a default. `input<string | undefined>()` would also work
       and would make every caller's intent less clear - a default says what
       happens when it is omitted. */
    readonly headingId = input<string>('');
}
