/* Day 57 - the region itself, which is four lines and one CSS class.

   Rendered by the shell, outside the outlet, for the same structural reason the
   dialog is: it has to outlive every page, because its whole job is to be
   there BEFORE the message is. A live region inside a page would be recreated
   on every navigation, which is the bug this component exists to fix.

   `.sr-only` rather than `hidden` or `display: none`, and this is the detail
   that makes the difference between a working region and a decorative one. A
   region that is `display: none` is removed from the accessibility tree, so
   its changes are not announced at all - the exact failure it looks like it is
   avoiding. `.sr-only` clips the element to a 1px box that nothing can see and
   leaves it in the tree.

   `aria-live="polite"` as well as `role="status"`, which is redundant - the
   role implies the live value - and I am keeping both because support for the
   implicit mapping is not uniform and the explicit attribute costs nothing.
   The rest of the app had this pair too; what it did not have was the element
   being there in advance. */

import { Component, inject } from '@angular/core';

import { Announcer } from './announcer.service';

@Component({
    selector: 'app-announcer',
    template: `
        <p class="sr-only" role="status" aria-live="polite" id="announcer">{{ announcer.message() }}</p>
    `
})
export class AnnouncerRegion {
    protected readonly announcer = inject(Announcer);
}
