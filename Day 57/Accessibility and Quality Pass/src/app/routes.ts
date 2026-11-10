/* Day 51, extended on Day 56 - the route table.

   Week 8's Day 36 did this with React Router. The shape is recognisable: a
   path, a component, a wildcard at the end. Three things are genuinely
   different and all three cost me something that day.

   1. A ROUTE IS DATA, not markup. React Router's routes are elements, so they
      live in a component and can be composed with whatever is in scope. This
      is an array exported from a file, which means routes can be read,
      filtered and tested without rendering anything - and the nav in the shell
      is built from this array rather than hand-written, which it could not be
      in a tree of <Route> elements.

   2. MATCHING IS FIRST-MATCH-WINS. React Router v6 ranks routes by
      specificity, so `/contacts/new` wins over `/contacts/:id` whatever order
      they are written in. Angular walks this array top to bottom and takes the
      first path that matches, so order IS the specificity and the static
      segment has to come first. I got this wrong on purpose later to see what
      it does - it is in Day 51's notes and is now a permanent test.

   3. A route can declare its own TITLE, which the router applies on
      navigation. Day 38 did this in React with an effect in every page.

   DAY 56 adds the three things that make a route more than a path and a
   component, and each of them belongs here rather than in a component for a
   reason worth stating.

   `title` as a FUNCTION. Day 51's titles are strings and the detail route's
   was the static word "Contact" for five days, with a test asserting that and
   a comment promising a resolver. A `ResolveFn<string>` is that resolver: the
   router runs it during navigation, the TitleStrategy applies the result, and
   the component is not involved - because it cannot be. By the time a
   component has a record to be named after, the title has been set.

   `canActivate` on /settings, because "may this be shown" is answered before
   anything is constructed. A component that checks and then redirects has
   already been created, has already started its requests, and has rendered one
   frame of a page the user is not allowed to see.

   `canDeactivate` on the two form routes, because "may this be left" can only
   be answered by the component that is about to be destroyed. Nothing else
   knows there is unsaved text in a field.

   `loadComponent` on About and Settings is the lazy one. */

import { type Routes } from '@angular/router';

import { signedInGuard, unsavedChangesGuard } from './guards';
import { contactTitleResolver, editTitleResolver } from './resolvers';
import { ContactsPage } from './pages/contacts-page';
import { ContactDetailPage } from './pages/contact-detail-page';
import { ContactFormPage } from './pages/contact-form-page';
import { NotFoundPage } from './pages/not-found-page';
import { SignInPage } from './pages/sign-in-page';

export const routes: Routes = [
    /* `pathMatch: 'full'` is required on a redirect from ''.

       Without it the default is 'prefix', and '' is a prefix of every URL in
       the app - so every navigation would redirect to /contacts. The CLI's
       generated comment says "full" without saying why; this is why. */
    { path: '', pathMatch: 'full', redirectTo: 'contacts' },

    { path: 'contacts', component: ContactsPage, title: 'Contacts' },

    /* BEFORE the :id route. First-match-wins means 'contacts/:id' would match
       'contacts/new' with id="new", and the detail page would ask the server
       for a contact called "new" and render its 404 state. */
    {
        path: 'contacts/new',
        component: ContactFormPage,
        title: 'Add a contact',
        /* The guard is listed with the route rather than configured in the
           component, so the route table is the one place that says which
           pages can refuse to be left. */
        canDeactivate: [unsavedChangesGuard]
    },

    /* The title is now the record's name. Five days of "Contact". */
    { path: 'contacts/:id', component: ContactDetailPage, title: contactTitleResolver },

    {
        path: 'contacts/:id/edit',
        component: ContactFormPage,
        title: editTitleResolver,
        canDeactivate: [unsavedChangesGuard]
    },

    /* Day 56: the guarded route.

       `canActivate` runs before the component is constructed and before
       `loadComponent` downloads it - which is the second reason to guard here
       rather than inside the page. A guard on a lazy route means the chunk is
       not even fetched by someone who cannot see it. Measurable, and measured
       in the notes. */
    {
        path: 'settings',
        title: 'Settings',
        canActivate: [signedInGuard],
        loadComponent: () => import('./pages/settings-page').then((m) => m.SettingsPage)
    },

    /* Not guarded, obviously - and not lazy either, because it is where the
       guard sends people and a chunk download in the middle of a redirect is
       a blank screen at exactly the wrong moment. */
    { path: 'sign-in', component: SignInPage, title: 'Sign in' },

    /* The lazy route.

       `loadComponent` returns a promise, so the component is in its own chunk
       and is not downloaded until something navigates here. The build output
       shows it as a separate lazy chunk, which is the only honest way to tell
       whether it worked - the app behaves identically either way.

       `.then((m) => m.AboutPage)` rather than a default export, because a
       named export survives a rename better: `export default class` means the
       importing side picks the name and nothing checks it. */
    {
        path: 'about',
        title: 'About this build',
        loadComponent: () => import('./pages/about-page').then((m) => m.AboutPage)
    },

    /* Last, and it has to be last: '**' matches everything, so anything below
       it is unreachable. React Router ranks the splat lowest automatically;
       here it is my job. */
    { path: '**', component: NotFoundPage, title: 'Page not found' }
];
