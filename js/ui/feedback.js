// ============================================================
//  Boîte à idées : les visiteurs proposent une amélioration,
//  une nouvelle fonctionnalité ou signalent un bug.
//  Envoi par Formspree (même formulaire que le portfolio).
// ============================================================

import { toast } from './common.js';

const ENDPOINT = 'https://formspree.io/f/xgvdvjnv';
const MAX = 2000;

const KINDS = [
  ['idee', '💡 Nouvelle idée'],
  ['amelioration', '✨ Amélioration'],
  ['bug', '🐞 Bug'],
];

let modal = null, lastFocus = null;

function build() {
  modal = document.createElement('div');
  modal.className = 'modal feedback-modal';
  modal.hidden = true;
  modal.innerHTML = `
    <form class="modal-card feedback-card" id="fb-form" role="dialog" aria-modal="true" aria-labelledby="fb-title" novalidate>
      <div class="fb-head">
        <h2 id="fb-title">Une idée pour Fianchetto ?</h2>
        <button type="button" class="icon-btn fb-close" aria-label="Fermer">✕</button>
      </div>
      <p class="muted fb-intro">Une fonctionnalité qui te manque, une amélioration, un bug : je lis tous les messages.</p>
      <div class="seg fb-kind" role="radiogroup" aria-label="Type de message">
        ${KINDS.map(([v, l], i) => `<label><input type="radio" name="type" value="${v}"${i ? '' : ' checked'}><span>${l}</span></label>`).join('')}
      </div>
      <label class="field-label" for="fb-message">Ton message <span class="muted">(obligatoire)</span></label>
      <textarea id="fb-message" name="message" rows="6" maxlength="${MAX}" required placeholder="Ex. : pouvoir analyser une partie à partir d'une position FEN…"></textarea>
      <div class="fb-count muted" aria-live="polite"><span id="fb-count">0</span> / ${MAX}</div>
      <div class="fb-row">
        <div><label class="field-label" for="fb-name">Prénom ou pseudo <span class="muted">(facultatif)</span></label>
          <input id="fb-name" name="name" type="text" maxlength="80" autocomplete="nickname"></div>
        <div><label class="field-label" for="fb-email">E-mail <span class="muted">(facultatif, pour te répondre)</span></label>
          <input id="fb-email" name="email" type="email" maxlength="120" autocomplete="email" inputmode="email"></div>
      </div>
      <input type="text" name="_gotcha" tabindex="-1" autocomplete="off" aria-hidden="true" class="fb-hp">
      <p class="fb-privacy muted">Ton message (et ton e-mail si tu le donnes) est transmis par le service Formspree (États-Unis) et sert uniquement à améliorer Fianchetto et à te répondre. Il est supprimé au plus tard 12 mois après réception. <a href="legal.html#idees">En savoir plus et exercer tes droits</a></p>
      <div class="btn-row">
        <button type="button" class="btn btn-ghost fb-close">Annuler</button>
        <button type="submit" class="btn btn-primary" id="fb-send">Envoyer</button>
      </div>
      <p class="fb-status" id="fb-status" role="status"></p>
    </form>`;
  document.body.appendChild(modal);

  const form = modal.querySelector('#fb-form');
  const msg = form.querySelector('#fb-message');
  const count = form.querySelector('#fb-count');
  msg.addEventListener('input', () => { count.textContent = msg.value.length; });
  modal.querySelectorAll('.fb-close').forEach((b) => b.addEventListener('click', close));
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
  modal.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    if (e.key === 'Tab') {
      const f = [...modal.querySelectorAll('input:not(.fb-hp), textarea, button, a')].filter((x) => x.offsetParent);
      const i = f.indexOf(document.activeElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
    }
  });
  form.addEventListener('submit', (e) => { e.preventDefault(); send(form); });
}

async function send(form) {
  const status = form.querySelector('#fb-status');
  const btn = form.querySelector('#fb-send');
  const message = form.message.value.trim();
  const email = form.email.value.trim();
  status.className = 'fb-status'; status.textContent = '';
  if (message.length < 5) { status.textContent = 'Écris au moins quelques mots.'; status.classList.add('err'); form.message.focus(); return; }
  if (email && !form.email.checkValidity()) { status.textContent = 'Cette adresse e-mail ne semble pas valide.'; status.classList.add('err'); form.email.focus(); return; }
  if (form._gotcha.value) { close(); return; } // robot

  const type = form.type.value;
  const label = (KINDS.find(([v]) => v === type) || KINDS[0])[1].replace(/^\S+\s/, '');
  const body = {
    _subject: `Fianchetto — ${label}`,
    source: 'Fianchetto (boîte à idées)',
    type: label,
    message,
    name: form.name.value.trim() || '(non renseigné)',
    email: email || undefined,
    page: location.hash || '#',
  };
  if (email) body._replyto = email;

  btn.disabled = true; btn.textContent = 'Envoi…';
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(String(res.status));
    form.reset();
    form.querySelector('#fb-count').textContent = '0';
    close();
    toast('Merci ! Ton message a bien été envoyé.', 'success', 4500);
  } catch {
    status.textContent = 'L’envoi a échoué. Vérifie ta connexion et réessaie dans un instant.';
    status.classList.add('err');
  } finally {
    btn.disabled = false; btn.textContent = 'Envoyer';
  }
}

export function openFeedback() {
  if (!modal) build();
  lastFocus = document.activeElement;
  modal.hidden = false;
  modal.querySelector('#fb-message').focus();
}

function close() {
  if (!modal || modal.hidden) return;
  modal.hidden = true;
  if (lastFocus && lastFocus.focus) lastFocus.focus();
}

/** Branche tous les boutons [data-feedback] de la page. */
export function initFeedback() {
  document.querySelectorAll('[data-feedback]').forEach((b) => b.addEventListener('click', (e) => { e.preventDefault(); openFeedback(); }));
}
