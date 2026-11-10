/* Day 50 - a different domain, on purpose.

   Nine days of Angular on the reading list means I know the shape of that
   problem too well to tell which decisions were about Angular and which were
   about books. A contact manager is the course's suggestion and it is a good
   one: the same create/edit/validate/persist flow over data with different
   rules.

   What changed in the model, and these are the bits that made it a useful
   exercise rather than a rename:

     - two fields are optional and AT LEAST ONE is required (email or phone),
       which is a cross-field rule with no equivalent in the reading list
     - `tags` is a list inside a single record, which the form has to turn into
       and out of a string
     - `favourite` is a boolean, which is a checkbox, which is a third kind of
       control
     - there is no natural unique key like a title, so uniqueness is on email
       and only when one is given */

export const GROUPS = ['family', 'friends', 'work', 'other'] as const;
export type Group = (typeof GROUPS)[number];

export const GROUP_LABELS: Record<Group, string> = {
    family: 'Family',
    friends: 'Friends',
    work: 'Work',
    other: 'Other'
};

export const SORTS = ['added', 'name', 'group'] as const;
export type Sort = (typeof SORTS)[number];

export const FILTERS = ['all', ...GROUPS, 'favourites'] as const;
export type Filter = (typeof FILTERS)[number];

export const FILTER_LABELS: Record<Filter, string> = {
    all: 'All',
    ...GROUP_LABELS,
    favourites: 'Favourites'
};

export interface Contact {
    readonly id: string;
    readonly name: string;
    /* Both optional, and the form requires at least one. `exactOptionalPropertyTypes`
       means absent and present-and-undefined are different, so the mapping
       uses conditional spreads - Week 5, still. */
    readonly email?: string;
    readonly phone?: string;
    readonly group: Group;
    readonly tags: readonly string[];
    readonly favourite: boolean;
    readonly note?: string;
    readonly addedAt: string;
}

/* What the form reports: everything except the two fields the service owns. */
export type ContactDraft = Omit<Contact, 'id' | 'addedAt'>;

export function isGroup(value: unknown): value is Group {
    return typeof value === 'string' && (GROUPS as readonly string[]).includes(value);
}

export function isSort(value: unknown): value is Sort {
    return typeof value === 'string' && (SORTS as readonly string[]).includes(value);
}

export function isFilter(value: unknown): value is Filter {
    return typeof value === 'string' && (FILTERS as readonly string[]).includes(value);
}

/* The guard for anything coming back out of storage, which was written by an
   older version of this code and is untrusted. Week 5's boundary. */
export function isContact(value: unknown): value is Contact {
    if (typeof value !== 'object' || value === null) return false;

    const c = value as Record<string, unknown>;

    return (
        typeof c['id'] === 'string' &&
        typeof c['name'] === 'string' &&
        typeof c['addedAt'] === 'string' &&
        typeof c['favourite'] === 'boolean' &&
        isGroup(c['group']) &&
        Array.isArray(c['tags']) &&
        c['tags'].every((tag) => typeof tag === 'string') &&
        (c['email'] === undefined || typeof c['email'] === 'string') &&
        (c['phone'] === undefined || typeof c['phone'] === 'string') &&
        (c['note'] === undefined || typeof c['note'] === 'string')
    );
}

/* Day 60 - a tag, with how many contacts use it.

   The count is the reason this is an interface and not a `string`. A datalist
   does not need it; an ordering does, and "the tags people actually use, most
   used first" is a better suggestion list than an alphabet. It is also a fact
   about rows the client has never seen, which is the rule Day 55 wrote down
   when the server started paging: an aggregate over everything has to be
   transmitted, not computed. */
export interface TagCount {
    readonly name: string;
    readonly count: number;
}

/* SEED_CONTACTS has gone.

   The seed data is now `public/api/contacts.json`, which is the fake server's
   data rather than the client's - and it has a fifth row with a group this app
   does not recognise, so the guard above has something real to reject. A
   constant in here would have been the client seeding itself, which is exactly
   the assumption HTTP removes. */
