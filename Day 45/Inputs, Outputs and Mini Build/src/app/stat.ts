/* Day 42 - one figure with a label.

   The smallest component in the project. It exists because the summary markup
   appeared twice and the two copies had drifted - which is exactly why Day 27
   extracted the React version. */

import { Component, input } from '@angular/core';

@Component({
    selector: 'app-stat',
    imports: [],
    template: `
        <span class="summary__label">{{ label() }}</span>
        <span class="summary__value">{{ value() }}</span>
    `,
    /* The component's own element is the <li>, so it has to be given the
       class. `host` is the declarative way: a static class on the host
       element, set at compile time.

       The alternative - wrapping the two spans in an <li> inside the template
       - would put an <li> inside an <app-stat> inside a <ul>, which is invalid
       HTML. This is the first time Angular's "the component is an element"
       model has cost me something that React's did not have. */
    host: { class: 'summary__tile' }
})
export class Stat {
    readonly label = input.required<string>();

    /* `string | number`, so callers do not have to convert a count. Angular
       interpolates both. */
    readonly value = input.required<string | number>();
}
