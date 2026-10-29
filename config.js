/* Prelevo – réglages de la page de lancement (à modifier ici, sans toucher au reste). */
window.PRELEVO_LANDING = {
  /* Offre de lancement : texte affiché sous le formulaire. Mettre enabled:false pour la masquer.
     ⚠️ À VALIDER PAR JHN avant publication (nombre d'inscrits, durée offerte). */
  incentive: { enabled: true, text: 'Les 500 premiers inscrits : 3 mois de Premium offerts' },

  /* Où envoyer les inscriptions. provider :
     - 'none'        : rien n'est envoyé (aperçu). L'e-mail est seulement gardé dans ce navigateur.
     - 'formsubmit'  : endpoint = https://formsubmit.co/ajax/<alias>  (aucun compte ; les inscriptions arrivent par e-mail)
     - 'google-form' : endpoint = https://docs.google.com/forms/d/e/<ID>/formResponse, field = 'entry.123456789'
     - 'formspree'   : endpoint = https://formspree.io/f/<ID>
     - 'apps-script' : endpoint = URL /exec d'un script Google Apps Script (web app) relié à une Google Sheet
     - 'json'        : n'importe quel endpoint qui accepte un POST JSON { email, source, date } */
  waitlist: { provider: 'formsubmit', endpoint: 'https://formsubmit.co/ajax/4e6ccd8efe4049c714bdbd1134e55349', field: 'email' },

  /* Bêta fermée (#beta). Appel REST comme server/src/store.js : fetch, en-têtes apikey
     et Authorization. Clé anon publique uniquement — jamais la clé service.
     url et anonKey vides : le formulaire reste affiché, l’envoi explique qu’il n’est pas ouvert.
     Migration à coller à la main : server/supabase/migrations/20261028200000_waitlist.sql
     Un filleul ne compte qu’après confirm_waitlist, appelable seulement avec la clé service. */
  supabase: { url: '', anonKey: '' },

  /* Éditeur et contact affichés dans les mentions / la confidentialité. */
  publisher: 'Jhn Dlt',
  contactEmail: 'jhn.dlt@mail.grokbot.com'
};
