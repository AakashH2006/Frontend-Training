/* Day 56 - the dialog the guard waits on.

   Rendered in the shell, next to the notice bar, for the reason Day 48 gave
   about notifications: the thing that asks (a guard, which has no component)
   and the thing that shows it have no common parent, so the state lives in a
   service and the shell renders it.

   `<dialog>` with `showModal()` was the first version and it came back out.
   The element's modal behaviour is genuinely good - a top layer, a real focus
   trap, Escape handled by the platform - and it has to be opened and closed by
   calling methods on the DOM node, which means a `viewChild` plus an effect
   whose job is to keep an imperative API in step with a signal. That is Day
   34's rule about effects synchronising state, and it broke the way that
   always breaks: a second `showModal()` on an already-open dialog throws.

   So this is the ARIA pattern by hand, which is more code and no imperative
   state to keep in step. The parts that matter:

     role="dialog" + aria-modal="true"   what it is
     aria-labelledby / -describedby      what it says
     autofocus on the safe choice        where focus lands
     (keydown.escape) on the container   the way out

   Day 56 left this comment: "What it does NOT have, and I am recording the gap
   rather than hiding it: a focus trap. Tab can leave this dialog and reach the
   page behind it." DAY 57 is that work, and it turned out to be three defects
   rather than one.

   1. FOCUS NEVER ARRIVED. The `autofocus` attribute on the cancel button was
      the whole of Day 56's focus management, and a probe reading
      `document.activeElement` straight after the dialog opened measured

          dialog open          : yes
          dialog activeElement : body
          autofocus attr       : present

      The attribute is processed when a document is parsed. This element is
      inserted into an existing document by a `@if`, long afterwards. Browsers
      do handle some insertion cases and jsdom handles none, so what the probe
      proves is narrower than "autofocus does nothing" - it proves I could not
      rely on it, which is enough. Focus is set imperatively now, and the probe
      can see it.

   2. TAB LEFT THE DIALOG. Measured by focusing a nav link while the dialog was
      open: it took focus, so every link and button behind the dialog was still
      reachable. A modal that can be tabbed out of is a modal in appearance
      only.

   3. FOCUS WENT NOWHERE ON CLOSE. Dismissing the dialog returned focus to the
      body, so the next Tab started from the top of the document rather than
      from the control the person was using when they were interrupted.

   The trap is a keydown handler rather than the platform's. `<dialog>` with
   `showModal()` would give all three for free - a top layer, a real trap,
   Escape - and it is still the right answer in an app that is not using this
   one to learn what the trap consists of. Day 56's reason for not using it
   stands: it is an imperative API that has to be kept in step with a signal,
   and `showModal()` on an already-open dialog throws. */

import { Component, DOCUMENT, computed, effect, inject, viewChild, type ElementRef } from '@angular/core';

import { ConfirmService } from './confirm.service';

/* Everything in the dialog that can hold focus, in DOM order. A selector
   rather than a list of ids, because the trap should keep working when the
   dialog grows a third button - and `:not([disabled])` because a disabled
   button is in the DOM, is not focusable, and would make the trap hand focus
   to something that cannot take it. */
const FOCUSABLE = 'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

@Component({
    selector: 'app-confirm-dialog',
    template: `
        @if (question(); as question) {
            <!-- The backdrop is a sibling, not a parent, so a click on it
                 cannot be mistaken for a click inside the dialog by an
                 ancestor handler. It is not a button: a backdrop that cancels
                 is a convenience for a mouse and must not be the only way out,
                 which is what Escape and the labelled button are for. -->
            <div class="dialog-backdrop" (click)="respond(false)"></div>

            <div
                class="dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="dialog-title"
                aria-describedby="dialog-body"
                id="confirm-dialog"
                #dialog
                (keydown.escape)="respond(false)"
                (keydown.tab)="onTab($event, false)"
                (keydown.shift.tab)="onTab($event, true)"
            >
                <h2 class="dialog__title" id="dialog-title">{{ question.title }}</h2>
                <p class="dialog__body" id="dialog-body">{{ question.body }}</p>

                <div class="form-actions">
                    <!-- The destructive choice first in the DOM, because it is
                         the one the question is about - and autofocus on the
                         SAFE one, because a focused button plus a stray Enter
                         should not discard work. Day 38's rule about where
                         focus goes, with something at stake this time. -->
                    <button
                        type="button"
                        class="button button--danger button--small"
                        id="dialog-confirm"
                        (click)="respond(true)"
                    >
                        {{ question.confirmLabel }}
                    </button>

                    <!-- No autofocus attribute: it was here until today and
                         did nothing measurable. Focus is set by the effect
                         below instead, which the probe can see.

                         No backticks in this comment either - an inline
                         template is a JS template literal and one backtick
                         ends it. That is the fourth time this week. -->
                    <button
                        type="button"
                        class="button button--small"
                        id="dialog-cancel"
                        (click)="respond(false)"
                    >
                        {{ question.cancelLabel }}
                    </button>
                </div>
            </div>
        }
    `,
    styles: `
        .dialog-backdrop {
            position: fixed;
            inset: 0;
            background: rgb(0 0 0 / 45%);
            z-index: 10;
        }

        .dialog {
            position: fixed;
            z-index: 11;
            top: 20%;
            left: 50%;
            transform: translateX(-50%);
            width: min(28rem, calc(100vw - 2rem));
            padding: 1.25rem;
            border-radius: 0.75rem;
            background: var(--surface, #fff);
            color: inherit;
            box-shadow: 0 1.5rem 3rem rgb(0 0 0 / 35%);
        }

        .dialog__title {
            margin: 0 0 0.5rem;
            font-size: 1.1rem;
        }

        .dialog__body {
            margin: 0 0 1rem;
        }
    `
})
export class ConfirmDialog {
    private readonly confirm = inject(ConfirmService);
    private readonly document = inject(DOCUMENT);

    protected readonly question = computed(() => this.confirm.question());

    /* Undefined until the `@if` renders, which is why this is a signal query
       and why the effect below reads it rather than a constructor doing the
       work. */
    private readonly dialog = viewChild<ElementRef<HTMLElement>>('dialog');

    /* Where focus was when the question arrived. A field rather than a signal:
       nothing renders it and nothing should react to it. */
    private returnFocusTo: HTMLElement | null = null;

    /* Whether this dialog has ever been open, and it is here because of a bug
       the probe found that the specs could not.

       The effect below runs once on creation, with no question and therefore
       no element - which looked like "the dialog has just closed" and sent
       focus to the fallback. So every page in the app started with focus on
       `<main>`:

           activeElement on load   : main#main

       where it should have been the body. Harmless-looking and not harmless: a
       page that moves focus on load is a page that has overridden whatever the
       browser decided, including a fragment in the URL.

       The dialog's own spec could not see it, because a host fixture built to
       test closing has always been open first. The probe loads a page where
       nothing has happened yet, which is the one state the specs never set
       up. */
    private hasBeenOpen = false;

    constructor() {
        /* An effect, and this is the second time this week the exception to
           Day 34's rule has been the same shape: the two things this needs -
           the question and the rendered element - arrive separately and in an
           order I do not control. Moving focus is a one-time view operation,
           not state being synchronised with state.

           It reads `dialog()` rather than `question()` to decide what has
           happened, because the element is the thing that has to exist before
           focus can go into it. */
        effect(() => {
            const element = this.dialog()?.nativeElement;

            if (element === undefined) {
                /* Closed, not never-opened. See `hasBeenOpen` above. */
                if (this.hasBeenOpen) this.restoreFocus();
                this.hasBeenOpen = false;
                return;
            }

            this.hasBeenOpen = true;

            /* Captured BEFORE anything is focused, and only on the way in -
               guarded, because this effect also runs when the question's text
               changes and re-capturing then would store the dialog's own
               button as the place to return to. */
            this.returnFocusTo ??= this.activeElement();

            /* The SAFE choice, which is Day 56's reasoning unchanged: a
               focused destructive button plus a stray Enter should not discard
               somebody's work. What changed is that it now actually happens. */
            element.querySelector<HTMLElement>('#dialog-cancel')?.focus();
        });
    }

    protected respond(confirmed: boolean): void {
        this.confirm.respond(confirmed);
    }

    /* The trap.

       `preventDefault()` is the whole mechanism: the browser is about to move
       focus to the next element in the document, and this stops it and moves
       focus to the next element in the DIALOG instead, wrapping at the ends.
       Two buttons means it wraps on every press, which makes it easy to test
       and easy to get wrong in a way that looks right.

       It only intervenes at the boundary - Tab on the last element, Shift+Tab
       on the first. In between, the browser's own order is correct and
       overriding it would be re-implementing something that works. */
    protected onTab(event: Event, backwards: boolean): void {
        const element = this.dialog()?.nativeElement;
        if (element === undefined) return;

        const focusable = [...element.querySelectorAll<HTMLElement>(FOCUSABLE)];
        if (focusable.length === 0) return;

        const first = focusable[0]!;
        const last = focusable[focusable.length - 1]!;
        const active = this.activeElement();

        if (backwards && active === first) {
            event.preventDefault();
            last.focus();
            return;
        }

        if (!backwards && active === last) {
            event.preventDefault();
            first.focus();
        }
    }

    /* Back to whatever had focus when the question arrived - the Contacts link
       that triggered the navigation, the Sign out button, the form's own
       Cancel. Not the body, which is where Day 56 left it and where the next
       Tab starts from the top of the document.

       `isConnected` is the case that makes this more than one line: the
       element may have been removed while the dialog was open, which is
       exactly what happens when the answer was "discard and leave" and the
       page the button belonged to has been destroyed. Focusing a detached node
       silently does nothing, so `<main>` is the fallback - the same target
       RouteFocus uses, which is the right place to be after a navigation
       anyway. */
    private restoreFocus(): void {
        const target = this.returnFocusTo;
        this.returnFocusTo = null;

        if (target !== null && target.isConnected) {
            target.focus();
            return;
        }

        this.document.getElementById('main')?.focus();
    }

    private activeElement(): HTMLElement | null {
        const active = this.document.activeElement;

        /* The body is not a useful place to return focus to, and it is what
           `activeElement` reports when nothing is focused - so it is treated
           as "nothing" rather than as a target. */
        return active instanceof HTMLElement && active !== this.document.body ? active : null;
    }
}
