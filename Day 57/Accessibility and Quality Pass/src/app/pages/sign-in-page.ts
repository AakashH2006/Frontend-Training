/* Day 56 - where the guard sends you, and how you get back.

   The whole content of this page is the `returnUrl`. Without it a guard is a
   dead end: you ask for /settings, you are sent here, you sign in, and you
   land on the list wondering what you were doing. With it, signing in finishes
   the navigation the guard interrupted - which is the behaviour people have
   been trained to expect by every app that does this well.

   `returnUrl` arrives as an input, because `withComponentInputBinding()` binds
   query parameters as well as path parameters. That is worth stating plainly
   since it was not obvious to me: Day 51 used it for `:id` and Day 55 for `q`,
   `filter`, `sort` and `page`, and this is the same mechanism again.

   AND IT IS UNTRUSTED. A `returnUrl` is a string in a URL that somebody else
   may have written - a link in an email, for instance - and navigating to it
   after a successful sign-in is exactly the open-redirect shape. `//evil.test`
   and `https://evil.test` are both things `router.navigateByUrl` will happily
   turn into a real navigation off this origin. So it is checked before it is
   used, and the check is a whitelist of shapes rather than a blacklist of
   bad ones. */

import { Component, computed, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';

import { Panel } from '../panel';
import { SessionService } from '../session.service';

@Component({
    selector: 'app-sign-in-page',
    imports: [Panel],
    template: `
        <app-panel heading="Sign in" headingId="sign-in">
            <p class="text-muted text-sm">
                There is no server and no password: this is a name in
                localStorage, so that Day 56 has something for a route guard to
                guard. It protects a page, not any data.
            </p>

            @if (blocked()) {
                <p class="status text-sm" id="sign-in-reason" role="status">
                    Sign in to reach <code>{{ returnUrl() }}</code>.
                </p>
            }

            <!-- (submit), NOT (ngSubmit) - and no backticks anywhere in
                 this comment, because an inline template is a JS template
                 literal and one backtick ends it. Day 55 learned that in the
                 pagination component and I have now done it twice more.

                 ngSubmit is an OUTPUT on Angular's NgForm directive, which
                 arrives with FormsModule or ReactiveFormsModule. This page
                 holds its one field in a signal and imports neither, so there
                 was no NgForm on this element - and an unrecognised event name
                 in a template is bound as a plain DOM listener rather than
                 reported, so (ngSubmit) silently waited for a DOM event called
                 "ngSubmit" that nothing will ever fire. The form did not
                 submit at all, and nothing said so.

                 sign-in-page.spec.ts found it on the first run: four tests
                 failed with "expected null to be 'Ada Lovelace'" because
                 submitting did nothing. Every other form in this app uses
                 reactive forms, which is why six weeks went by without meeting
                 this. -->
            <form (submit)="onSubmit($event)" novalidate>
                <div class="field">
                    <label for="sign-in-name">Your name</label>
                    <input
                        id="sign-in-name"
                        autocomplete="name"
                        [value]="name()"
                        (input)="onName($event)"
                        [attr.aria-invalid]="showError()"
                        [attr.aria-describedby]="showError() ? 'sign-in-error' : null"
                    />
                    @if (showError()) {
                        <p class="field-error" id="sign-in-error">A name is required.</p>
                    }
                </div>

                <div class="form-actions">
                    <button type="submit" class="button" id="sign-in-submit">Sign in</button>
                </div>
            </form>
        </app-panel>
    `
})
export class SignInPage {
    readonly returnUrl = input<string>();

    private readonly session = inject(SessionService);
    private readonly router = inject(Router);

    protected readonly name = signal('');
    protected readonly submitted = signal(false);

    protected readonly blocked = computed(() => this.returnUrl() !== undefined);
    protected readonly showError = computed(
        () => this.submitted() && this.name().trim().length === 0
    );

    protected onName(event: Event): void {
        this.name.set((event.target as HTMLInputElement | null)?.value ?? '');
    }

    protected onSubmit(event: Event): void {
        /* The native event, so the browser's own form submission - a GET to
           this URL and a full page reload - has to be prevented explicitly.
           `ngSubmit` does this for you, which is most of why it exists. */
        event.preventDefault();

        this.submitted.set(true);

        const name = this.name().trim();
        if (name.length === 0) return;

        this.session.signIn(name);

        void this.router.navigateByUrl(safeReturnUrl(this.returnUrl()));
    }
}

/* Only a path on this origin, and the test for that is the first character
   plus the absence of a second slash.

       /settings            allowed
       /settings?tab=api    allowed
       //evil.test/         rejected - a protocol-relative URL
       https://evil.test    rejected - absolute
       javascript:alert(1)  rejected - no leading slash
       settings             rejected - relative, and ambiguous

   Day 51 put `javascript:alert(1)` in a query parameter to see what happened
   and the answer was "nothing, because it was only ever read as text". This
   one is read and then NAVIGATED TO, which is a different risk entirely, and
   the reason this function exists rather than a cast. */
export function safeReturnUrl(value: string | undefined): string {
    if (value === undefined) return '/contacts';
    if (!value.startsWith('/')) return '/contacts';
    if (value.startsWith('//')) return '/contacts';

    return value;
}
