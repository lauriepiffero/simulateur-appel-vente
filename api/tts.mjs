// Vercel Serverless Function — voix du prospect, ElevenLabs.
//
// Variable requise : ELEVENLABS_API_KEY
// Optionnelles : ACCESS_CODE (même code que /api/claude)
//                ELEVENLABS_MODEL (par défaut eleven_multilingual_v2)
//                ELEVENLABS_VOICES_F / ELEVENLABS_VOICES_H
//                  (identifiants séparés par des virgules, pour forcer tes propres voix)
//
// Les voix sont choisies parmi les voix NATIVES FRANÇAISES de ta bibliothèque,
// récupérées via /v1/voices : une voix anglophone lisant du français garde son accent.
//
// Diagnostic : ouvre /api/tts?list=1 sur ton site pour voir les voix détectées.

const FALLBACK = {
  f: ['XB0fDUnXU5powFXDhCwa'], // Charlotte, anglophone : dernier recours
  h: ['IKne3meq5aSn9XLyUdCD']  // Charlie, idem
};

let cache = null;        // { at: timestamp, f: [ids], h: [ids], names: {...} }
const CACHE_MS = 10 * 60 * 1000;

function isFrench(v) {
  const lab = v.labels || {};
  const hay = [
    v.name, v.description, lab.language, lab.accent, lab.descriptive, lab.use_case
  ].filter(Boolean).join(' ').toLowerCase();
  if (/\b(fr|fr-fr|french|français|francais|française|francaise)\b/.test(hay)) return true;
  if (Array.isArray(v.verified_languages)) {
    if (v.verified_languages.some(l => /^fr/i.test(l.language || l.locale || ''))) return true;
  }
  return false;
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
  if (envF.length || envH.length) {
    cache = { at: Date.now(), f: envF.length ? envF : FALLBACK.f, h: envH.length ? envH : FALLBACK.h, names: {}, source: 'variables' };
    return cache;
  }

  try {
    const r = await fetch('https://api.elevenlabs.io/v1/voices?page_size=100', { headers: { 'xi-api-key': key } });
    if (!r.ok) throw new Error('voices ' + r.status);
    const data = await r.json();
    const list = Array.isArray(data.voices) ? data.voices : [];
    const fr = list.filter(isFrench);
    const names = {};
    const f = [], h = [];
    for (const v of fr) {
      names[v.voice_id] = v.name + (v.labels && v.labels.accent ? ' (' + v.labels.accent + ')' : '');
      const g = genderOf(v);
      if (g === 'f') f.push(v.voice_id);
      else if (g === 'h') h.push(v.voice_id);
    }
    // voix françaises sans genre déclaré : on les répartit pour ne rien perdre
    for (const v of fr) {
      if (genderOf(v)) continue;
      (f.length <= h.length ? f : h).push(v.voice_id);
      names[v.voice_id] = v.name + ' (genre non déclaré)';
    }
    cache = {
      at: Date.now(),
      f: f.length ? f : FALLBACK.f,
      h: h.length ? h : FALLBACK.h,
      names,
      source: fr.length ? 'bibliothèque française' : 'aucune voix française trouvée, repli anglophone'
    };
    return cache;
  } catch (e) {
    cache = { at: Date.now(), f: FALLBACK.f, h: FALLBACK.h, names: {}, source: 'erreur /v1/voices : ' + (e && e.message) };
    return cache;
  }
}

// Le ton se règle par les voice_settings : ElevenLabs ignore les consignes en texte.
function settingsFor(tone) {
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

  return { stability, similarity_boost: 0.85, style, use_speaker_boost: true };
}

// Synthèse : renvoie le flux audio dès les premiers octets.
async function synth(key, { text, genre, voiceIndex, tone, voiceId }, res) {
  const voices = await loadVoices(key);
  const pool = genre === 'h' ? voices.h : voices.f;
  const idx = Number.isFinite(voiceIndex) ? Math.abs(Math.trunc(voiceIndex)) : 0;
  const id = voiceId || pool[idx % pool.length];
  const model = process.env.ELEVENLABS_MODEL || 'eleven_turbo_v2_5';

  const url = 'https://api.elevenlabs.io/v1/text-to-speech/' + id + '/stream'
    + '?output_format=mp3_44100_128&optimize_streaming_latency=3';

  const r = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'xi-api-key': key },
    body: JSON.stringify({ text, model_id: model, language_code: 'fr', voice_settings: settingsFor(tone) })
  });

  if (!r.ok) {
    const detail = (await r.text()).slice(0, 300);
    return res.status(r.status).json({ error: detail || 'Erreur ElevenLabs' });
  }

  res.setHeader('Content-Type', 'audio/mpeg');
  res.setHeader('Cache-Control', 'no-store');

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
    return res.status(200).json({
      source: v.source,
      modele: process.env.ELEVENLABS_MODEL || 'eleven_multilingual_v2',
      femmes: v.f.map(id => ({ id, nom: v.names[id] || id })),
      hommes: v.h.map(id => ({ id, nom: v.names[id] || id }))
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
