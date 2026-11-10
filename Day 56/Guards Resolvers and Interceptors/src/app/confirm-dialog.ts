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

   What it does NOT have, and I am recording the gap rather than hiding it: a
   focus trap. Tab can leave this dialog and reach the page behind it. A real
   one needs a trap and a focus restore, which is Day 57's work - and `<dialog>`
   would give both for free, which is the trade-off I made and may well
   reverse. */

import { Component, computed, inject } from '@angular/core';

import { ConfirmService } from './confirm.service';

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
                (keydown.escape)="respond(false)"
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

                    <button
                        type="button"
                        class="button button--small"
                        id="dialog-cancel"
                        autofocus
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

    protected readonly question = computed(() => this.confirm.question());

    protected respond(confirmed: boolean): void {
        this.confirm.respond(confirmed);
    }
}
