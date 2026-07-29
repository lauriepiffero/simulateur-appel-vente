// Vercel Serverless Function — voix du prospect, ElevenLabs.
//
// Variable requise : ELEVENLABS_API_KEY
// Optionnelles : ACCESS_CODE (même code que /api/claude)
//                ELEVENLABS_MODEL (par défaut eleven_multilingual_v2 ; eleven_turbo_v2_5 = plus rapide, plus plat)
//                ELEVENLABS_VOICES_F / ELEVENLABS_VOICES_H
//                  (identifiants séparés par des virgules, pour forcer tes propres voix)
//
// Les voix sont choisies parmi les voix françaises de ta bibliothèque, accents
// non hexagonaux écartés : une voix anglophone ou québécoise garde son accent en français.
// Aucun repli : sans voix française disponible, la page affiche une erreur explicite.
//
// Diagnostic : ouvre /api/tts?list=1 sur ton site pour voir les voix détectées.

// Voix françaises natives choisies dans la bibliothèque du compte.
// La détection automatique laissait passer des voix américaines et britanniques qui
// déclarent savoir lire le français : elles gardent leur accent. D'où cette liste fixe.
const DEFAUT = {
  f: [
    ['fBpCO0Kf0krKLYGOu65w', 'Émilie, conseillère clientèle'],
    ['YxrwjAKoUKULGd0g8K9Y', 'Lucie, support'],
    ['FFXYdAYPzn8Tw8KiHZqg', 'Ingrid, chaleureuse']
  ],
  h: [
    ['CYR0HqHoZAUmoZsLWPob', 'Marco, parisien'],
    ['IbbR6Av0dWuQJS0b8JVT', 'Hugo, posé'],
    ['eOwAMwUJEGkP44SKOXIH', 'Julien, service client'],
    ['1EmYoP3UnnnwhlJKovEy', 'Anthony, parisien'],
    ['Yklgus9Ssb2mlIsWUxMT', 'Mathieu, France']
  ]
};

const FALLBACK = { f: [], h: [] };

// Accents francophones non hexagonaux, écartés par défaut.
const HORS_FRANCE = /canad|quebec|québec|qu\u00e9b|belg|suisse|swiss|africa|afriq|creol|créol|acadi/i;

let cache = null;        // { at: timestamp, f: [ids], h: [ids], names: {...} }
const CACHE_MS = 10 * 60 * 1000;

function hayOf(v) {
  const lab = v.labels || {};
  const langs = Array.isArray(v.verified_languages)
    ? v.verified_languages.map(l => [l.language, l.locale, l.accent].filter(Boolean).join(' ')).join(' ')
    : '';
  return [v.name, v.description, lab.language, lab.accent, lab.descriptive, lab.use_case, langs]
    .filter(Boolean).join(' ').toLowerCase();
}

function isFrench(v) {
  const hay = hayOf(v);
  if (/\b(fr|fr-fr|french|français|francais|française|francaise)\b/.test(hay)) return true;
  if (Array.isArray(v.verified_languages)) {
    if (v.verified_languages.some(l => /^fr/i.test(l.language || l.locale || ''))) return true;
  }
  return false;
}

function accentOf(v) {
  const lab = v.labels || {};
  if (lab.accent) return String(lab.accent);
  const hay = hayOf(v);
  const m = hay.match(HORS_FRANCE);
  return m ? m[0] : 'france';
}

function isHexagonal(v) {
  return !HORS_FRANCE.test(hayOf(v));
}

function genderOf(v) {
  const lab = v.labels || {};
  const g = String(lab.gender || '').toLowerCase();
  if (/female|femme/.test(g)) return 'f';
  if (/male|homme/.test(g)) return 'h';
  const hay = [v.name, v.description].filter(Boolean).join(' ').toLowerCase();
  if (/female|femme|woman/.test(hay)) return 'f';
  if (/male|homme|man\b/.test(hay)) return 'h';
  return null;
}

async function loadVoices(key) {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache;

  const envF = (process.env.ELEVENLABS_VOICES_F || '').split(',').map(s => s.trim()).filter(Boolean);
  const envH = (process.env.ELEVENLABS_VOICES_H || '').split(',').map(s => s.trim()).filter(Boolean);
  const names = {};
  DEFAUT.f.concat(DEFAUT.h).forEach(([id, nom]) => { names[id] = nom; });
  envF.concat(envH).forEach(id => { if (!names[id]) names[id] = id; });

  cache = {
    at: Date.now(),
    f: envF.length ? envF : DEFAUT.f.map(x => x[0]),
    h: envH.length ? envH : DEFAUT.h.map(x => x[0]),
    names,
    ecartees: [],
    source: (envF.length || envH.length) ? 'voix imposées par les variables' : 'voix françaises natives, liste fixe'
  };
  return cache;
}

// Conservé pour le diagnostic seulement.
async function detecter(key) {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache;

  const envF = (process.env.ELEVENLABS_VOICES_F || '').split(',').map(s => s.trim()).filter(Boolean);
  const envH = (process.env.ELEVENLABS_VOICES_H || '').split(',').map(s => s.trim()).filter(Boolean);
  if (envF.length || envH.length) {
    const names = {};
    envF.concat(envH).forEach(id => { names[id] = id; });
    cache = { at: Date.now(), f: envF, h: envH, names, ecartees: [], source: 'variables' };
    return cache;
  }

  try {
    const r = await fetch('https://api.elevenlabs.io/v1/voices?page_size=100', { headers: { 'xi-api-key': key } });
    if (!r.ok) throw new Error('voices ' + r.status);
    const data = await r.json();
    const list = Array.isArray(data.voices) ? data.voices : [];
    const toutesFr = list.filter(isFrench);
    const hexa = toutesFr.filter(isHexagonal);
    const fr = hexa.length ? hexa : toutesFr;
    const ecartees = toutesFr.filter(v => !isHexagonal(v)).map(v => v.name + ' (' + accentOf(v) + ')');
    const names = {};
    const f = [], h = [];
    for (const v of fr) {
      names[v.voice_id] = v.name + ' (' + accentOf(v) + ')';
      const g = genderOf(v);
      if (g === 'f') f.push(v.voice_id);
      else if (g === 'h') h.push(v.voice_id);
    }
    // voix françaises sans genre déclaré : on les répartit pour ne rien perdre
    for (const v of fr) {
      if (genderOf(v)) continue;
      (f.length <= h.length ? f : h).push(v.voice_id);
      names[v.voice_id] = v.name + ' (' + accentOf(v) + ', genre non déclaré)';
    }
    cache = {
      at: Date.now(),
      f, h, names, ecartees,
      source: !toutesFr.length
        ? 'aucune voix française dans la bibliothèque'
        : hexa.length ? 'voix françaises de France' : 'aucun accent de France, on garde les autres accents francophones'
    };
    return cache;
  } catch (e) {
    cache = { at: Date.now(), f: FALLBACK.f, h: FALLBACK.h, names: {}, ecartees: [], source: 'erreur /v1/voices : ' + (e && e.message) };
    return cache;
  }
}

// Calibrage par voix : certaines de la bibliothèque articulent mal à vitesse
// normale, d'autres traînent. Ajuste ici plutôt que globalement.
const CALIBRAGE = {
  fBpCO0Kf0krKLYGOu65w: { speed: 1.02, stability: 0.55 }, // Émilie
  YxrwjAKoUKULGd0g8K9Y: { speed: 1.04, stability: 0.55 }, // Lucie
  FFXYdAYPzn8Tw8KiHZqg: { speed: 1.06, stability: 0.60 }, // Ingrid, traîne un peu
  CYR0HqHoZAUmoZsLWPob: { speed: 1.00, stability: 0.55 }, // Marco
  IbbR6Av0dWuQJS0b8JVT: { speed: 1.02, stability: 0.55 }, // Hugo
  eOwAMwUJEGkP44SKOXIH: { speed: 1.04, stability: 0.58 }, // Julien
  '1EmYoP3UnnnwhlJKovEy': { speed: 0.98, stability: 0.62 }, // Anthony, articule vite
  Yklgus9Ssb2mlIsWUxMT: { speed: 1.00, stability: 0.58 }  // Mathieu
};

// Le ton se règle par les voice_settings : ElevenLabs ignore les consignes en texte.
function settingsFor(tone, voiceId) {
  const t = Array.isArray(tone) ? tone : [];
  const has = (k) => t.indexOf(k) !== -1;
  let stability = 0.45;
  let style = 0.25;

  if (has('épuisé') || has('laconique')) { stability = 0.75; style = 0.05; }
  if (has('analytique')) { stability = 0.70; style = 0.10; }
  if (has('méfiant')) { stability = 0.60; style = 0.20; }
  if (has('anxieux')) { stability = 0.50; style = 0.30; }
  if (has('pressé')) { stability = 0.35; style = 0.40; }
  if (has('dominant') || has('orgueilleux')) { stability = 0.40; style = 0.40; }
  if (has('blagueur') || has('chaleureux')) { stability = 0.40; style = 0.45; }

  // le débit : au-delà de 1.0 le modèle avale des syllabes
  let speed = 1.0;
  if (has('pressé')) speed = 1.08;
  if (has('épuisé')) speed = 0.95;

  const cal = CALIBRAGE[voiceId] || {};
  if (cal.speed) speed = Math.max(0.8, Math.min(1.2, speed * cal.speed));
  if (cal.stability) stability = Math.max(stability, cal.stability);

  return { stability: Math.min(0.85, stability + 0.12), similarity_boost: 0.9, style, speed, use_speaker_boost: true };
}

// Le numéro de téléphone : écrit en chiffres, ElevenLabs découpe mal les dizaines
// (93 lu "40 13"). On l'écrit donc en mots avant la synthèse. L'affichage n'est pas touché.
const UNITS = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix',
  'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf'];
const TENS = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante', 'soixante', 'quatre-vingt', 'quatre-vingt'];

function deuxChiffres(n) {
  if (n < 20) return UNITS[n];
  if (n < 70 || (n >= 80 && n < 90)) {
    const d = Math.floor(n / 10), u = n % 10;
    if (!u) return d === 8 ? 'quatre-vingts' : TENS[d];
    if (u === 1 && d !== 8) return TENS[d] + ' et un';
    return TENS[d] + '-' + UNITS[u];
  }
  // 70-79 et 90-99
  const base = n < 90 ? 'soixante' : 'quatre-vingt';
  const r = n - (n < 90 ? 60 : 80);
  return base + '-' + UNITS[r];
}

function ponctuer(s) {
  let t = String(s)
    // les points de suspension deviennent une virgule : ElevenLabs en fait
    // sinon un silence de fin de phrase, alors que c'est une hésitation
    .replace(/\u2026/g, ',')
    .replace(/\.{3,}/g, ',')
    .replace(/\.{2}/g, ',')
    .replace(/([!?]){2,}/g, '$1')
    .replace(/\s+([,.!?;:])/g, '$1')
    .replace(/([,;:])(?=\S)/g, '$1 ')
    .replace(/,\s*,+/g, ',')
    .replace(/,\s*([.!?])/g, '$1')
    .replace(/^[\s,;:.]+/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (t && !/[.!?]$/.test(t)) t += '.';
  return t;
}

function lireNumeros(text) {
  // rires écrits : "ha ha", "haha", "hihi" sont lus lettre à lettre, on les retire.
  // Puis on ponctue : sans point final la voix ne redescend pas, et les points de
  // suspension ou les doubles ponctuations font avaler les fins de mots.
  const sansRire = String(text)
    .replace(/\b(?:a?ha)(?:\s*-?\s*ha)+h?\b/gi, '')
    .replace(/\b(?:hi){2,}\b/gi, '')
    .replace(/\b(?:h[ée]){2,}\b/gi, '')
    .replace(/\bmdr\b|\blol\b/gi, '');
  return ponctuer(sansRire).replace(/\b0\s*[1-9](?:[\s.\-]*\d{2}){4}\b/g, (m) => {
    const d = m.replace(/\D/g, '');
    if (d.length !== 10) return m;
    const groupes = [d.slice(0, 2), d.slice(2, 4), d.slice(4, 6), d.slice(6, 8), d.slice(8, 10)];
    return groupes
      .map((g, i) => (i === 0 ? 'zéro ' + UNITS[Number(g[1])] : deuxChiffres(Number(g))))
      .join(', ');
  });
}

// Synthèse : renvoie le flux audio dès les premiers octets.
async function synth(key, { text, genre, voiceIndex, tone, voiceId }, res) {
  const voices = await loadVoices(key);
  const pool = genre === 'h' ? voices.h : voices.f;
  if (!voiceId && !pool.length) {
    return res.status(503).json({
      error: (genre === 'h' ? 'Aucune voix masculine' : 'Aucune voix féminine')
        + ' française dans ta bibliothèque ElevenLabs (' + voices.source + '). Ouvre /api/tts?list=1.'
    });
  }
  const idx = Number.isFinite(voiceIndex) ? Math.abs(Math.trunc(voiceIndex)) : 0;
  const id = voiceId || pool[idx % pool.length];
  const model = process.env.ELEVENLABS_MODEL || 'eleven_multilingual_v2';

  const url = 'https://api.elevenlabs.io/v1/text-to-speech/' + id + '/stream'
    + '?output_format=mp3_44100_128&optimize_streaming_latency=3';

  const r = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'xi-api-key': key },
    body: JSON.stringify({ text: lireNumeros(text), model_id: model, language_code: 'fr', voice_settings: settingsFor(tone, id) })
  });

  if (!r.ok) {
    const detail = (await r.text()).slice(0, 300);
    return res.status(r.status).json({ error: detail || 'Erreur ElevenLabs' });
  }

  res.setHeader('Content-Type', 'audio/mpeg');
  res.setHeader('Cache-Control', 'no-store');
  // qui parle, pour pouvoir diagnostiquer un accent inattendu
  res.setHeader('X-Voice', encodeURIComponent(voices.names[id] || id));

  // on relaie le flux au navigateur au fur et à mesure
  const reader = r.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    res.write(Buffer.from(value));
  }
  return res.end();
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();

  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return res.status(500).json({ error: 'ELEVENLABS_API_KEY manquante côté serveur' });

  // Lecture directe en GET : le navigateur streame l'audio, la voix démarre plus vite.
  if (req.method === 'GET' && req.query && req.query.text) {
    if (process.env.ACCESS_CODE && req.query.code !== process.env.ACCESS_CODE) {
      return res.status(401).json({ error: 'Code d\'accès invalide' });
    }
    try {
      return await synth(key, {
        text: String(req.query.text).slice(0, 1500),
        genre: req.query.genre === 'h' ? 'h' : 'f',
        voiceIndex: Number(req.query.i),
        tone: String(req.query.tone || '').split(',').filter(Boolean)
      }, res);
    } catch (e) {
      return res.status(502).json({ error: 'ElevenLabs injoignable : ' + (e && e.message) });
    }
  }

  // Diagnostic : /api/tts?list=1
  if (req.method === 'GET') {
    cache = null;
    const v = await loadVoices(key);
    let toutes = [];
    try {
      const r = await fetch('https://api.elevenlabs.io/v1/voices?page_size=100', { headers: { 'xi-api-key': key } });
      const d = await r.json();
      toutes = (d.voices || []).map(x => ({
        id: x.voice_id,
        nom: x.name,
        genre: (x.labels && x.labels.gender) || '?',
        accent: (x.labels && x.labels.accent) || '?',
        langue: (x.labels && x.labels.language) || '?',
        usage: (x.labels && x.labels.use_case) || '?'
      }));
    } catch (e) {}
    return res.status(200).json({
      mode: v.source === 'variables' ? 'voix imposées par ELEVENLABS_VOICES_F / _H' : 'détection automatique',
      source: v.source,
      modele: process.env.ELEVENLABS_MODEL || 'eleven_multilingual_v2',
      utilisees_femmes: v.f.map(id => ({ id, nom: v.names[id] || id })),
      utilisees_hommes: v.h.map(id => ({ id, nom: v.names[id] || id })),
      ecartees_accent_non_hexagonal: v.ecartees || [],
      TOUTE_MA_BIBLIOTHEQUE: toutes
    });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  body = body || {};

  if (process.env.ACCESS_CODE && body.accessCode !== process.env.ACCESS_CODE) {
    return res.status(401).json({ error: 'Code d\'accès invalide' });
  }

  const text = String(body.text || '').slice(0, 1500);
  if (!text.trim()) return res.status(400).json({ error: 'text requis' });

  try {
    return await synth(key, {
      text,
      genre: body.genre === 'h' ? 'h' : 'f',
      voiceIndex: body.voiceIndex,
      tone: body.tone,
      voiceId: body.voiceId
    }, res);
  } catch (e) {
    return res.status(502).json({ error: 'ElevenLabs injoignable : ' + (e && e.message) });
  }
}
