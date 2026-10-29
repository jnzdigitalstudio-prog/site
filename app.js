"use strict";

const { invoke } = window.__TAURI__.core;
// Version web (test sur iPhone) : pas de rappels, mais sauvegarde dans un fichier.
const WEB = !!window.__TAURI__.web;

/* ---------- Constantes ---------- */

const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const JOURS_COURTS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const JOURS_LONGS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];

const NUANCES = [
  "#d9774f", "#e6a75c", "#f2b38f", "#e8c9a9", "#c79f7d", "#a8785a",
  "#c98b8b", "#d9a3b5", "#b493b0", "#8e9bb5", "#87aab0", "#9fae8f",
];

// Services d'affectation (ligne MOB du planning).
const SERVICES = { MAT: "Maternité", NEURO: "Neurologie", PNEUM: "Pneumologie", PNEUMO: "Pneumologie" };

const ICONES = {
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  fermer: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  corbeille: '<svg viewBox="0 0 24 24"><path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 12.5h9l1-12.5"/></svg>',
  coche: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
};

/* ---------- État ---------- */

let D = null;
const ici = new Date();
const etat = {
  annee: ici.getFullYear(),
  mois: ici.getMonth(),
  jour: versIso(ici),
  pinceau: null, // id d'une légende, "gomme" ou null
  peinture: false,
};

/* ---------- Outils ---------- */

const $ = (sel) => document.querySelector(sel);

function deux(n) { return String(n).padStart(2, "0"); }

function versIso(date) {
  return `${date.getFullYear()}-${deux(date.getMonth() + 1)}-${deux(date.getDate())}`;
}

function depuisIso(iso) {
  const [a, m, j] = iso.split("-").map(Number);
  return new Date(a, m - 1, j);
}

function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function echapper(texte) {
  return String(texte ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function minutes(h) {
  if (!h) return null;
  const [hh, mm] = h.split(":").map(Number);
  return hh * 60 + mm;
}

function estDeNuit(l) {
  const d = minutes(l.debut), f = minutes(l.fin);
  return d !== null && f !== null && f <= d;
}

function horaire(l) {
  return l.debut && l.fin ? `${l.debut} → ${l.fin}` : "";
}

function legende(id) { return D.legendes.find((l) => l.id === id); }
function typeJour(id) { return D.types.find((t) => t.id === id); }

function jourDe(iso) { return D.jours[iso]; }

function jourEditable(iso) {
  if (!D.jours[iso]) D.jours[iso] = { legende: null, service: "", note: "", rdv: [], taches: [] };
  return D.jours[iso];
}

/** Retire une date vide pour garder le fichier propre. */
function nettoyer(iso) {
  const j = D.jours[iso];
  if (j && !j.legende && !j.service.trim() && !j.note.trim() && !j.rdv.length && !j.taches.length) delete D.jours[iso];
}

function nomService(code) {
  return SERVICES[code.toUpperCase()] || code;
}

let minuterieSauvegarde = null;
function sauver() {
  clearTimeout(minuterieSauvegarde);
  minuterieSauvegarde = setTimeout(() => {
    invoke("enregistrer", { donnees: D }).then(rafraichirStats).catch((e) => toast(`Impossible d'enregistrer : ${e}`));
  }, 200);
}

let minuterieToast = null;
function toast(message) {
  const t = $("#toast");
  t.textContent = message;
  t.classList.add("visible");
  clearTimeout(minuterieToast);
  minuterieToast = setTimeout(() => t.classList.remove("visible"), 2600);
}

function ajusterHauteur(zone) {
  zone.style.height = "auto";
  zone.style.height = `${zone.scrollHeight + 2}px`;
}

/* ---------- Navigation ---------- */

function afficherVue(nom) {
  document.querySelectorAll(".onglet").forEach((b) => b.classList.toggle("actif", b.dataset.vue === nom));
  document.querySelectorAll(".vue").forEach((v) => v.classList.toggle("active", v.id === `vue-${nom}`));
  fermerPanneauMobile();
  fermerSelecteur();
  $("main").scrollTop = 0;
  if (nom === "agenda") rendreAgenda();
  if (nom === "import") rendreImport();
  if (nom === "notes") rendreNotes();
  if (nom === "legendes") rendreLegendes();
  if (nom === "reglages") rendreReglages();
}

/* ---------- Agenda ---------- */

function rendreAgenda(direction) {
  $("#annee").textContent = etat.annee;
  $("#titre-mois").textContent = MOIS[etat.mois];
  rendrePinceau();
  rendreGrille(direction);
  rendrePanneau();
  rafraichirStats();
}

function rendrePinceau() {
  const codes = D.legendes.map((l) => `
    <button class="code-pinceau ${etat.pinceau === l.id ? "choisi" : ""}" data-pinceau="${l.id}" style="--c:${l.couleur}">
      <span class="puce">${echapper(l.code)}</span>${echapper(l.nom)}
    </button>`).join("");
  $("#pinceau-codes").innerHTML = codes + `
    <button class="code-pinceau gomme ${etat.pinceau === "gomme" ? "choisi" : ""}" data-pinceau="gomme" style="--c:#937c6d">
      <span class="puce">✕</span>Effacer
    </button>`;

  const actif = etat.pinceau !== null;
  $("#pinceau").classList.toggle("actif", actif);
  $("#grille").classList.toggle("peinture", actif);
  const l = actif && etat.pinceau !== "gomme" ? legende(etat.pinceau) : null;
  $("#pinceau-aide").textContent = !actif
    ? "Choisis un code puis touche les jours"
    : l ? `Touche ou glisse sur les jours pour poser « ${l.code} »` : "Touche les jours à effacer";
}

function rendreGrille(direction) {
  $("#jours-semaine").innerHTML = JOURS_COURTS.map((j) => `<span>${j}</span>`).join("");

  const premier = new Date(etat.annee, etat.mois, 1);
  const decalage = (premier.getDay() + 6) % 7;
  const nbJours = new Date(etat.annee, etat.mois + 1, 0).getDate();
  const nbCases = Math.ceil((decalage + nbJours) / 7) * 7;
  const aujourdhui = versIso(new Date());

  let html = "";
  for (let i = 0; i < nbCases; i++) {
    const date = new Date(etat.annee, etat.mois, 1 - decalage + i);
    html += htmlCase(date, aujourdhui);
  }

  const grille = $("#grille");
  grille.innerHTML = html;
  grille.classList.remove("vers-gauche", "vers-droite");
  if (direction) {
    void grille.offsetWidth; // relance l'animation
    grille.classList.add(direction > 0 ? "vers-gauche" : "vers-droite");
  }
}

function decaler(iso, jours) {
  const d = depuisIso(iso);
  d.setDate(d.getDate() + jours);
  return versIso(d);
}

function legendeDu(iso) {
  const id = jourDe(iso)?.legende;
  return id ? legende(id) : null;
}

function htmlCase(date, aujourdhui) {
  const iso = versIso(date);
  const j = jourDe(iso);
  const l = legendeDu(iso);
  const veille = legendeDu(decaler(iso, -1));
  // Une nuit commence ce soir (bande à droite) ou a commencé hier soir (bande à gauche).
  const nuitDuSoir = l && estDeNuit(l) ? l : null;
  const nuitDuMatin = veille && estDeNuit(veille) ? veille : null;
  const codeDeJour = l && !nuitDuSoir ? l : null;

  const classes = ["case"];
  if (date.getMonth() !== etat.mois) classes.push("hors");
  if (iso === aujourdhui) classes.push("aujourdhui");
  if (iso === etat.jour) classes.push("selection");
  if (date.getDay() === 0 || date.getDay() === 6) classes.push("weekend");
  if (codeDeJour) classes.push("avec-code");
  // Repos, congés, fériés… restent discrets pour que les jours travaillés ressortent.
  if (codeDeJour && !typeJour(codeDeJour.typeId)?.travail) classes.push("repos");
  if (nuitDuSoir) classes.push("soir");

  const styles = [];
  if (codeDeJour) styles.push(`--c:${codeDeJour.couleur}`);
  if (nuitDuSoir) styles.push(`--soir:${nuitDuSoir.couleur}`);
  if (nuitDuMatin) styles.push(`--matin:${nuitDuMatin.couleur}`);

  let marques = "";
  if (j?.note?.trim()) marques += "<i></i>";
  if (j?.rdv?.length) marques += '<i class="rdv"></i>';
  if (j?.taches?.some((t) => !t.faite)) marques += '<i class="tache"></i>';

  let bas = "";
  if (codeDeJour) bas = `<span class="code">${echapper(codeDeJour.code)}</span><span class="heures">${horaire(codeDeJour)}</span>`;
  else if (nuitDuSoir) bas = `<span class="heures">dès ${nuitDuSoir.debut}</span>`;
  else if (nuitDuMatin) bas = `<span class="heures">jusqu'à ${nuitDuMatin.fin}</span>`;
  if (j?.service) bas += `<span class="service">${echapper(nomService(j.service))}</span>`;

  return `
    <button class="${classes.join(" ")}" data-date="${iso}" ${styles.length ? `style="${styles.join(";")}"` : ""}>
      ${nuitDuMatin ? '<span class="bande matin"></span>' : ""}
      ${nuitDuSoir ? '<span class="bande soir"></span>' : ""}
      <span class="num">${date.getDate()}</span>
      ${marques ? `<span class="marques">${marques}</span>` : ""}
      ${bas ? `<span class="bas">${bas}</span>` : ""}
      ${nuitDuSoir ? `<span class="pont ${date.getDay() === 0 ? "bord" : ""}">${echapper(nuitDuSoir.code)}</span>` : ""}
    </button>`;
}

/** Une nuit déborde sur le lendemain : on redessine les deux cases. */
function rafraichirAutour(iso, animer) {
  rafraichirCase(iso, animer);
  rafraichirCase(decaler(iso, 1));
}

/** Remplace une seule case, sans relancer l'animation du mois. */
function rafraichirCase(iso, animer) {
  const ancienne = document.querySelector(`.case[data-date="${iso}"]`);
  if (!ancienne) return;
  const modele = document.createElement("template");
  modele.innerHTML = htmlCase(depuisIso(iso), versIso(new Date())).trim();
  const nouvelle = modele.content.firstChild;
  if (animer) nouvelle.classList.add("pose");
  ancienne.replaceWith(nouvelle);
}

function changerMois(delta) {
  const d = new Date(etat.annee, etat.mois + delta, 1);
  etat.annee = d.getFullYear();
  etat.mois = d.getMonth();
  rendreAgenda(delta);
}

function allerAuMois(annee, mois) {
  const delta = (annee - etat.annee) * 12 + mois - etat.mois;
  etat.annee = annee;
  etat.mois = mois;
  rendreAgenda(Math.sign(delta));
}

/* ---------- Choix du mois et de l'année ---------- */

const MOIS_COURTS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const selecteur = { mode: "mois", annee: 0, debut: 0 };

function ouvrirSelecteur(mode) {
  const el = $("#selecteur");
  if (el.classList.contains("visible") && selecteur.mode === mode) return fermerSelecteur();
  selecteur.mode = mode;
  selecteur.annee = etat.annee;
  selecteur.debut = etat.annee - 5;
  rendreSelecteur();
  el.classList.add("visible");
}

function fermerSelecteur() {
  $("#selecteur").classList.remove("visible");
}

function rendreSelecteur() {
  const ici = new Date();
  const fleche = (sens) => `<button class="bouton-rond petit" data-sel="${sens}" aria-label="${sens === "prec" ? "Précédent" : "Suivant"}">
    <svg viewBox="0 0 24 24"><path d="${sens === "prec" ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7"}"/></svg></button>`;
  let titre, choix;

  if (selecteur.mode === "mois") {
    titre = `<button class="sel-titre" data-sel="annees">${selecteur.annee}</button>`;
    choix = MOIS_COURTS.map((m, i) => {
      const classes = ["sel-choix"];
      if (selecteur.annee === etat.annee && i === etat.mois) classes.push("choisi");
      if (selecteur.annee === ici.getFullYear() && i === ici.getMonth()) classes.push("maintenant");
      return `<button class="${classes.join(" ")}" data-mois="${i}">${m}</button>`;
    }).join("");
  } else {
    titre = `<span class="sel-titre">${selecteur.debut} – ${selecteur.debut + 11}</span>`;
    choix = Array.from({ length: 12 }, (_, i) => selecteur.debut + i).map((a) => {
      const classes = ["sel-choix"];
      if (a === etat.annee) classes.push("choisi");
      if (a === ici.getFullYear()) classes.push("maintenant");
      return `<button class="${classes.join(" ")}" data-annee="${a}">${a}</button>`;
    }).join("");
  }

  $("#selecteur").innerHTML = `
    <div class="sel-entete">${fleche("prec")}${titre}${fleche("suiv")}</div>
    <div class="sel-grille ${selecteur.mode}">${choix}</div>`;
}

function clicSelecteur(e) {
  e.stopPropagation(); // le contenu est redessiné : le clic ne doit pas fermer le sélecteur
  const b = e.target.closest("button");
  if (!b) return;
  const pas = selecteur.mode === "mois" ? 1 : 12;
  if (b.dataset.sel === "prec") { selecteur.annee -= pas; selecteur.debut -= pas; }
  else if (b.dataset.sel === "suiv") { selecteur.annee += pas; selecteur.debut += pas; }
  else if (b.dataset.sel === "annees") { selecteur.mode = "annee"; selecteur.debut = selecteur.annee - 5; }
  else if (b.dataset.annee) { selecteur.annee = Number(b.dataset.annee); selecteur.mode = "mois"; }
  else if (b.dataset.mois) { fermerSelecteur(); return allerAuMois(selecteur.annee, Number(b.dataset.mois)); }
  rendreSelecteur();
}

function allerA(iso) {
  const d = depuisIso(iso);
  const delta = (d.getFullYear() - etat.annee) * 12 + d.getMonth() - etat.mois;
  etat.jour = iso;
  etat.annee = d.getFullYear();
  etat.mois = d.getMonth();
  rendreAgenda(delta === 0 ? 0 : Math.sign(delta));
}

/** Pose le code du pinceau sur une date. `basculer` : un 2e clic retire le code. */
function peindre(iso, basculer) {
  const j = jourEditable(iso);
  const cible = etat.pinceau === "gomme" ? null : etat.pinceau;
  const nouveau = basculer && j.legende === cible ? null : cible;
  if (j.legende === nouveau) return;
  j.legende = nouveau;
  nettoyer(iso);
  rafraichirAutour(iso, true);
  if (iso === etat.jour) rendrePanneau();
  sauver();
}

function selectionnerJour(iso) {
  const precedent = etat.jour;
  etat.jour = iso;
  rafraichirCase(precedent);
  rafraichirCase(iso);
  if (depuisIso(iso).getMonth() !== etat.mois) {
    allerA(iso);
  } else {
    rendrePanneau();
  }
  if (matchMedia("(max-width: 820px)").matches) {
    $("#panneau-jour").classList.add("ouvert");
    $("#voile").classList.add("visible", "pour-jour");
  }
}

function fermerPanneauMobile() {
  $("#panneau-jour").classList.remove("ouvert");
  if ($("#voile").classList.contains("pour-jour")) $("#voile").classList.remove("visible", "pour-jour");
}

/* ---------- Panneau du jour ---------- */

function rendrePanneau() {
  const iso = etat.jour;
  const date = depuisIso(iso);
  const j = jourDe(iso) || { legende: null, service: "", note: "", rdv: [], taches: [] };

  const choix = D.legendes.map((l) => `
    <button class="choix-code ${j.legende === l.id ? "choisi" : ""}" data-code="${l.id}" style="--c:${l.couleur}">
      <span class="puce">${echapper(l.code)}</span>
      <span class="infos">${echapper(l.nom)}<small>${horaire(l) || echapper(typeJour(l.typeId)?.nom || "")}</small></span>
    </button>`).join("");

  const rdv = [...j.rdv].sort((a, b) => (a.heure || "99").localeCompare(b.heure || "99")).map((r) => `
    <li class="element">
      <span class="heure">${echapper(r.heure || "—")}</span>
      <span class="texte">${echapper(r.titre)}</span>
      <button class="icone-supprimer" data-suppr-rdv="${r.id}" aria-label="Supprimer">${ICONES.fermer}</button>
    </li>`).join("");

  const taches = j.taches.map((t) => `
    <li class="element ${t.faite ? "faite" : ""}">
      <button class="case-a-cocher" data-cocher="${t.id}" aria-label="Cocher">${ICONES.coche}</button>
      <span class="texte">${echapper(t.texte)}</span>
      <button class="icone-supprimer" data-suppr-tache="${t.id}" aria-label="Supprimer">${ICONES.fermer}</button>
    </li>`).join("");

  $("#panneau-jour").innerHTML = `
    <div class="contenu-jour">
      <div class="entete-jour">
        <div>
          <p class="surtitre">${JOURS_LONGS[date.getDay()]}</p>
          <h2>${date.getDate()} ${MOIS[date.getMonth()]}</h2>
        </div>
        <button class="bouton-rond fermer-jour" id="fermer-jour" aria-label="Fermer">${ICONES.fermer}</button>
      </div>

      <div class="bloc">
        <div class="bloc-titre">Horaire</div>
        <div class="choix-codes">
          ${choix}
          <button class="choix-code aucun ${!j.legende ? "choisi" : ""}" data-code="" style="--c:#937c6d">
            <span class="puce">–</span><span class="infos">Rien</span>
          </button>
        </div>
      </div>

      <div class="bloc">
        <div class="bloc-titre">Service d'affectation</div>
        <input class="champ" id="service-jour" placeholder="ex. NEURO, PNEUMO…" value="${echapper(j.service || "")}" autocomplete="off">
      </div>

      <div class="bloc">
        <div class="bloc-titre">Note</div>
        <textarea class="champ" id="note-jour" placeholder="Lieu, collègues, tâche du jour…">${echapper(j.note)}</textarea>
      </div>

      <div class="bloc">
        <div class="bloc-titre">Rendez-vous</div>
        <ul class="liste-elements">${rdv}</ul>
        <form class="ligne-ajout" id="ajout-rdv">
          <input class="champ" type="time" id="rdv-heure">
          <input class="champ" id="rdv-titre" placeholder="Nouveau rendez-vous" autocomplete="off">
          <button class="ajouter" aria-label="Ajouter">${ICONES.plus}</button>
        </form>
      </div>

      <div class="bloc">
        <div class="bloc-titre">À faire</div>
        <ul class="liste-elements">${taches}</ul>
        <form class="ligne-ajout" id="ajout-tache">
          <input class="champ" id="tache-texte" placeholder="Ajouter une chose à faire" autocomplete="off">
          <button class="ajouter" aria-label="Ajouter">${ICONES.plus}</button>
        </form>
      </div>
    </div>`;

  $("#service-jour").addEventListener("input", (e) => {
    jourEditable(iso).service = e.target.value.trim().toUpperCase();
    nettoyer(iso);
    rafraichirCase(iso);
    sauver();
  });

  const note = $("#note-jour");
  ajusterHauteur(note);
  note.addEventListener("input", () => {
    ajusterHauteur(note);
    jourEditable(iso).note = note.value;
    nettoyer(iso);
    rafraichirCase(iso);
    sauver();
  });

  $("#ajout-rdv").addEventListener("submit", (e) => {
    e.preventDefault();
    const titre = $("#rdv-titre").value.trim();
    if (!titre) return $("#rdv-titre").focus();
    jourEditable(iso).rdv.push({ id: uid(), heure: $("#rdv-heure").value, titre });
    apresModifJour(iso, "#rdv-titre");
  });

  $("#ajout-tache").addEventListener("submit", (e) => {
    e.preventDefault();
    const texte = $("#tache-texte").value.trim();
    if (!texte) return $("#tache-texte").focus();
    jourEditable(iso).taches.push({ id: uid(), texte, faite: false });
    apresModifJour(iso, "#tache-texte");
  });
}

function apresModifJour(iso, focus) {
  nettoyer(iso);
  rafraichirCase(iso);
  rendrePanneau();
  sauver();
  if (focus) $(focus)?.focus();
}

function clicPanneau(e) {
  const iso = etat.jour;
  const cible = e.target.closest("button");
  if (!cible) return;

  if (cible.id === "fermer-jour") return fermerPanneauMobile();

  if (cible.dataset.code !== undefined) {
    jourEditable(iso).legende = cible.dataset.code || null;
    nettoyer(iso);
    rafraichirAutour(iso, true);
    rendrePanneau();
    return sauver();
  }
  if (cible.dataset.supprRdv) {
    const j = jourEditable(iso);
    j.rdv = j.rdv.filter((r) => r.id !== cible.dataset.supprRdv);
    return apresModifJour(iso);
  }
  if (cible.dataset.supprTache) {
    const j = jourEditable(iso);
    j.taches = j.taches.filter((t) => t.id !== cible.dataset.supprTache);
    return apresModifJour(iso);
  }
  if (cible.dataset.cocher) {
    const t = jourEditable(iso).taches.find((x) => x.id === cible.dataset.cocher);
    t.faite = !t.faite;
    return apresModifJour(iso);
  }
}

/* ---------- Récap du mois ---------- */

async function rafraichirStats() {
  if (!$("#vue-agenda").classList.contains("active")) return;
  const { annee, mois } = etat;
  const s = await invoke("stats_mois", { annee, mois: mois + 1 });
  if (annee !== etat.annee || mois !== etat.mois) return; // le mois a changé entre-temps

  const total = s.parLegende.reduce((n, c) => n + c.nombre, 0);
  const lignes = (comptes) => comptes.map((c) => `
    <div class="ligne-stat">
      <span>${echapper(c.libelle)}</span><b>${c.nombre}</b>
      <span class="barre"><i style="--c:${c.couleur}; width:${(c.nombre / Math.max(total, 1)) * 100}%"></i></span>
    </div>`).join("");

  $("#stats").innerHTML = `
    <div class="stats-entete">
      <h2>Récap de ${MOIS[mois]}</h2>
      <span>${total} jour${total > 1 ? "s" : ""} rempli${total > 1 ? "s" : ""}</span>
    </div>
    <div class="chiffres">
      <div class="chiffre"><strong>${s.journees}</strong><span>Jours</span></div>
      <div class="chiffre"><strong>${s.nuits}</strong><span>Nuits</span></div>
      <div class="chiffre"><strong>${s.travailles}</strong><span>Total travaillé</span></div>
    </div>
    ${total ? `
      <div class="repartition">
        <h3>Par code</h3>${lignes(s.parLegende)}
        <h3>Par type</h3>${lignes(s.parType)}
      </div>` : `<p class="vide-stats">Rien n'est encore posé ce mois-ci. Choisis un code dans « Remplir le mois » pour commencer.</p>`}`;
}

/* ---------- Feuille d'édition ---------- */

let surFermeture = null;

function ouvrirFeuille(html, apresOuverture, fermeture) {
  const f = $("#feuille");
  f.innerHTML = html;
  f.scrollTop = 0;
  surFermeture = fermeture || null;
  $("#voile").classList.remove("pour-jour");
  $("#voile").classList.add("visible");
  f.classList.add("visible");
  apresOuverture?.(f);
}

function fermerFeuille() {
  const f = $("#feuille");
  if (!f.classList.contains("visible")) return;
  f.classList.remove("visible");
  $("#voile").classList.remove("visible");
  const rappel = surFermeture;
  surFermeture = null;
  rappel?.();
}

function confirmer(titre, message, libelle) {
  return new Promise((resoudre) => {
    let reponse = false;
    ouvrirFeuille(`
      <div class="feuille-entete"><h2>${titre}</h2></div>
      <p class="message-confirmation">${message}</p>
      <div class="feuille-pied">
        <div class="droite">
          <button class="bouton-texte" data-reponse="non">Annuler</button>
          <button class="bouton-danger" data-reponse="oui">${ICONES.corbeille}${libelle}</button>
        </div>
      </div>`, (f) => {
      f.querySelectorAll("[data-reponse]").forEach((b) => b.addEventListener("click", () => {
        reponse = b.dataset.reponse === "oui";
        fermerFeuille();
      }));
    }, () => resoudre(reponse));
  });
}

function htmlNuancier(choisie) {
  return `<div class="nuancier">${NUANCES.map((c) => `
    <button type="button" class="nuance ${c === choisie ? "choisie" : ""}" data-nuance="${c}" style="--c:${c}" aria-label="Couleur ${c}"></button>`).join("")}</div>`;
}

function brancherNuancier(f, surChoix) {
  f.querySelectorAll("[data-nuance]").forEach((b) => b.addEventListener("click", () => {
    f.querySelectorAll("[data-nuance]").forEach((x) => x.classList.toggle("choisie", x === b));
    surChoix(b.dataset.nuance);
  }));
}

/* ---------- Notes libres ---------- */

function rendreNotes() {
  const filtre = $("#recherche-notes").value.trim().toLowerCase();
  const notes = [...D.notes]
    .sort((a, b) => b.modifiee.localeCompare(a.modifiee))
    .filter((n) => !filtre || `${n.titre} ${n.contenu}`.toLowerCase().includes(filtre));

  if (!notes.length) {
    $("#liste-notes").innerHTML = `<div class="vide"><strong>${filtre ? "Aucune note trouvée" : "Aucune note pour l'instant"}</strong>${filtre ? "" : "Écris ce que tu veux : idées, listes, rappels…"}</div>`;
    return;
  }

  $("#liste-notes").innerHTML = notes.map((n, i) => `
    <button class="carte-note verre" data-note="${n.id}" style="animation-delay:${Math.min(i, 12) * 30}ms">
      <h3>${echapper(n.titre || "Sans titre")}</h3>
      ${n.contenu.trim() ? `<p>${echapper(n.contenu)}</p>` : ""}
      <small>${dateLisible(n.modifiee)}</small>
    </button>`).join("");
}

function dateLisible(isoComplet) {
  const d = new Date(isoComplet);
  return `${d.getDate()} ${MOIS[d.getMonth()]} ${d.getFullYear()} · ${deux(d.getHours())}:${deux(d.getMinutes())}`;
}

function editerNote(id) {
  let note = D.notes.find((n) => n.id === id);
  const nouvelle = !note;
  if (nouvelle) note = { id: uid(), titre: "", contenu: "", modifiee: new Date().toISOString() };

  ouvrirFeuille(`
    <div class="feuille-entete">
      <input class="champ titre-note" id="note-titre" placeholder="Titre" value="${echapper(note.titre)}">
      <button class="bouton-rond" data-fermer aria-label="Fermer">${ICONES.fermer}</button>
    </div>
    <textarea class="champ contenu-note" id="note-contenu" placeholder="Écris ici…">${echapper(note.contenu)}</textarea>
    <div class="feuille-pied">
      ${nouvelle ? "" : `<button class="bouton-danger" id="note-supprimer">${ICONES.corbeille}Supprimer</button>`}
      <div class="droite"><button class="bouton-principal" data-fermer>Terminé</button></div>
    </div>`, (f) => {
    const titre = f.querySelector("#note-titre");
    const contenu = f.querySelector("#note-contenu");
    const maj = () => {
      note.titre = titre.value;
      note.contenu = contenu.value;
      note.modifiee = new Date().toISOString();
      if (!D.notes.includes(note)) D.notes.push(note);
      sauver();
    };
    titre.addEventListener("input", maj);
    contenu.addEventListener("input", maj);
    f.querySelectorAll("[data-fermer]").forEach((b) => b.addEventListener("click", fermerFeuille));
    f.querySelector("#note-supprimer")?.addEventListener("click", async () => {
      fermerFeuille();
      if (await confirmer("Supprimer la note ?", `« ${echapper(note.titre || "Sans titre")} » sera définitivement supprimée.`, "Supprimer")) {
        D.notes = D.notes.filter((n) => n.id !== note.id);
        sauver();
        rendreNotes();
      }
    });
    (nouvelle ? titre : contenu).focus();
  }, () => {
    // Une note laissée vide n'est pas gardée.
    if (!note.titre.trim() && !note.contenu.trim()) {
      D.notes = D.notes.filter((n) => n.id !== note.id);
      sauver();
    }
    rendreNotes();
  });
}

/* ---------- Légendes et types ---------- */

function rendreLegendes() {
  $("#liste-legendes").innerHTML = D.legendes.map((l, i) => {
    const t = typeJour(l.typeId);
    return `
      <button class="carte-legende verre" data-legende="${l.id}" style="--c:${l.couleur}; animation-delay:${i * 35}ms">
        <span class="puce">${echapper(l.code)}</span>
        <span class="infos">
          <strong>${echapper(l.nom)}</strong>
          <span class="horaire">${horaire(l) || "Sans horaire"}</span>
          <span class="badges">
            ${t ? `<span class="badge">${echapper(t.nom)}</span>` : ""}
            ${estDeNuit(l) ? '<span class="badge nuit">Nuit</span>' : ""}
          </span>
        </span>
      </button>`;
  }).join("") || `<div class="vide"><strong>Aucun code</strong>Crée ton premier code horaire.</div>`;

  $("#liste-types").innerHTML = D.types.map((t) => `
    <button class="carte-type verre" data-type="${t.id}" style="--c:${t.couleur}">
      <i></i>${echapper(t.nom)}${t.travail ? "<small>· travail</small>" : ""}
    </button>`).join("");
}

function editerLegende(id) {
  const existante = legende(id);
  const l = existante ? { ...existante } : {
    id: uid(), code: "", nom: "", debut: "09:00", fin: "17:00",
    couleur: NUANCES[D.legendes.length % NUANCES.length], typeId: D.types[0]?.id || "",
  };
  const avecHoraire = !!(l.debut && l.fin);

  ouvrirFeuille(`
    <div class="feuille-entete">
      <h2>${existante ? "Modifier le code" : "Nouveau code"}</h2>
      <button class="bouton-rond" data-fermer aria-label="Fermer">${ICONES.fermer}</button>
    </div>

    <label class="etiquette" for="leg-code">Code (affiché dans le calendrier)</label>
    <input class="champ" id="leg-code" maxlength="6" placeholder="ex. 1U" value="${echapper(l.code)}">

    <label class="etiquette" for="leg-nom">Nom</label>
    <input class="champ" id="leg-nom" placeholder="ex. Matin" value="${echapper(l.nom)}">

    <label class="etiquette">Type de journée</label>
    <div class="choix-codes" id="leg-types">
      ${D.types.map((t) => `
        <button type="button" class="choix-code ${t.id === l.typeId ? "choisi" : ""}" data-type-choix="${t.id}" style="--c:${t.couleur}">
          <span class="infos">${echapper(t.nom)}</span>
        </button>`).join("")}
    </div>

    <div class="ligne-interrupteur">
      <span>Avec des horaires</span>
      <label class="interrupteur"><input type="checkbox" id="leg-avec-horaire" ${avecHoraire ? "checked" : ""}><span></span></label>
    </div>
    <div id="leg-horaires" style="${avecHoraire ? "" : "display:none"}">
      <label class="etiquette">De quelle heure à quelle heure</label>
      <div class="horaires">
        <input class="champ" type="time" id="leg-debut" value="${l.debut || "09:00"}">
        <span class="fleche">→</span>
        <input class="champ" type="time" id="leg-fin" value="${l.fin || "17:00"}">
      </div>
      <p class="indication-nuit" id="leg-nuit"></p>
    </div>

    <label class="etiquette">Couleur</label>
    ${htmlNuancier(l.couleur)}

    <div class="feuille-pied">
      ${existante ? `<button class="bouton-danger" id="leg-supprimer">${ICONES.corbeille}Supprimer</button>` : ""}
      <div class="droite">
        <button class="bouton-texte" data-fermer>Annuler</button>
        <button class="bouton-principal" id="leg-valider">Enregistrer</button>
      </div>
    </div>`, (f) => {
    const q = (s) => f.querySelector(s);
    const majNuit = () => {
      const nuit = q("#leg-avec-horaire").checked && estDeNuit({ debut: q("#leg-debut").value, fin: q("#leg-fin").value });
      q("#leg-nuit").textContent = nuit ? "Se termine le lendemain : compté comme une nuit, sur le jour où il commence." : "";
    };
    majNuit();
    q("#leg-debut").addEventListener("input", majNuit);
    q("#leg-fin").addEventListener("input", majNuit);
    q("#leg-avec-horaire").addEventListener("change", (e) => {
      q("#leg-horaires").style.display = e.target.checked ? "" : "none";
      majNuit();
    });
    f.querySelectorAll("[data-type-choix]").forEach((b) => b.addEventListener("click", () => {
      f.querySelectorAll("[data-type-choix]").forEach((x) => x.classList.toggle("choisi", x === b));
      l.typeId = b.dataset.typeChoix;
    }));
    brancherNuancier(f, (c) => { l.couleur = c; });
    f.querySelectorAll("[data-fermer]").forEach((b) => b.addEventListener("click", fermerFeuille));

    q("#leg-valider").addEventListener("click", () => {
      l.code = q("#leg-code").value.trim().toUpperCase();
      l.nom = q("#leg-nom").value.trim() || l.code;
      if (!l.code) { q("#leg-code").focus(); return toast("Donne un code, par exemple 1U"); }
      if (D.legendes.some((x) => x.id !== l.id && x.code === l.code)) return toast(`Le code ${l.code} existe déjà`);
      const horaires = q("#leg-avec-horaire").checked;
      l.debut = horaires ? q("#leg-debut").value || null : null;
      l.fin = horaires ? q("#leg-fin").value || null : null;
      if (existante) Object.assign(existante, l); else D.legendes.push(l);
      sauver();
      fermerFeuille();
      rendreLegendes();
      toast(existante ? "Code modifié" : `Code ${l.code} créé`);
    });

    q("#leg-supprimer")?.addEventListener("click", async () => {
      const utilises = Object.values(D.jours).filter((j) => j.legende === l.id).length;
      fermerFeuille();
      const message = utilises
        ? `Le code « ${echapper(existante.code)} » est posé sur ${utilises} jour${utilises > 1 ? "s" : ""}. Ces jours redeviendront vides.`
        : `Le code « ${echapper(existante.code)} » sera supprimé.`;
      if (!(await confirmer("Supprimer ce code ?", message, "Supprimer"))) return;
      D.legendes = D.legendes.filter((x) => x.id !== l.id);
      for (const [iso, j] of Object.entries(D.jours)) {
        if (j.legende === l.id) { j.legende = null; nettoyer(iso); }
      }
      if (etat.pinceau === l.id) etat.pinceau = null;
      sauver();
      rendreLegendes();
    });

    if (!existante) q("#leg-code").focus();
  });
}

function editerType(id) {
  const existant = typeJour(id);
  const t = existant ? { ...existant } : { id: uid(), nom: "", couleur: NUANCES[(D.types.length * 3) % NUANCES.length], travail: false };

  ouvrirFeuille(`
    <div class="feuille-entete">
      <h2>${existant ? "Modifier le type" : "Nouveau type"}</h2>
      <button class="bouton-rond" data-fermer aria-label="Fermer">${ICONES.fermer}</button>
    </div>
    <label class="etiquette" for="type-nom">Nom</label>
    <input class="champ" id="type-nom" placeholder="ex. Formation" value="${echapper(t.nom)}">
    <div class="ligne-interrupteur">
      <span>Compte comme un jour travaillé</span>
      <label class="interrupteur"><input type="checkbox" id="type-travail" ${t.travail ? "checked" : ""}><span></span></label>
    </div>
    <label class="etiquette">Couleur</label>
    ${htmlNuancier(t.couleur)}
    <div class="feuille-pied">
      ${existant ? `<button class="bouton-danger" id="type-supprimer">${ICONES.corbeille}Supprimer</button>` : ""}
      <div class="droite">
        <button class="bouton-texte" data-fermer>Annuler</button>
        <button class="bouton-principal" id="type-valider">Enregistrer</button>
      </div>
    </div>`, (f) => {
    const q = (s) => f.querySelector(s);
    brancherNuancier(f, (c) => { t.couleur = c; });
    f.querySelectorAll("[data-fermer]").forEach((b) => b.addEventListener("click", fermerFeuille));
    q("#type-valider").addEventListener("click", () => {
      t.nom = q("#type-nom").value.trim();
      if (!t.nom) { q("#type-nom").focus(); return toast("Donne un nom au type"); }
      t.travail = q("#type-travail").checked;
      if (existant) Object.assign(existant, t); else D.types.push(t);
      sauver();
      fermerFeuille();
      rendreLegendes();
    });
    q("#type-supprimer")?.addEventListener("click", async () => {
      const codes = D.legendes.filter((l) => l.typeId === t.id);
      if (codes.length) {
        return toast(`Utilisé par ${codes.map((c) => c.code).join(", ")} : change d'abord leur type`);
      }
      fermerFeuille();
      if (!(await confirmer("Supprimer ce type ?", `« ${echapper(existant.nom)} » sera supprimé.`, "Supprimer"))) return;
      D.types = D.types.filter((x) => x.id !== t.id);
      sauver();
      rendreLegendes();
    });
    if (!existant) q("#type-nom").focus();
  });
}

/* ---------- Réglages ---------- */

function rendreReglages() {
  invoke("chemin_donnees").then((c) => { $("#chemin-donnees").textContent = c; });
  rendreSauvegarde();

  if (WEB) {
    $("#reglages-rappels").innerHTML = `
      <h2>Rappels</h2>
      <p class="aide">Les rappels arriveront avec la vraie application iPhone : cette version de test ne peut pas envoyer de notifications.</p>`;
    return;
  }

  const r = D.rappels;
  const delais = [15, 30, 45, 60, 90, 120, 180, 240];
  const libelleDelai = (m) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60}` : ""}`);

  $("#reglages-rappels").innerHTML = `
    <h2>Rappels</h2>
    <p class="aide">Pour les jours où un code de travail avec horaires est posé.</p>

    <div class="reglage">
      <div class="texte"><strong>Avant le début du travail</strong><span>Une notification avant ta prise de poste</span></div>
      <label class="interrupteur"><input type="checkbox" id="r-avant" ${r.avantActif ? "checked" : ""}><span></span></label>
    </div>
    <div class="sous-reglage ${r.avantActif ? "" : "inactif"}" id="r-avant-options">
      Me prévenir
      <select class="champ" id="r-avant-minutes">
        ${delais.map((m) => `<option value="${m}" ${m === r.avantMinutes ? "selected" : ""}>${libelleDelai(m)}</option>`).join("")}
      </select>
      avant
    </div>

    <div class="reglage">
      <div class="texte"><strong>La veille au soir</strong><span>« Demain, tu travailles » avec tes horaires</span></div>
      <label class="interrupteur"><input type="checkbox" id="r-veille" ${r.veilleActif ? "checked" : ""}><span></span></label>
    </div>
    <div class="sous-reglage ${r.veilleActif ? "" : "inactif"}" id="r-veille-options">
      À <input class="champ" type="time" id="r-veille-heure" value="${r.veilleHeure}">
    </div>
    <p class="aide">Sur ordinateur, les rappels arrivent tant que l'application est ouverte.</p>`;

  const q = (s) => $(s);
  q("#r-avant").addEventListener("change", (e) => { r.avantActif = e.target.checked; q("#r-avant-options").classList.toggle("inactif", !r.avantActif); sauver(); });
  q("#r-avant-minutes").addEventListener("change", (e) => { r.avantMinutes = Number(e.target.value); sauver(); });
  q("#r-veille").addEventListener("change", (e) => { r.veilleActif = e.target.checked; q("#r-veille-options").classList.toggle("inactif", !r.veilleActif); sauver(); });
  q("#r-veille-heure").addEventListener("change", (e) => { if (e.target.value) { r.veilleHeure = e.target.value; sauver(); } });
}

/* ---------- Sauvegarde (version web) ---------- */

function rendreSauvegarde() {
  if (!WEB) return;
  $("#sauvegarde").innerHTML = `
    <div class="ligne-boutons">
      <button class="bouton-texte" id="sauv-exporter">Sauvegarder mes données</button>
      <label class="bouton-texte">Restaurer une sauvegarde<input type="file" id="sauv-fichier" accept="application/json,.json" hidden></label>
    </div>
    <p class="aide">Crée un fichier à garder dans Fichiers ou iCloud. Utile avant de changer de téléphone ou d'effacer les données de Safari.</p>`;
  $("#sauv-exporter").addEventListener("click", exporterDonnees);
  $("#sauv-fichier").addEventListener("change", (e) => {
    if (e.target.files[0]) restaurerDonnees(e.target.files[0]);
    e.target.value = "";
  });
}

async function exporterDonnees() {
  const nom = `mon-agenda-${versIso(new Date())}.json`;
  const fichier = new File([JSON.stringify(D, null, 2)], nom, { type: "application/json" });
  if (navigator.canShare?.({ files: [fichier] })) {
    try {
      await navigator.share({ files: [fichier], title: "Sauvegarde Mon Agenda" });
      return;
    } catch (e) {
      if (e.name === "AbortError") return;
    }
  }
  const lien = document.createElement("a");
  lien.href = URL.createObjectURL(fichier);
  lien.download = nom;
  lien.click();
  setTimeout(() => URL.revokeObjectURL(lien.href), 1000);
}

async function restaurerDonnees(fichier) {
  let lues;
  try {
    lues = JSON.parse(await fichier.text());
  } catch (e) {
    return toast("Ce fichier n'est pas une sauvegarde valide");
  }
  if (!lues || !Array.isArray(lues.legendes) || typeof lues.jours !== "object") return toast("Ce fichier n'est pas une sauvegarde Mon Agenda");
  if (!(await confirmer("Restaurer cette sauvegarde ?", "Ton agenda actuel sera remplacé par celui de la sauvegarde.", "Restaurer"))) return;
  await invoke("enregistrer", { donnees: lues });
  D = await invoke("charger");
  appliquerTheme();
  toast("Sauvegarde restaurée");
}

/* ---------- Apparence ---------- */

const sombreSysteme = matchMedia("(prefers-color-scheme: dark)");

function appliquerTheme(animer) {
  const choix = D.theme || "nuit";
  const effectif = choix === "auto" ? (sombreSysteme.matches ? "nuit" : "jour") : choix;
  const racine = document.documentElement;
  if (animer && racine.dataset.theme !== effectif) {
    racine.classList.add("changement-theme");
    setTimeout(() => racine.classList.remove("changement-theme"), 650);
  }
  racine.dataset.theme = effectif;
  try { localStorage.setItem("theme", effectif); } catch (e) { /* stockage indisponible : sans gravité */ }
  document.querySelectorAll("[data-theme-choix]").forEach((b) => b.classList.toggle("choisi", b.dataset.themeChoix === choix));
}

/* ---------- Import du planning ---------- */

async function copierTexte(texte) {
  try {
    await navigator.clipboard.writeText(texte);
  } catch (e) {
    const zone = document.createElement("textarea");
    zone.value = texte;
    document.body.append(zone);
    zone.select();
    document.execCommand("copy");
    zone.remove();
  }
}

function parCode(code) {
  return code ? D.legendes.find((l) => l.code.toUpperCase() === code.toUpperCase()) : null;
}

/** Un code inconnu du planning devient un nouveau code, à régler ensuite dans Légendes. */
function creerCode(code) {
  let autre = D.types.find((t) => t.id === "autre");
  if (!autre) {
    autre = { id: "autre", nom: "Autre", couleur: "#c79f7d", travail: false };
    D.types.push(autre);
  }
  const l = { id: uid(), code, nom: code, debut: null, fin: null, couleur: NUANCES[D.legendes.length % NUANCES.length], typeId: autre.id };
  D.legendes.push(l);
  return l;
}

// Ce qui est en cours sur la page Import (gardé quand on change d'onglet).
const etatImport = { reponse: "", lu: null };

function rendreImport() {
  $("#import-etapes").innerHTML = `
    <ol class="etapes">
      <li>
        <b>Ton nom tel qu'il est écrit dans le tableau</b>
        <input class="champ" id="imp-nom" placeholder="ex. DUPONT" value="${echapper(D.nomPlanning)}" autocomplete="off">
      </li>
      <li>
        <b>Envoie la photo du planning à ChatGPT avec ce texte</b>
        <div class="consigne" id="imp-consigne"></div>
        <div class="ligne-boutons">
          <button class="bouton-texte" id="imp-copier">Copier le texte</button>
          <button class="bouton-texte" id="imp-chatgpt">Ouvrir ChatGPT ↗</button>
        </div>
      </li>
      <li>
        <b>Colle ici la réponse de ChatGPT</b>
        <textarea class="champ" id="imp-reponse" placeholder="MOIS: 2026-11&#10;01: SYM=1U ; MOB=&#10;02: SYM=RA ; MOB=NEURO&#10;…">${echapper(etatImport.reponse)}</textarea>
        <div class="ligne-boutons"><button class="bouton-principal" id="imp-lire">Voir l'aperçu</button></div>
      </li>
    </ol>`;

  const majConsigne = () => invoke("consigne_import", { nom: $("#imp-nom").value }).then((t) => { $("#imp-consigne").textContent = t; });
  majConsigne();

  $("#imp-nom").addEventListener("input", (e) => {
    D.nomPlanning = e.target.value.trim();
    sauver();
    majConsigne();
  });
  $("#imp-copier").addEventListener("click", async () => {
    if (!$("#imp-nom").value.trim()) { $("#imp-nom").focus(); return toast("Écris d'abord ton nom"); }
    await copierTexte($("#imp-consigne").textContent);
    toast("Texte copié : colle-le dans ChatGPT avec la photo");
  });
  $("#imp-chatgpt").addEventListener("click", () => invoke("ouvrir_chatgpt").catch((e) => toast(`Impossible d'ouvrir ChatGPT : ${e}`)));
  $("#imp-reponse").addEventListener("input", (e) => { etatImport.reponse = e.target.value; });

  $("#imp-lire").addEventListener("click", async () => {
    const texte = $("#imp-reponse").value;
    if (!texte.trim()) { $("#imp-reponse").focus(); return toast("Colle d'abord la réponse de ChatGPT"); }
    try {
      etatImport.lu = await invoke("analyser_import", { texte });
    } catch (e) {
      return toast(String(e));
    }
    rendreApercuImport();
    if (matchMedia("(max-width: 820px)").matches) $("#import-apercu").scrollIntoView({ behavior: "smooth", block: "start" });
  });

  rendreApercuImport();
}

function rendreApercuImport() {
  const lu = etatImport.lu;
  if (!lu) {
    $("#import-apercu").innerHTML = `
      <div class="vide vide-import">
        <svg viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>
        <strong>L'aperçu de ton mois apparaîtra ici</strong>
        Colle la réponse de ChatGPT, puis touche « Voir l'aperçu ».
      </div>`;
    return;
  }

  const { annee, mois } = lu;
  const lus = new Map(lu.jours.map((j) => [j.jour, j]));
  const nouveaux = new Set();
  let changements = 0;

  const decalage = (new Date(annee, mois - 1, 1).getDay() + 6) % 7;
  const nbJours = new Date(annee, mois, 0).getDate();
  let cases = "<div class=\"apercu-case vide\"></div>".repeat(decalage);

  for (let jour = 1; jour <= nbJours; jour++) {
    const jl = lus.get(jour);
    if (!jl) {
      cases += `<div class="apercu-case">${jour}</div>`;
      continue;
    }
    const actuel = jourDe(`${annee}-${deux(mois)}-${deux(jour)}`);
    const l = parCode(jl.sym);
    if (jl.sym && !l) nouveaux.add(jl.sym);
    const ancienCode = actuel?.legende ? legende(actuel.legende)?.code || "" : "";
    const change = (actuel?.legende && ancienCode.toUpperCase() !== jl.sym) || (actuel?.service && actuel.service !== jl.mob);
    if (change) changements++;
    cases += `
      <div class="apercu-case ${change ? "change" : ""}" style="animation-delay:${jour * 12}ms">
        ${jour}
        ${jl.sym ? `<span class="puce" style="--c:${l?.couleur || "#c79f7d"}">${echapper(jl.sym)}</span>` : ""}
        ${jl.mob ? `<span class="serv">${echapper(nomService(jl.mob))}</span>` : ""}
      </div>`;
  }

  const remplis = lu.jours.filter((j) => j.sym).length;
  $("#import-apercu").innerHTML = `
    <div class="contenu-apercu">
      <p class="surtitre">Aperçu</p>
      <h2>${MOIS[mois - 1]} ${annee}</h2>
      <div class="resume-import">
        <span class="badge">${remplis} jour${remplis > 1 ? "s" : ""} lu${remplis > 1 ? "s" : ""}</span>
        ${changements ? `<span class="badge">${changements} changement${changements > 1 ? "s" : ""}</span>` : ""}
        ${nouveaux.size ? `<span class="badge nuit">Nouveau${nouveaux.size > 1 ? "x" : ""} code${nouveaux.size > 1 ? "s" : ""} : ${[...nouveaux].map(echapper).join(", ")}</span>` : ""}
      </div>
      <div class="apercu-jours">${JOURS_COURTS.map((j) => `<span>${j}</span>`).join("")}</div>
      <div class="apercu-grille">${cases}</div>
      ${changements ? '<p class="legende-apercu"><i></i>Différent de ce qui est déjà dans ton agenda</p>' : ""}
      <p class="aide">Vérifie avec la photo. Tes notes, rendez-vous et tâches sont conservés. Un jour faux se corrige ensuite directement dans l'agenda.</p>
      <div class="feuille-pied">
        <button class="bouton-texte" id="imp-effacer">Effacer</button>
        <div class="droite"><button class="bouton-principal" id="imp-poser">Poser dans l'agenda</button></div>
      </div>
    </div>`;

  $("#imp-effacer").addEventListener("click", () => {
    etatImport.lu = null;
    etatImport.reponse = "";
    rendreImport();
  });
  $("#imp-poser").addEventListener("click", () => {
    for (const jl of lu.jours) {
      const iso = `${annee}-${deux(mois)}-${deux(jl.jour)}`;
      const j = jourEditable(iso);
      const l = parCode(jl.sym) || (jl.sym ? creerCode(jl.sym) : null);
      j.legende = l ? l.id : null;
      j.service = jl.mob;
      nettoyer(iso);
    }
    sauver();
    etatImport.lu = null;
    etatImport.reponse = "";
    afficherVue("agenda");
    allerAuMois(annee, mois - 1);
    toast(`Planning de ${MOIS[mois - 1]} posé dans ton agenda`);
  });
}

/* ---------- Événements ---------- */

function brancher() {
  document.querySelectorAll(".onglet").forEach((b) => b.addEventListener("click", () => afficherVue(b.dataset.vue)));

  $("#btn-mois").addEventListener("click", (e) => { e.stopPropagation(); ouvrirSelecteur("mois"); });
  $("#btn-annee").addEventListener("click", (e) => { e.stopPropagation(); ouvrirSelecteur("annee"); });
  $("#selecteur").addEventListener("click", clicSelecteur);
  document.addEventListener("click", fermerSelecteur);

  document.querySelectorAll("[data-theme-choix]").forEach((b) => b.addEventListener("click", () => {
    D.theme = b.dataset.themeChoix;
    appliquerTheme(true);
    sauver();
  }));
  sombreSysteme.addEventListener("change", () => { if (D.theme === "auto") appliquerTheme(true); });

  $("#mois-prec").addEventListener("click", () => changerMois(-1));
  $("#mois-suiv").addEventListener("click", () => changerMois(1));
  $("#aujourdhui").addEventListener("click", () => allerA(versIso(new Date())));

  $("#pinceau-codes").addEventListener("click", (e) => {
    const b = e.target.closest("[data-pinceau]");
    if (!b) return;
    etat.pinceau = etat.pinceau === b.dataset.pinceau ? null : b.dataset.pinceau;
    rendrePinceau();
  });

  // Grille : sélection d'un jour, ou peinture au toucher / glisser.
  const grille = $("#grille");
  grille.addEventListener("pointerdown", (e) => {
    const c = e.target.closest(".case");
    if (!c || !etat.pinceau) return;
    e.preventDefault();
    etat.peinture = true;
    etat.dernierePeinte = c.dataset.date;
    peindre(c.dataset.date, true);
  });
  grille.addEventListener("pointermove", (e) => {
    if (!etat.peinture) return;
    const c = document.elementFromPoint(e.clientX, e.clientY)?.closest(".case");
    if (c && c.dataset.date !== etat.dernierePeinte) {
      etat.dernierePeinte = c.dataset.date;
      peindre(c.dataset.date, false);
    }
  });
  window.addEventListener("pointerup", () => { etat.peinture = false; });
  grille.addEventListener("click", (e) => {
    const c = e.target.closest(".case");
    if (c && !etat.pinceau) selectionnerJour(c.dataset.date);
  });

  $("#panneau-jour").addEventListener("click", clicPanneau);

  $("#nouvelle-note").addEventListener("click", () => editerNote(null));
  $("#recherche-notes").addEventListener("input", rendreNotes);
  $("#liste-notes").addEventListener("click", (e) => {
    const b = e.target.closest("[data-note]");
    if (b) editerNote(b.dataset.note);
  });

  $("#nouvelle-legende").addEventListener("click", () => editerLegende(null));
  $("#nouveau-type").addEventListener("click", () => editerType(null));
  $("#liste-legendes").addEventListener("click", (e) => {
    const b = e.target.closest("[data-legende]");
    if (b) editerLegende(b.dataset.legende);
  });
  $("#liste-types").addEventListener("click", (e) => {
    const b = e.target.closest("[data-type]");
    if (b) editerType(b.dataset.type);
  });

  $("#voile").addEventListener("click", () => {
    if ($("#voile").classList.contains("pour-jour")) fermerPanneauMobile();
    else fermerFeuille();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if ($("#selecteur").classList.contains("visible")) fermerSelecteur();
      else if ($("#feuille").classList.contains("visible")) fermerFeuille();
      else if (etat.pinceau) { etat.pinceau = null; rendrePinceau(); }
      else fermerPanneauMobile();
      return;
    }
    const enSaisie = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName);
    if (enSaisie || !$("#vue-agenda").classList.contains("active") || $("#feuille").classList.contains("visible")) return;
    if (e.key === "ArrowLeft") changerMois(-1);
    if (e.key === "ArrowRight") changerMois(1);
  });
}

/* ---------- Démarrage ---------- */

async function demarrer() {
  try {
    D = await invoke("charger");
  } catch (e) {
    document.body.innerHTML = `<p style="padding:40px">Impossible de charger l'agenda : ${echapper(e)}</p>`;
    return;
  }
  appliquerTheme();
  brancher();
  rendreAgenda();
}

demarrer();
