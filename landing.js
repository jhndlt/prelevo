(() => {
  const C = window.PRELEVO_LANDING || {};
  const W = C.waitlist || { provider: 'none' };
  const inc = C.incentive || {};
  document.querySelectorAll('[data-incentive]').forEach(el => {
    if (inc.enabled === false || !inc.text) el.remove(); else el.textContent = '🎁 ' + inc.text;
  });
  if (C.contactEmail) document.querySelectorAll('[data-contact]').forEach(el => el.textContent = C.contactEmail);
  if (C.publisher) document.querySelectorAll('[data-publisher]').forEach(el => el.textContent = C.publisher);

  if (C.contactEmail) document.querySelectorAll('[data-contact-link]').forEach(el => el.href = 'mailto:' + C.contactEmail);

  document.querySelectorAll('[data-theme-set]').forEach(b => b.addEventListener('click', () => {
    if (window.PrelevoTheme) PrelevoTheme.set(b.getAttribute('data-theme-set'));
  }));

  // Provenance de la visite (UTM + site d'origine), gardée le temps de l'onglet, sans cookie.
  const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
  const VKEY = 'prelevo-visit';
  const visit = (() => {
    let v = {}; try { v = JSON.parse(sessionStorage.getItem(VKEY) || '{}'); } catch (e) {}
    const q = new URLSearchParams(location.search);
    const fresh = {};
    UTM_KEYS.forEach(k => { const x = (q.get(k) || '').trim().slice(0, 100); if (x) fresh[k] = x; });
    if (!fresh.utm_source && q.get('ref')) fresh.utm_source = q.get('ref').trim().slice(0, 100);
    if (Object.keys(fresh).length) v = fresh;              // un nouveau lien tracé remplace l'ancien
    if (!v.referrer) { try { const r = document.referrer && new URL(document.referrer); if (r && r.host !== location.host) v.referrer = r.host; } catch (e) {} }
    try { sessionStorage.setItem(VKEY, JSON.stringify(v)); } catch (e) {}
    return v;
  })();
  window.PRELEVO_VISIT = visit;

  document.querySelectorAll('.wl .share').forEach(b => b.addEventListener('click', async () => {
    const url = location.origin + location.pathname + '?utm_source=partage&utm_medium=ami';
    const data = { title: 'Prelevo', text: 'Prelevo repère vos abonnements, les hausses de prix et vous aide à résilier. Liste d’attente :', url };
    try {
      if (navigator.share) { await navigator.share(data); return; }
      await navigator.clipboard.writeText(url); b.textContent = 'Lien copié';
    } catch (e) { if (e && e.name !== 'AbortError') b.textContent = 'Lien copié'; }
  }));

  const KEY = 'prelevo-waitlist';
  const valid = e => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);

  async function send(email, source) {
    const date = new Date().toISOString();
    const p = W.provider || 'none';
    if (p === 'none' || !W.endpoint) {           // aperçu : rien n'est transmis
      const list = JSON.parse(localStorage.getItem(KEY) || '[]');
      if (!list.some(x => x.email === email)) list.push({ email, source, date });
      localStorage.setItem(KEY, JSON.stringify(list));
      return 'local';
    }
    if (p === 'formsubmit') {                    // https://formsubmit.co/ajax/<alias ou e-mail>
      const r = await fetch(W.endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(Object.assign({ email, source, date },
          { utm_source: visit.utm_source || '(direct)', utm_medium: visit.utm_medium || '', utm_campaign: visit.utm_campaign || '',
            utm_content: visit.utm_content || '', utm_term: visit.utm_term || '', referrer: visit.referrer || '' },
          { _subject: 'Nouvelle inscription Prelevo' + (visit.utm_source ? ' · ' + visit.utm_source : ''), _captcha: 'false', _template: 'table', _honey: '' }))
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || String(j.success) !== 'true') throw new Error(j.message || 'HTTP ' + r.status);
      return 'sent';
    }
    if (p === 'google-form') {
      const body = new URLSearchParams({ [W.field]: email });
      await fetch(W.endpoint, { method: 'POST', mode: 'no-cors', body });
      return 'sent';
    }
    if (p === 'apps-script') {
      await fetch(W.endpoint, { method: 'POST', mode: 'no-cors', body: new URLSearchParams({ email, source, date }) });
      return 'sent';
    }
    const r = await fetch(W.endpoint, {                 // formspree / json
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ email, source, date, _subject: 'Prelevo – liste d’attente' })
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return 'sent';
  }

  document.querySelectorAll('form.wl').forEach(f => f.addEventListener('submit', async ev => {
    ev.preventDefault();
    const msg = f.querySelector('.wl-msg'), btn = f.querySelector('button');
    const email = f.email.value.trim().toLowerCase();
    msg.className = 'wl-msg';
    if (f.website.value) return;                        // robot
    if (!valid(email)) { msg.textContent = 'Vérifiez votre adresse e-mail.'; msg.classList.add('err'); f.email.focus(); return; }
    if (!f.consent.checked) { msg.textContent = 'Coche la case pour accepter de recevoir nos e-mails.'; msg.classList.add('err'); return; }
    btn.disabled = true; msg.textContent = 'Inscription…';
    try {
      const how = await send(email, f.dataset.source || '');
      f.classList.add('done'); msg.textContent = '';
      const ok = f.querySelector('.wl-ok');
      if (how === 'local') ok.querySelector('p').textContent = 'Aperçu : la liste d’attente n’est pas encore branchée, votre e-mail est seulement gardé sur cet appareil.';
      ok.hidden = false; ok.focus({ preventScroll: true });
      ok.scrollIntoView({ block: 'center', behavior: 'smooth' });
    } catch (e) {
      btn.disabled = false; msg.classList.add('err');
      msg.textContent = 'Oups, l’inscription n’est pas passée. Réessayez dans un instant.';
    }
  }));

  // Partage : lien tracé utm_source=partage
  document.querySelectorAll('.wl .share').forEach(b => b.addEventListener('click', async () => {
    const url = location.origin + location.pathname + '?utm_source=partage&utm_medium=ami';
    const data = { title: 'Prelevo', text: 'Prelevo repère vos abonnements, les hausses de prix et vous aide à résilier. Liste d’attente :', url };
    try {
      if (navigator.share) { await navigator.share(data); return; }
      await navigator.clipboard.writeText(url); b.textContent = 'Lien copié ✓';
    } catch (e) { if (e && e.name !== 'AbortError') { b.textContent = url; } }
  }));

  const beta = document.getElementById('beta');
  if (beta) {
    const card = beta.querySelector('.beta-card');
    const form = beta.querySelector('.beta-form');
    const done = beta.querySelector('.beta-done');
    const msg = form.querySelector('.beta-msg');
    const btn = form.querySelector('button');
    const REF_RE = /^[abcdefghjkmnpqrstuvwxyz23456789]{8}$/;
    const BETA_KEY = 'prelevo-beta';
    const refFromUrl = (new URLSearchParams(location.search).get('ref') || '').trim().toLowerCase().slice(0, 8);
    if (refFromUrl) form.ref.value = refFromUrl;

    const readBeta = () => { try { return JSON.parse(localStorage.getItem(BETA_KEY) || 'null'); } catch (e) { return null; } };
    const writeBeta = (row) => { try { localStorage.setItem(BETA_KEY, JSON.stringify(row)); } catch (e) {} };
    const referralLink = (code) => location.origin + location.pathname + '?ref=' + encodeURIComponent(code) + '#beta';

    function showDone(row, fresh) {
      card.classList.add('is-done');
      done.hidden = false;
      done.querySelector('[data-place]').textContent = Number(row.position).toLocaleString('fr-FR');
      done.querySelector('[data-place-note]').textContent = Number(row.position) <= 100
        ? 'Vous êtes dans les 100 places.'
        : 'Les 100 premières places entrent dans la bêta.';
      const already = done.querySelector('[data-already]');
      already.hidden = !(fresh && row.already);
      if (fresh && row.already) already.textContent = 'Vous étiez déjà inscrit. Voici votre place à jour et votre lien.';
      const refNote = done.querySelector('[data-ref-note]');
      refNote.hidden = !(fresh && row.refIgnored);
      if (fresh && row.refIgnored) refNote.textContent = 'Ce code n’a pas été reconnu. Votre place est enregistrée, sans parrainage.';
      done.querySelector('[data-link]').value = referralLink(row.referral_code);
      if (fresh) done.focus({ preventScroll: true });
    }

    const saved = readBeta();
    if (saved && saved.referral_code && saved.position != null) showDone(saved, false);

    // ?ref= doit ouvrir le formulaire de la bêta, code déjà rempli.
    // Le lien partagé porte #beta ; on défile aussi si le hash a été perdu.
    if (refFromUrl) {
      if (location.hash !== '#beta') {
        try { history.replaceState(null, '', location.pathname + location.search + '#beta'); } catch (e) {}
      }
      const openBeta = () => {
        const target = card.classList.contains('is-done') ? beta : form;
        const top = target.getBoundingClientRect().top + window.scrollY - 84;
        window.scrollTo(0, Math.max(0, top));
        if (!card.classList.contains('is-done') && form.email) form.email.focus({ preventScroll: true });
      };
      openBeta();
      window.addEventListener('load', () => { openBeta(); setTimeout(openBeta, 50); setTimeout(openBeta, 350); }, { once: true });
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(openBeta);

      // Le hero et le bas de page envoient ailleurs : ils n’écrivent pas referred_by.
      document.querySelectorAll('form.wl').forEach(f => f.addEventListener('submit', (ev) => {
        ev.preventDefault();
        ev.stopImmediatePropagation();
        const typed = (f.email && f.email.value || '').trim();
        if (typed && form.email) form.email.value = typed;
        const note = f.querySelector('.wl-msg');
        if (note) {
          note.className = 'wl-msg';
          note.textContent = 'Pour que le parrainage compte, demandez votre place dans la bêta fermée, juste ici.';
        }
        openBeta();
      }, true));
    }

    // Même appel que server/src/store.js : REST Supabase, clé anon, jamais la clé service.
    async function joinRpc(email, referredBy) {
      const sb = (window.PRELEVO_LANDING && window.PRELEVO_LANDING.supabase) || {};
      const url = String(sb.url || '').replace(/\/+$/, '');
      const key = String(sb.anonKey || '');
      if (!url || !key) { const err = new Error('config'); err.code = 'config'; throw err; }
      let res;
      try {
        res = await fetch(url + '/rest/v1/rpc/join_waitlist', {
          method: 'POST',
          headers: {
            apikey: key,
            authorization: 'Bearer ' + key,
            accept: 'application/json',
            'content-type': 'application/json'
          },
          body: JSON.stringify({ p_email: email, p_referred_by: referredBy || null })
        });
      } catch (e) { const err = new Error('network'); err.code = 'network'; throw err; }
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data || data.error || data.position == null || !data.referral_code) {
        const err = new Error((data && data.error) || 'http');
        err.code = (data && data.error) || 'http';
        throw err;
      }
      return data;
    }

    async function submitBeta(email, refRaw) {
      msg.className = 'beta-msg';
      const trap = form.elements.namedItem('prelevo_hp_zxq');
      if (trap && String(trap.value || '').trim()) {
        trap.value = '';
        msg.textContent = 'Un remplissage automatique a bloqué l’envoi. Votre place n’a pas été demandée : réessayez.';
        msg.classList.add('err');
        return;
      }
      if (!valid(email) || email.length > 254) {
        msg.textContent = 'Indiquez une adresse e-mail valide.';
        msg.classList.add('err');
        form.email.focus();
        return;
      }
      let referredBy = '';
      if (refRaw) {
        if (!REF_RE.test(refRaw)) {
          msg.textContent = 'Ce code de parrainage n’est pas valide. Vous pouvez le retirer : il est facultatif.';
          msg.classList.add('err');
          form.ref.focus();
          return;
        }
        referredBy = refRaw;
      }
      btn.disabled = true;
      const fail = (text) => {
        btn.disabled = false;
        msg.classList.add('err');
        msg.textContent = text;
        const doneMsg = done.querySelector('[data-done-msg]');
        if (doneMsg && !done.hidden) { doneMsg.classList.add('err'); doneMsg.textContent = text; }
      };
      msg.textContent = 'Inscription…';
      const doneMsg = done.querySelector('[data-done-msg]');
      if (doneMsg) doneMsg.textContent = '';
      try {
        const data = await joinRpc(email, referredBy);
        const row = {
          email: email,
          position: data.position,
          referral_code: data.referral_code,
          already: !!data.already,
          refIgnored: !!(referredBy && data.referred === false && !data.already)
        };
        writeBeta(row);
        msg.textContent = '';
        showDone(row, true);
      } catch (e) {
        fail(e && e.code === 'email'
          ? 'Indiquez une adresse e-mail valide.'
          : e && e.code === 'config'
            ? 'L’inscription à la bêta n’est pas disponible pour le moment.'
            : 'L’inscription n’a pas abouti. Réessayez dans un instant.');
      }
    }

    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      submitBeta(form.email.value.trim().toLowerCase(), form.ref.value.trim().toLowerCase());
    });

    done.querySelector('[data-refresh]').addEventListener('click', () => {
      const row = readBeta();
      if (!row || !row.email) return;
      form.ref.value = '';
      submitBeta(row.email, '');
    });

    async function copyText(text) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (e) {}
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        ta.remove();
        return ok;
      } catch (e) { return false; }
    }

    done.querySelector('[data-copy]').addEventListener('click', async (ev) => {
      const b = ev.currentTarget;
      const link = done.querySelector('[data-link]').value;
      if (await copyText(link)) { b.textContent = 'Lien copié'; return; }
      const input = done.querySelector('[data-link]');
      input.focus();
      input.select();
      b.textContent = 'Lien sélectionné';
    });

    done.querySelector('[data-share]').addEventListener('click', async (ev) => {
      const b = ev.currentTarget;
      const link = done.querySelector('[data-link]').value;
      const data = {
        title: 'Prelevo',
        text: 'Prelevo n’est pas une banque, c’est une télécommande qui se branche sur vos banques pour une belle interface. Bêta fermée :',
        url: link
      };
      try {
        if (navigator.share) { await navigator.share(data); return; }
      } catch (e) {
        if (e && e.name === 'AbortError') return;
      }
      if (await copyText(link)) { b.textContent = 'Lien copié'; return; }
      const input = done.querySelector('[data-link]');
      input.focus();
      input.select();
      b.textContent = 'Lien sélectionné';
    });
  }
})();
