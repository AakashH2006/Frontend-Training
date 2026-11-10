/* Day 48 - the consumer of the notifications service.

   It takes no inputs. It is five levels above the components that raise the
   notices and is not their ancestor, so there is no binding that could have
   got the message here. */

import { Component, inject } from '@angular/core';

import { NotificationsService } from './notifications.service';

@Component({
    selector: 'app-notice-bar',
    imports: [],
    template: `
        @if (notifications.latest(); as notice) {
            <p
                class="status text-sm"
                [class.status--error]="notice.tone === 'danger'"
                role="status"
                id="notice"
            >
                {{ notice.message }}
                <button
                    type="button"
                    class="button button--quiet button--small"
                    (click)="notifications.dismiss(notice.id)"
                >
                    Dismiss
                </button>
            </p>
        }
    `
})
export class NoticeBar {
    protected readonly notifications = inject(NotificationsService);
}
