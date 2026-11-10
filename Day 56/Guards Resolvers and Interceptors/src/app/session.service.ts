/* Day 56 - a session, and it is deliberately not authentication.

   A guard needs something to guard, and every real app's answer is "is this
   person signed in". This app has no server to ask, so the honest version is a
   name in `localStorage` and a signal that says whether there is one.

   WHAT THIS IS NOT. It is not a security boundary and nothing here pretends
   otherwise. Anyone can set the key by hand, there is no password, no token,
   no expiry and no server check. That matters because a route guard is not a
   security boundary either, in any app - it decides what to RENDER, and the
   data behind the route is protected by whatever answers the request. A guard
   that hides a page whose endpoint is open is a UI nicety; writing the fake
   version makes that obvious in a way a real login screen would hide.

   The shape is Day 47's service shape for the fifth time: a private writable
   signal, a readonly view, actions as the only way in. The storage handling is
   the same four lines that have appeared in every week since Week 5, because
   `localStorage` throws rather than returning null when site data is blocked. */

import { Injectable, computed, inject, signal } from '@angular/core';

import { SESSION_STORE_KEY } from './tokens';

@Injectable({ providedIn: 'root' })
export class SessionService {
    private readonly key = inject(SESSION_STORE_KEY);

    private readonly nameSignal = signal<string | null>(this.read());

    readonly name = this.nameSignal.asReadonly();
    readonly signedIn = computed(() => this.name() !== null);

    signIn(name: string): void {
        const trimmed = name.trim();
        if (trimmed.length === 0) return;

        this.nameSignal.set(trimmed);
        this.write(trimmed);
    }

    signOut(): void {
        this.nameSignal.set(null);
        this.write(null);
    }

    /* Read once, in the field initialiser, rather than on every access.

       A getter that read storage every time would be correct and would also
       make `signedIn()` a non-reactive read inside a computed - storage is not
       a signal, so nothing would recompute when it changed. Reading once into
       a signal is what makes the rest of the app able to react at all. */
    private read(): string | null {
        try {
            const raw = localStorage.getItem(this.key);
            return raw === null || raw.trim().length === 0 ? null : raw;
        } catch {
            /* Site data blocked: no session, and the app works without one. */
            return null;
        }
    }

    private write(name: string | null): void {
        try {
            if (name === null) localStorage.removeItem(this.key);
            else localStorage.setItem(this.key, name);
        } catch {
            /* The signal is still set, so the session lasts as long as the
               page. Honest degradation, same as the fake server's. */
        }
    }
}
