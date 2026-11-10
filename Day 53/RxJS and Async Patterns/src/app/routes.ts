/* Day 51 - the route table.

   Week 8's Day 36 did this with React Router. The shape is recognisable: a
   path, a component, a wildcard at the end. Three things are genuinely
   different and all three cost me something today.

   1. A ROUTE IS DATA, not markup. React Router's routes are elements, so they
      live in a component and can be composed with whatever is in scope. This
      is an array exported from a file, which means routes can be read,
      filtered and tested without rendering anything - and the nav below is
      built from this array rather than hand-written, which it could not be in
      a tree of <Route> elements.

   2. MATCHING IS FIRST-MATCH-WINS. React Router v6 ranks routes by
      specificity, so `/contacts/new` wins over `/contacts/:id` whatever order
      they are written in. Angular walks this array top to bottom and takes the
      first path that matches, so order IS the specificity and the static
      segment has to come first. I got this wrong on purpose later to see what
      it does - it is in the notes.

   3. A route can declare its own TITLE, which the router applies on
      navigation. Day 38 did this in React with an effect in every page.

   `loadComponent` on the About route is the lazy one, and it is the only entry
   here that does not name its component eagerly. */

import { type Routes } from '@angular/router';

import { ContactsPage } from './pages/contacts-page';
import { ContactDetailPage } from './pages/contact-detail-page';
import { ContactFormPage } from './pages/contact-form-page';
import { NotFoundPage } from './pages/not-found-page';

export const routes: Routes = [
    /* `pathMatch: 'full'` is required on a redirect from ''.

       Without it the default is 'prefix', and '' is a prefix of every URL in
       the app - so every navigation would redirect to /contacts. The CLI's
       generated comment says "full" without saying why; this is why. */
    { path: '', pathMatch: 'full', redirectTo: 'contacts' },

    { path: 'contacts', component: ContactsPage, title: 'Contacts' },

    /* BEFORE the :id route. First-match-wins means 'contacts/:id' would match
       'contacts/new' with id="new", and the detail page would look for a
       contact with that id and show its "no such contact" state. */
    { path: 'contacts/new', component: ContactFormPage, title: 'Add a contact' },

    { path: 'contacts/:id', component: ContactDetailPage, title: 'Contact' },
    { path: 'contacts/:id/edit', component: ContactFormPage, title: 'Edit contact' },

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
