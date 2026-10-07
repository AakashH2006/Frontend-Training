/* Day 48 - the four levels in between, which exist only to be in the way.

   Each one renders the next and knows nothing. In the inputs-and-outputs
   version each of these would carry two inputs and two outputs it never reads,
   which is the definition of prop drilling and the reason context and DI
   exist.

   Written out rather than described, because "four levels of pass-through" is
   easy to wave away and tedious to actually look at. */

import { Component } from '@angular/core';

import { DeepToolbar } from './deep-toolbar';

@Component({
    selector: 'app-section-c',
    imports: [DeepToolbar],
    template: `<div class="nest"><p class="text-sm text-muted">SectionC</p><app-deep-toolbar /></div>`
})
export class SectionC {}

@Component({
    selector: 'app-section-b',
    imports: [SectionC],
    template: `<div class="nest"><p class="text-sm text-muted">SectionB</p><app-section-c /></div>`
})
export class SectionB {}

@Component({
    selector: 'app-section-a',
    imports: [SectionB],
    template: `<div class="nest"><p class="text-sm text-muted">SectionA</p><app-section-b /></div>`
})
export class SectionA {}
