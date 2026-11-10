/* Day 57 - the dialog's focus behaviour, which is the part of it a screenshot
   cannot show.

   Day 56 tested that the dialog asks the right question and returns the right
   answer. None of that touched focus, and all three of the focus behaviours
   were missing: focus never arrived, Tab could leave, and closing it left
   focus on the body. The probe found the first; writing these tests found the
   shape of the other two.

   A HOST COMPONENT, because every one of these assertions is about focus
   moving between the dialog and something outside it. A fixture containing
   only the dialog has nothing outside it, so "focus returned to the element
   that opened the question" cannot be expressed. The host provides a button to
   be focused first, exactly as a page would.

   `document.body.appendChild(fixture.nativeElement)` is the other
   requirement, and it is the one I would most expect to forget:
   `element.focus()` does nothing at all on a node that is not in the document.
   A fixture that is never attached would report `activeElement` as the body
   throughout - every assertion below would then be testing the bug it is
   supposed to prevent, and `expect(document.activeElement).toBe(…)` would be
   the only thing that failed, pointing at the component rather than at the
   spec. Attached once, in `render`, so that cannot happen. */

import { Component, inject } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ConfirmDialog } from './confirm-dialog';
import { ConfirmService } from './confirm.service';

@Component({
    selector: 'app-dialog-host',
    imports: [ConfirmDialog],
    template: `
        <main id="main" tabindex="-1">
            <button type="button" id="opener" (click)="ask()">Leave</button>
            <button type="button" id="other">Something else</button>
        </main>

        <app-confirm-dialog />
    `
})
class DialogHost {
    readonly confirm = inject(ConfirmService);

    ask(): void {
        this.confirm
            .ask({
                body: 'Your changes to Name will be discarded.',
                confirmLabel: 'Discard and leave',
                cancelLabel: 'Keep editing'
            })
            .subscribe();
    }
}

describe('ConfirmDialog, focus', () => {
    let fixture: Awaited<ReturnType<typeof render>>;

    const render = async () => {
        TestBed.resetTestingModule();
        TestBed.configureTestingModule({ providers: [] });

        const created = TestBed.createComponent(DialogHost);
        /* Attached, so that focus() means something. See the note above. */
        document.body.appendChild(created.nativeElement as HTMLElement);
        await created.whenStable();

        return created;
    };

    const q = <T extends HTMLElement>(selector: string) =>
        (fixture.nativeElement as HTMLElement).querySelector<T>(selector);

    const open = async () => {
        q<HTMLButtonElement>('#opener')!.focus();
        q<HTMLButtonElement>('#opener')!.click();
        await fixture.whenStable();
    };

    const tab = async (shift = false) => {
        const event = new KeyboardEvent('keydown', {
            key: 'Tab',
            shiftKey: shift,
            bubbles: true,
            cancelable: true
        });

        document.activeElement?.dispatchEvent(event);
        await fixture.whenStable();

        return event;
    };

    beforeEach(async () => {
        fixture = await render();
    });

    afterEach(() => {
        (fixture.nativeElement as HTMLElement).remove();
    });

    it('does not touch focus before it has ever been opened', async () => {
        /* The test the probe had to find for me. This component's effect runs
           once when it is created, with no question and so no element - which
           is indistinguishable from "it has just closed" unless something
           remembers that it was never open. Without that, every page in the
           app put focus on `<main>` on load:

               activeElement on load   : main#main

           Every other test in this file opens the dialog first, so none of
           them could see it. */
        expect(document.activeElement).toBe(document.body);
    });

    it('moves focus into the dialog when it opens', async () => {
        await open();

        /* The behaviour `autofocus` was supposed to provide and could not be
           relied on to, because the attribute is processed when a document is
           parsed and this element is inserted long afterwards. */
        expect(document.activeElement).toBe(q('#dialog-cancel'));
    });

    it('focuses the safe choice rather than the destructive one', async () => {
        await open();

        /* Day 56's reasoning, now actually true: a focused "Discard and
           leave" plus a stray Enter should not throw away somebody's work. */
        expect(document.activeElement).not.toBe(q('#dialog-confirm'));
        expect(document.activeElement?.id).toBe('dialog-cancel');
    });

    it('wraps Tab from the last control back to the first', async () => {
        await open();

        /* Cancel is last in the DOM, so Tab from it would leave the dialog. */
        const event = await tab();

        expect(event.defaultPrevented).toBe(true);
        expect(document.activeElement).toBe(q('#dialog-confirm'));
    });

    it('wraps Shift+Tab from the first control back to the last', async () => {
        await open();
        q<HTMLButtonElement>('#dialog-confirm')!.focus();

        const event = await tab(true);

        expect(event.defaultPrevented).toBe(true);
        expect(document.activeElement).toBe(q('#dialog-cancel'));
    });

    it('leaves Tab alone in the middle of the dialog', async () => {
        await open();
        q<HTMLButtonElement>('#dialog-confirm')!.focus();

        /* Forwards from the FIRST control is not a boundary, so the browser's
           own order is correct and the trap must not interfere. A trap that
           preventDefaults every Tab has to re-implement focus order, and
           re-implementing focus order is how you end up skipping a control
           somebody needed. */
        const event = await tab();

        expect(event.defaultPrevented).toBe(false);
    });

    it('returns focus to whatever opened it', async () => {
        await open();
        expect(document.activeElement?.id).toBe('dialog-cancel');

        q<HTMLButtonElement>('#dialog-cancel')!.click();
        await fixture.whenStable();

        /* Not the body, which is where Day 56 left it - and from the body the
           next Tab starts at the top of the document, so a keyboard user who
           dismissed a dialog had to walk back through the whole page. */
        expect(document.activeElement).toBe(q('#opener'));
    });

    it('falls back to the content when the opener has gone', async () => {
        await open();

        /* The real case: the answer was "discard and leave", the navigation
           went ahead, and the page holding the button that asked has been
           destroyed. Focusing a detached node silently does nothing, so there
           has to be somewhere else to go. */
        q<HTMLButtonElement>('#opener')!.remove();

        fixture.componentInstance.confirm.respond(true);
        await fixture.whenStable();

        expect(document.activeElement).toBe(q('#main'));
    });

    it('does not re-capture the return target while it is open', async () => {
        await open();

        /* A second question while one is open - which ConfirmService allows,
           answering the first "no" - must not record the dialog's own button
           as the place to return to.

           This is what the `??=` in the component is for, and the failure it
           prevents is subtle enough to be worth a test rather than a comment:
           the effect runs again when the question's text changes, and an
           unguarded capture would read the cancel button as the active element
           and store THAT as the return target. Closing the dialog would then
           "restore" focus to a button that had just been removed, which lands
           on the body - the exact behaviour Day 56 had, reintroduced by the
           code meant to fix it. */
        fixture.componentInstance.confirm.ask({ body: 'Something else?' });
        await fixture.whenStable();

        fixture.componentInstance.confirm.respond(false);
        await fixture.whenStable();

        expect(document.activeElement).toBe(q('#opener'));
    });
});
