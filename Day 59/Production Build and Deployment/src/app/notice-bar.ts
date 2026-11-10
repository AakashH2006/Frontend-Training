/* Day 48, revised on Day 57 - the consumer of the notifications service.

   It takes no inputs. It is five levels above the components that raise the
   notices and is not their ancestor, so there is no binding that could have
   got the message here.

   DAY 57 took `role="status"` off the paragraph. It was inside an `@if`, so
   the element and the message arrived together and there was no change to a
   watched region - it announced nothing. `NotificationsService.show` now tells
   the announcer, which is a region that was already there, and this component
   is purely visual again. */

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
