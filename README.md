# Prelevo – site de lancement + démo

En ligne (après publication) : https://jhndlt.github.io/prelevo/
- `/` : page de lancement / liste d'attente (index.html, landing.css, landing.js, config.js)
- `/app/` : maquette cliquable de l'app (PWA). Démo : https://jhndlt.github.io/prelevo/app/?demo=1

## Réglages (config.js à la racine)
- `incentive` : texte de l'offre de lancement (« Les 500 premiers inscrits : 3 mois de Premium offerts »), `enabled:false` pour la masquer.
- `waitlist` : où partent les inscriptions de la liste d’attente (`provider` : none | google-form | formspree | apps-script | json, `endpoint`, `field`).
  Avec `none`, rien n'est envoyé : l'e-mail reste dans le navigateur du visiteur (aperçu uniquement, à ne pas publier tel quel).
- `supabase` : bêta fermée (`#beta`). `url` du projet et clé **anon** publique. Jamais la clé service. L’appel est un `POST /rest/v1/rpc/join_waitlist`, comme le `fetch` de `server/src/store.js`. Tant que `url` ou `anonKey` est vide, le formulaire ne part pas.
- Migration à coller à la main dans l’éditeur SQL (ne pas l’appliquer depuis ce dépôt) : `server/supabase/migrations/20261028200000_waitlist.sql`.
- `publisher`, `contactEmail` : affichés dans Mentions légales et Confidentialité.

## Banque (Clever Cloud, app prelevo-api)

Lecture seule via Enable Banking quand `BANK_PROVIDER=enablebanking`. Le détail est dans [server/README.md](server/README.md). À poser **uniquement** sur Clever Cloud, jamais dans le front GitHub Pages :

- `BANK_PROVIDER` = `enablebanking`
- `ENABLEBANKING_APP_ID` = `44da9167-d944-40a8-ad58-6c35ce849ff7`
- `ENABLEBANKING_PRIVATE_KEY` = PEM de l’application (les `\n` échappés sont acceptés ; ne pas la commiter)
- `ENABLEBANKING_REDIRECT_URL` = `https://jhndlt.github.io/prelevo/app/`
- `ENABLEBANKING_ASPSP_NAME` = `Société Générale`
- `ENABLEBANKING_ASPSP_COUNTRY` = `FR`
- `ENABLEBANKING_PSU_TYPE` = `personal`
- `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` (clé service uniquement)
- `PORT` (fourni par Clever Cloud)

Répertoire de déploiement : `server/` (`npm start`). Migrations SQL (à coller à la main, jamais lancées depuis le site) : `server/supabase/migrations/20261021170000_enablebanking.sql`, `server/supabase/migrations/20261028200000_waitlist.sql`. Pas de paiement. Ne pas activer `ENABLEBANKING_FIXTURE` en production.

## Divers
- Aucun cookie, aucun traceur, police Inter auto-hébergée (assets/fonts).
- Image de partage : assets/og.png (1200×630). Source : prelevo-brand/og-image.html.
- `sw.js` à la racine : désinstalle l'ancien service worker de la maquette (quand elle était à la racine) pour que la page de lancement s'affiche. Ne pas supprimer avant quelques semaines.
- Captures d'écran des fonctions : assets/shots/*.webp (issues de la maquette).
