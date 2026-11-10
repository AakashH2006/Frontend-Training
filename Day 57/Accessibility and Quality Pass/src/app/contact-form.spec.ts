/* Day 54 - the form, tested through the DOM.

   The hard choice in this file was what to touch. `ContactForm` has a
   `form: FormGroup` on it, and reaching for `form.controls.name.setValue(...)`
   would make every test shorter. It would also test the FormGroup rather than
   the component: `ReactiveFormsModule`, the value accessors, the
   `formControlName` wiring and every `showError` branch in the template are
   exactly the parts that would stop being covered.

   So nothing here touches `form`. The tests set values by dispatching real
   `input` and `change` events at real elements, read errors out of the
   rendered DOM, and submit by dispatching `submit` at the <form>. The only
   members they use are the ones a parent uses: the four inputs, the two
   outputs, `fillFrom` and `clear`.

   That is also why `form` and `submitted` are `protected` - the compiler
   enforces the rule rather than me remembering it. Day 48 made those
   protected for the template's sake; it turns out to be the right boundary for
   a test too. */

import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { ContactForm } from './contact-form';
import { type Contact, type ContactDraft } from './domain';

const ADA: Contact = {
    id: 'c1',
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    phone: '+1 555 0100',
    group: 'work',
    tags: ['maths', 'analytical engine'],
    favourite: true,
    note: 'Met at the conference.',
    addedAt: '2026-10-01T09:00:00.000Z'
};

describe('ContactForm', () => {
    beforeEach(() => {
        /* No providers again. `FormBuilder` is providedIn: 'root', so it needs
           no registration - which is worth knowing, because it looks like the
           kind of thing that would. */
        TestBed.configureTestingModule({});
    });

    const mount = async (inputs: Record<string, unknown> = {}) => {
        const fixture = TestBed.createComponent(ContactForm);
        for (const [name, value] of Object.entries(inputs)) {
            fixture.componentRef.setInput(name, value);
        }
        await fixture.whenStable();

        const element = fixture.nativeElement as HTMLElement;

        const find = <T extends HTMLElement>(selector: string): T => {
            const found = element.querySelector<T>(selector);
            if (found === null) throw new Error(`Nothing matches ${selector}`);
            return found;
        };

        /* The two events that matter, and they are not interchangeable: text
           inputs and textareas are written on `input`, while select and
           checkbox accessors listen for `change`. Getting this wrong gives a
           control that never updates and a test that fails with no error
           message, which is how I learned it on Day 49. */
        const type = async (id: string, value: string) => {
            const field = find<HTMLInputElement | HTMLTextAreaElement>(`#${id}`);
            field.value = value;
            field.dispatchEvent(new Event('input'));
            await fixture.whenStable();
        };

        const choose = async (id: string, value: string) => {
            const field = find<HTMLSelectElement>(`#${id}`);
            field.value = value;
            field.dispatchEvent(new Event('change'));
            await fixture.whenStable();
        };

        const tick = async (id: string) => {
            const box = find<HTMLInputElement>(`#${id}`);
            box.checked = !box.checked;
            box.dispatchEvent(new Event('change'));
            await fixture.whenStable();
        };

        const submit = async () => {
            find<HTMLFormElement>('form').dispatchEvent(new Event('submit'));
            await fixture.whenStable();
        };

        const saved: ContactDraft[] = [];
        const cancelled: number[] = [];
        fixture.componentInstance.save.subscribe((draft) => saved.push(draft));
        fixture.componentInstance.cancel.subscribe(() => cancelled.push(1));

        const summary = () => element.querySelector('#summary');
        const errorFor = (id: string) => element.querySelector(`#${id}-error`)?.textContent?.trim();

        return {
            fixture,
            element,
            find,
            type,
            choose,
            tick,
            submit,
            saved,
            cancelled,
            summary,
            errorFor
        };
    };

    /* ---- what happens when it is wrong ---- */

    it('says nothing until it is submitted', async () => {
        const form = await mount();

        /* An empty form is invalid from the moment it is built. Showing that
           before the user has done anything is the mistake Day 38 named and
           `submitted()` exists to avoid. */
        expect(form.summary()).toBeNull();
        expect(form.errorFor('name')).toBeUndefined();
    });

    it('emits nothing and explains itself when submitted empty', async () => {
        const form = await mount();

        await form.submit();

        expect(form.saved).toEqual([]);

        /* Two problems: no name, and neither an email nor a phone. The count
           is in the heading, so a wrong count is a visible bug. */
        expect(form.summary()?.textContent).toContain('are 2 problems');
        expect(form.errorFor('name')).toBe('A name is required.');
        expect(form.find('#group-error').textContent).toContain(
            'Give either an email address or a phone number.'
        );
    });

    it('makes the summary an alert that can be focused and followed', async () => {
        const form = await mount();
        await form.submit();

        const summary = form.summary();

        /* The three attributes that make the pattern work, and all three are
           invisible. A restyle cannot break them; a rewrite can, and this is
           what notices. */
        expect(summary?.getAttribute('role')).toBe('alert');
        expect(summary?.getAttribute('tabindex')).toBe('-1');
        expect(summary?.querySelector('a')?.getAttribute('href')).toBe('#name');
    });

    it('marks the field invalid for a screen reader, not only in red', async () => {
        const form = await mount();
        await form.submit();

        const name = form.find<HTMLInputElement>('#name');

        expect(name.getAttribute('aria-invalid')).toBe('true');
        expect(name.getAttribute('aria-describedby')).toBe('name-error');
        /* And the thing it points at exists, which is the half of this pattern
           that silently rots. */
        expect(form.element.querySelector('#name-error')).not.toBeNull();
    });

    it('lists problems in field order rather than discovery order', async () => {
        const form = await mount();

        /* Filled last, listed first - the order is the form's, which is Day
           38's rule and the only reason `fieldOrder` exists. */
        await form.type('note', 'x'.repeat(301));
        await form.type('email', 'not-an-address');
        await form.submit();

        const items = [...(form.summary()?.querySelectorAll('li') ?? [])].map((li) =>
            li.textContent?.trim()
        );

        expect(items).toEqual([
            'A name is required.',
            'That does not look like an email address.',
            'Keep the note under 300 characters.'
        ]);
    });

    it('turns an error object into a sentence with the numbers in it', async () => {
        const form = await mount();
        await form.type('tags', 'a, b, c, d, e, f, g');
        await form.submit();

        /* `maxTags` returns { limit: 6, actual: 7 } and the wording lives in
           the template - Day 49's split. This is the join. */
        expect(form.errorFor('tags')).toBe('7 tags, and the limit is 6.');
    });

    it('counts tags the way the submit handler will', async () => {
        const form = await mount();
        await form.type('tags', 'maths, Maths, MATHS');

        /* One tag from three words, on screen, before any submit. The point is
           that the counter and the validator both call `parseTags`. */
        expect(form.find('#tags-count').textContent).toContain('1 / 6');
    });

    /* ---- what happens when it is right ---- */

    it('emits a draft with absent fields absent, not undefined', async () => {
        const form = await mount();

        await form.type('name', '  Grace Hopper  ');
        await form.type('phone', ' +1 555 0100 ');
        await form.choose('group', 'work');
        await form.tick('favourite');
        await form.submit();

        expect(form.saved.length).toBe(1);

        const draft = form.saved[0]!;

        /* Trimmed, and the untouched email is NOT a key. With
           exactOptionalPropertyTypes those are different things, and `toEqual`
           treats `{email: undefined}` as equal to `{}` - so the key is checked
           directly. */
        expect(draft).toEqual({
            name: 'Grace Hopper',
            phone: '+1 555 0100',
            group: 'work',
            tags: [],
            favourite: true
        });
        expect('email' in draft).toBe(false);
        expect('note' in draft).toBe(false);
    });

    it('sends the group the select is showing, as a Group and not a string', async () => {
        const form = await mount();

        await form.type('name', 'Ada');
        await form.type('email', 'ada@example.com');
        await form.choose('group', 'family');
        await form.submit();

        expect(form.saved[0]?.group).toBe('family');
    });

    /* Day 52's bug, which cost a probe to find, and this is the test that
       would have found it in 40ms. */
    it('keeps what was typed after a successful submit, because the save may fail', async () => {
        const form = await mount();

        await form.type('name', 'Margaret Hamilton');
        await form.type('email', 'margaret@example.com');
        await form.submit();

        expect(form.saved.length).toBe(1);

        /* The form has emitted and done nothing else. A server 409 arrives
           after this moment, and the page shows it next to fields that still
           hold what the user wrote. Day 50's version called `clear()` here and
           the user watched their typing vanish under an error message. */
        expect(form.find<HTMLInputElement>('#name').value).toBe('Margaret Hamilton');
        expect(form.find<HTMLInputElement>('#email').value).toBe('margaret@example.com');
    });

    it('clears only when asked', async () => {
        const form = await mount();

        await form.type('name', 'Ada');
        await form.type('note', 'Something');

        form.find('#clear').click();
        await form.fixture.whenStable();

        expect(form.find<HTMLInputElement>('#name').value).toBe('');
        expect(form.find<HTMLTextAreaElement>('#note').value).toBe('');
        /* And the summary goes with it: clearing resets `submitted`, so the
           fresh empty form is not immediately complaining. */
        expect(form.summary()).toBeNull();
    });

    /* ---- the two modes ---- */

    it('takes its labels from whoever routed to it', async () => {
        const form = await mount({ submitLabel: 'Save changes', cancelLabel: 'Back to the list' });

        expect(form.find('#submit').textContent?.trim()).toBe('Save changes');
        expect(form.find('#cancel').textContent?.trim()).toBe('Back to the list');
    });

    it('emits cancel and leaves the decision to the parent', async () => {
        const form = await mount();

        await form.type('name', 'Ada');
        form.find('#cancel').click();
        await form.fixture.whenStable();

        expect(form.cancelled.length).toBe(1);
        /* It did not clear itself, and it did not navigate. It cannot know
           which of those is wanted. */
        expect(form.find<HTMLInputElement>('#name').value).toBe('Ada');
    });

    it('fills every field from a contact, including the ones that are absent', async () => {
        const form = await mount();

        form.fixture.componentInstance.fillFrom(ADA);
        await form.fixture.whenStable();

        expect(form.find<HTMLInputElement>('#name').value).toBe('Ada Lovelace');
        expect(form.find<HTMLInputElement>('#email').value).toBe('ada@example.com');
        expect(form.find<HTMLSelectElement>('#group').value).toBe('work');
        /* Array to comma string on the way in, and `parseTags` on the way out.
           The two have to agree, which is what the round trip below checks. */
        expect(form.find<HTMLInputElement>('#tags').value).toBe('maths, analytical engine');
        expect(form.find<HTMLInputElement>('#favourite').checked).toBe(true);
        expect(form.find<HTMLTextAreaElement>('#note').value).toBe('Met at the conference.');
    });

    it('survives a fill-and-save round trip unchanged', async () => {
        const form = await mount({ existing: [ADA] });

        form.fixture.componentInstance.fillFrom(ADA);
        await form.fixture.whenStable();
        await form.submit();

        const { id: _id, addedAt: _addedAt, ...draft } = ADA;

        /* Nothing added, nothing lost, nothing reordered. This is the test I
           would keep if I could only keep one, because it fails for any change
           to either direction of the mapping. */
        expect(form.saved[0]).toEqual(draft);
    });

    it('hides Clear while editing, because there is nothing to clear to', async () => {
        const form = await mount();

        expect(form.element.querySelector('#clear')).not.toBeNull();

        form.fixture.componentInstance.fillFrom(ADA);
        await form.fixture.whenStable();

        /* Day 50's reasoning: on an edit form, "Clear" would empty the fields
           and leave the form still editing Ada, which means the next save
           blanks her record. Cancel is the way out instead. */
        expect(form.element.querySelector('#clear')).toBeNull();
    });

    /* ---- the uniqueness rule, end to end ---- */

    it('refuses an address another contact already has', async () => {
        const form = await mount({ existing: [ADA] });

        await form.type('name', 'Someone Else');
        await form.type('email', 'ADA@EXAMPLE.COM');
        await form.submit();

        expect(form.saved).toEqual([]);
        expect(form.errorFor('email')).toBe('Another contact already has that email.');
    });

    /* Day 49's timing bug, and the reason `editingId` is a signal owned by the
       component rather than an input. */
    it('does not accuse the record being edited of conflicting with itself', async () => {
        const form = await mount({ existing: [ADA] });

        form.fixture.componentInstance.fillFrom(ADA);
        await form.fixture.whenStable();
        await form.submit();

        expect(form.errorFor('email')).toBeUndefined();
        expect(form.saved.length).toBe(1);
    });

    it('sees a list that arrives after it was built', async () => {
        /* The form is constructed with `existing` at its default of [] - the
           validator is created during construction and the input is set after.
           A validator that had captured the array would never see Ada. */
        const form = await mount();

        await form.type('name', 'Someone Else');
        await form.type('email', 'ada@example.com');
        await form.submit();

        expect(form.saved.length).toBe(1);

        form.fixture.componentRef.setInput('existing', [ADA]);
        await form.fixture.whenStable();
        /* Re-typing the same address, to make the validator run again. */
        await form.type('email', 'ada@example.com ');
        await form.type('email', 'ada@example.com');
        await form.submit();

        expect(form.saved.length).toBe(1);
        expect(form.errorFor('email')).toBe('Another contact already has that email.');
    });

    it('offers the tags already in use without restricting the field', async () => {
        const form = await mount({ knownTags: ['maths', 'logic'] });

        const options = [...form.element.querySelectorAll('#known-tags option')].map((option) =>
            option.getAttribute('value')
        );

        expect(options).toEqual(['maths', 'logic']);

        /* A datalist suggests; it does not validate. A tag nobody has used
           before still goes through, which a <select> would have prevented. */
        await form.type('name', 'Ada');
        await form.type('email', 'ada@example.com');
        await form.type('tags', 'cryptography');
        await form.submit();

        expect(form.saved[0]?.tags).toEqual(['cryptography']);
    });
});
