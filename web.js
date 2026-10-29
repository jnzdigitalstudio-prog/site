// Version web (test sur iPhone) : remplace le backend Rust de Tauri.
// Même interface (`invoke`), même logique que src-tauri/src, données dans le
// stockage de l'appli sur le téléphone.
"use strict";

(() => {
  const CLE = "mon-agenda";

  const typeJour = (id, nom, couleur, travail) => ({ id, nom, couleur, travail });
  const legende = (id, code, nom, horaires, couleur, typeId) => ({
    id, code, nom, debut: horaires ? horaires[0] : null, fin: horaires ? horaires[1] : null, couleur, typeId,
  });

  // Identique à `Donnees::default()` dans modele.rs.
  function donneesParDefaut() {
    return {
      version: 2,
      types: [
        typeJour("travail", "Travail", "#d9774f", true),
        typeJour("repos", "Repos", "#9fae8f", false),
        typeJour("conge", "Congé", "#f2b38f", false),
        typeJour("ferie", "Férié", "#c98b8b", false),
        typeJour("autre", "Autre", "#c79f7d", false),
      ],
      legendes: [
        legende("1u", "1U", "Journée", ["07:00", "19:00"], "#e6a75c", "travail"),
        legende("2n", "2N", "Journée 8h", ["08:00", "20:00"], "#d9774f", "travail"),
        legende("zq", "ZQ", "Journée 7h30", ["07:30", "19:30"], "#c79f7d", "travail"),
        legende("qu", "QU", "Nuit", ["19:00", "07:00"], "#b493b0", "travail"),
        legende("ra", "RA", "Repos annuel", null, "#9fae8f", "repos"),
        legende("rh", "RH", "Repos hebdomadaire", null, "#87aab0", "repos"),
        legende("rtt", "RTT", "RTT", null, "#8e9bb5", "repos"),
        legende("ca", "CA", "Congé annuel", null, "#f2b38f", "conge"),
        legende("rjf", "RJF", "Reliquat jour férié", null, "#d9a3b5", "ferie"),
        legende("jf", "JF", "Jour férié", null, "#c98b8b", "ferie"),
        legende("ik", "IK", "À préciser", null, "#e8c9a9", "autre"),
        legende("fk", "FK", "À préciser", null, "#a8785a", "autre"),
      ],
      jours: {},
      notes: [],
      rappels: { avantActif: false, avantMinutes: 60, veilleActif: false, veilleHeure: "20:00" },
      theme: "nuit",
      nomPlanning: "",
    };
  }

  /** Complète les champs manquants, comme `#[serde(default)]` côté Rust. */
  function normaliser(lues) {
    const d = Object.assign(donneesParDefaut(), lues);
    for (const iso of Object.keys(d.jours)) {
      d.jours[iso] = Object.assign({ legende: null, service: "", note: "", rdv: [], taches: [] }, d.jours[iso]);
    }
    return d;
  }

  function charger() {
    try {
      const texte = localStorage.getItem(CLE);
      if (texte) return normaliser(JSON.parse(texte));
    } catch (e) {
      /* stockage illisible : on repart des valeurs par défaut */
    }
    return donneesParDefaut();
  }

  function enregistrer({ donnees }) {
    localStorage.setItem(CLE, JSON.stringify(donnees));
  }

  /* ----- Récap du mois (stats.rs) ----- */

  const minutes = (h) => {
    const m = /^(\d{2}):(\d{2})$/.exec(h || "");
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  };

  function statsMois({ annee, mois }) {
    const d = charger();
    const prefixe = `${annee}-${String(mois).padStart(2, "0")}-`;
    const parLegende = {}, parType = {};
    let travailles = 0, journees = 0, nuits = 0;

    for (const [date, jour] of Object.entries(d.jours)) {
      if (!date.startsWith(prefixe) || !jour.legende) continue;
      const l = d.legendes.find((x) => x.id === jour.legende);
      if (!l) continue;
      parLegende[l.id] = (parLegende[l.id] || 0) + 1;
      const t = d.types.find((x) => x.id === l.typeId);
      if (!t) continue;
      parType[t.id] = (parType[t.id] || 0) + 1;
      if (t.travail) {
        travailles++;
        const debut = minutes(l.debut), fin = minutes(l.fin);
        if (debut !== null && fin !== null && fin <= debut) nuits++;
        else journees++;
      }
    }

    return {
      travailles, journees, nuits,
      parLegende: d.legendes.filter((l) => parLegende[l.id]).map((l) => ({ id: l.id, libelle: `${l.code} · ${l.nom}`, couleur: l.couleur, nombre: parLegende[l.id] })),
      parType: d.types.filter((t) => parType[t.id]).map((t) => ({ id: t.id, libelle: t.nom, couleur: t.couleur, nombre: parType[t.id] })),
    };
  }

  /* ----- Import du planning (lecture.rs) ----- */

  function consigne({ nom }) {
    nom = (nom || "").trim() || "MON NOM";
    return `Voici la photo d'un planning mensuel de travail. Trouve la personne « ${nom} » dans la colonne des noms, tout à gauche.
Cette personne a deux lignes : SYM (le code horaire du jour) et MOB (le service d'affectation, souvent vide).
Pour chaque jour du mois, recopie exactement le code écrit dans chacune de ces deux lignes (par exemple 1U, 2N, QU, ZQ, RA, RH, CA, RJF, JF, RTT, MAT, NEURO, PNEUM…). Si une case est vide, laisse vide après le signe =.

Réponds UNIQUEMENT avec ce format, une ligne par jour jusqu'au dernier jour du mois, sans aucun autre texte :
MOIS: AAAA-MM
01: SYM=… ; MOB=…
02: SYM=… ; MOB=…`;
  }

  function valeur(texte, cle) {
    const maj = texte.toUpperCase();
    const position = maj.indexOf(cle);
    if (position < 0) return "";
    let apres = maj.slice(position + cle.length).trimStart();
    if (apres[0] === "=" || apres[0] === ":") apres = apres.slice(1);
    const brut = apres.split(/[;|,\t]/)[0].split("MOB")[0].trim();
    const code = brut.replace(/[^\p{L}\p{N}]/gu, "");
    return ["VIDE", "AUCUN", "NA", "RIEN"].includes(code) ? "" : code;
  }

  function analyser({ texte }) {
    let mois = null;
    const jours = new Map();

    for (const brute of texte.split(/\r?\n/)) {
      const ligne = brute.trim().replace(/^[-*`> ]+/, "").trim();
      if (!ligne) continue;
      if (ligne.toUpperCase().startsWith("MOIS")) {
        const nombres = ligne.match(/\d+/g) || [];
        const a = nombres.find((n) => n.length === 4);
        const m = nombres.find((n) => n.length <= 2);
        mois = a && m && Number(m) >= 1 && Number(m) <= 12 ? [Number(a), Number(m)] : null;
        continue;
      }
      const chiffres = /^\d{1,2}(?!\d)/.exec(ligne);
      if (!chiffres) continue;
      const jour = Number(chiffres[0]);
      if (jour < 1 || jour > 31) continue;
      const reste = ligne.slice(chiffres[0].length);
      jours.set(jour, { jour, sym: valeur(reste, "SYM"), mob: valeur(reste, "MOB") });
    }

    if (!mois) throw "Je ne trouve pas la ligne « MOIS: AAAA-MM » dans la réponse.";
    const [annee, m] = mois;
    const dernier = new Date(annee, m, 0).getDate();
    const lus = [...jours.values()].filter((j) => j.jour <= dernier).sort((a, b) => a.jour - b.jour);
    if (!lus.length) throw "Je ne trouve aucune ligne de jour (ex. « 01: SYM=1U ; MOB= »).";
    return { annee, mois: m, jours: lus };
  }

  /* ----- Pont avec l'interface ----- */

  const commandes = {
    charger,
    enregistrer,
    stats_mois: statsMois,
    chemin_donnees: () => "Uniquement sur cet appareil, dans le stockage de l'application.",
    consigne_import: consigne,
    analyser_import: analyser,
    ouvrir_chatgpt: () => { window.open("https://chatgpt.com/", "_blank"); },
  };

  window.__TAURI__ = {
    web: true,
    core: {
      invoke: async (nom, args) => {
        if (!commandes[nom]) throw `Commande inconnue : ${nom}`;
        return commandes[nom](args || {});
      },
    },
  };

  // Demande au navigateur de ne pas effacer les données en cas de manque de place.
  navigator.storage?.persist?.();

  if ("serviceWorker" in navigator && location.protocol === "https:") {
    navigator.serviceWorker.register("sw.js");
  }
})();
