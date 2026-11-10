/* Day 56 - the settings, which exist so that the rest of the day is visible.

   Two signals and three methods, and the only interesting one is `shouldFail`,
   because it mutates and returns - a shape I would normally refuse. The tests
   are mostly about the clamping, which is the kind of thing that is obviously
   right until a range input sends a string, and about the countdown, which is
   what makes "fail the next one" different from "fail everything". */

import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { SettingsService } from './settings.service';
import { API_LATENCY } from './tokens';

describe('SettingsService', () => {
    let settings: SettingsService;

    const create = (latency = 120) => {
        TestBed.resetTestingModule();
        TestBed.configureTestingModule({
            providers: [{ provide: API_LATENCY, useValue: latency }]
        });

        return TestBed.inject(SettingsService);
    };

    beforeEach(() => {
        settings = create();
    });

    it('starts at the token value', () => {
        /* The division the service exists to express: the TOKEN is the
           default, decided once when the app is configured, and the SIGNAL is
           what a person does to it afterwards. A token read by the fake server
           directly could never have followed a slider, because a token's value
           cannot change after injection. */
        expect(create(400).latency()).toBe(400);
    });

    it('clamps the latency to something a timer can use', () => {
        settings.setLatency(-50);
        /* Not negative: `timer(-1)` fires immediately, so the setting would
           appear to do nothing rather than to be invalid. */
        expect(settings.latency()).toBe(0);

        settings.setLatency(99999);
        expect(settings.latency()).toBe(2000);
    });

    it('rounds, because a range input is only a suggestion', () => {
        settings.setLatency(123.7);

        expect(settings.latency()).toBe(124);
    });

    it('queues no failures by default', () => {
        expect(settings.failures()).toBe(0);
        expect(settings.shouldFail()).toBe(false);
    });

    it('spends one failure per request and then stops', () => {
        settings.failNext(2);

        /* A countdown rather than a boolean, which is what makes the settings
           page able to offer "fail the next one" - invisible, absorbed by the
           retry - and "fail the next three" - an error on screen. With
           API_RETRIES at 2 those are genuinely different demonstrations. */
        expect(settings.shouldFail()).toBe(true);
        expect(settings.failures()).toBe(1);

        expect(settings.shouldFail()).toBe(true);
        expect(settings.failures()).toBe(0);

        expect(settings.shouldFail()).toBe(false);
    });

    it('takes zero as "stop failing"', () => {
        settings.failNext(3);
        settings.failNext(0);

        expect(settings.shouldFail()).toBe(false);
    });

    it('will not queue a failure for every request ever', () => {
        settings.failNext(1000);

        /* Ten, because a settings page that can brick the app until a reload
           is a worse demonstration than one that cannot. The clamp is the
           difference between a knob and a trap. */
        expect(settings.failures()).toBe(10);
    });
});
