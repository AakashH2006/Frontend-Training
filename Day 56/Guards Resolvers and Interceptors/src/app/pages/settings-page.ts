/* Day 56 - the guarded page.

   A guard needs a page behind it, and the honest choice was between inventing
   an admin screen that does nothing and building the one thing this app
   actually lacks: a way to make the server behave badly on purpose.

   So these are the controls that make the rest of the week observable. The
   latency slider decides whether a loading state is ever seen. "Fail the next
   request" is the only way to watch the retry interceptor work in the real app
   rather than in its spec - two attempts over a server that fails once means
   the user sees nothing, which is the whole point and is indistinguishable
   from nothing having happened.

   It is behind `signedInGuard` because it is the sort of page that would be,
   not because a name in localStorage protects anything. */

import { Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { ConfirmService } from '../confirm.service';
import { HttpLogService } from '../http-log.service';
import { Panel } from '../panel';
import { SessionService } from '../session.service';
import { SettingsService } from '../settings.service';

@Component({
    selector: 'app-settings-page',
    imports: [Panel, RouterLink],
    template: `
        <app-panel heading="Settings" headingId="settings">
            <p class="text-muted text-sm" id="settings-who">
                Signed in as <strong>{{ session.name() }}</strong>.
            </p>

            <div class="field">
                <label for="latency">Fake server latency</label>
                <input
                    id="latency"
                    type="range"
                    min="0"
                    max="2000"
                    step="20"
                    [value]="settings.latency()"
                    (input)="onLatency($event)"
                />
                <p class="text-sm text-muted" id="latency-value">
                    {{ settings.latency() }}&thinsp;ms &middot; every request the fake
                    server answers waits this long
                </p>
            </div>

            <div class="field">
                <span class="label">Failure injection</span>
                <div class="form-actions">
                    <button
                        type="button"
                        class="button button--small"
                        id="fail-one"
                        (click)="settings.failNext(1)"
                    >
                        Fail the next request
                    </button>
                    <button
                        type="button"
                        class="button button--small"
                        id="fail-three"
                        (click)="settings.failNext(3)"
                    >
                        Fail the next three
                    </button>
                    <button
                        type="button"
                        class="button button--quiet button--small"
                        id="fail-none"
                        (click)="settings.failNext(0)"
                    >
                        Stop failing
                    </button>
                </div>
                <p class="text-sm text-muted" id="failures-queued">
                    {{ settings.failures() }} queued.
                    <!-- The point of the control, said once where it is. With
                         API_RETRIES at 2, failing ONE request is invisible
                         except in the log; failing three is an error state. -->
                    One failure is absorbed by the retry interceptor; three is
                    an error on screen.
                </p>
            </div>

            <div class="field">
                <span class="label">Request log</span>
                <p class="text-sm text-muted" id="log-count">
                    {{ log.entries().length }} shown, {{ log.pending() }} in flight.
                </p>
            </div>

            <div class="form-actions">
                <button
                    type="button"
                    class="button button--danger button--small"
                    id="sign-out"
                    (click)="onSignOut()"
                >
                    Sign out
                </button>
                <a class="button button--quiet button--small" routerLink="/contacts">
                    Back to the contacts
                </a>
            </div>
        </app-panel>
    `
})
export class SettingsPage {
    protected readonly session = inject(SessionService);
    protected readonly settings = inject(SettingsService);
    protected readonly log = inject(HttpLogService);

    private readonly confirm = inject(ConfirmService);
    private readonly router = inject(Router);

    protected onLatency(event: Event): void {
        this.settings.setLatency(Number((event.target as HTMLInputElement | null)?.value ?? 0));
    }

    /* Signing out while standing on a guarded page.

       The naive version calls `signOut()` and stays here, so the page is
       rendered for somebody who is no longer signed in - the guard only runs
       on the way IN. Navigating away is the fix, and asking first is because
       this is the one button here that cannot be undone by pressing it again.

       It also uses the confirm service from a component rather than from a
       guard, which is the evidence that the service is not guard-shaped: it is
       just "ask the user a question", and the guard happens to be its most
       interesting caller. */
    protected onSignOut(): void {
        this.confirm
            .ask({
                title: 'Sign out?',
                body: 'You will be sent back to the contacts and will need to sign in again to change these settings.',
                confirmLabel: 'Sign out',
                cancelLabel: 'Stay'
            })
            .subscribe((confirmed) => {
                if (!confirmed) return;

                this.session.signOut();
                void this.router.navigate(['/contacts']);
            });
    }
}
