// Vercel Serverless Function — voix du prospect, ElevenLabs uniquement.
//
// Variable requise : ELEVENLABS_API_KEY
// Optionnelles : ACCESS_CODE (même code que /api/claude)
//                ELEVENLABS_MODEL (par défaut eleven_multilingual_v2)

// Voix de la bibliothèque par défaut, les plus crédibles en français.
const EL_VOICES = {
  f: [
    'XB0fDUnXU5powFXDhCwa', // Charlotte
    '21m00Tcm4TlvDq8ikWAM', // Rachel
    'pFZP5JQG7iQjIQuC4Bku', // Lily
    'EXAVITQu4vr4xnSDxMaL'  // Sarah
  ],
  h: [
    'IKne3meq5aSn9XLyUdCD', // Charlie
    'ErXwobaYiN019PkySvjV', // Antoni
    'pNInz6obpgDQGcFmaJgB', // Adam
    'TxGEqnHWrfWFTfGW9XjX'  // Josh
  ]
};

function voiceFor(genre, index) {
  const pool = EL_VOICES[genre === 'h' ? 'h' : 'f'];
  const i = Number.isFinite(index) ? Math.abs(Math.trunc(index)) : 0;
  return pool[i % pool.length];
}

// Le ton se règle par les voice_settings : ElevenLabs ignore les consignes en texte.
function settingsFor(tone) {
  const t = Array.isArray(tone) ? tone : [];
  const has = (k) => t.indexOf(k) !== -1;
  let stability = 0.45;   // bas = plus de variation expressive
  let style = 0.30;       // haut = plus de caractère
  const similarity = 0.8;

  if (has('épuisé') || has('laconique')) { stability = 0.75; style = 0.10; }
  if (has('analytique')) { stability = 0.70; style = 0.15; }
  if (has('méfiant')) { stability = 0.60; style = 0.25; }
  if (has('anxieux')) { stability = 0.50; style = 0.40; }
  if (has('pressé')) { stability = 0.35; style = 0.45; }
  if (has('dominant') || has('orgueilleux')) { stability = 0.40; style = 0.45; }
  if (has('blagueur') || has('chaleureux')) { stability = 0.40; style = 0.50; }

  return { stability, similarity_boost: similarity, style, use_speaker_boost: true };
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return res.status(500).json({ error: 'ELEVENLABS_API_KEY manquante côté serveur' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  body = body || {};

  if (process.env.ACCESS_CODE && body.accessCode !== process.env.ACCESS_CODE) {
    return res.status(401).json({ error: 'Code d\'accès invalide' });
  }

  const text = String(body.text || '').slice(0, 1500);
  if (!text.trim()) return res.status(400).json({ error: 'text requis' });

  const voiceId = body.voiceId || voiceFor(body.genre, body.voiceIndex);
  const model = process.env.ELEVENLABS_MODEL || 'eleven_multilingual_v2';

  try {
    const r = await fetch('https://api.elevenlabs.io/v1/text-to-speech/' + voiceId + '?output_format=mp3_44100_128', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'xi-api-key': key },
      body: JSON.stringify({ text, model_id: model, voice_settings: settingsFor(body.tone) })
    });

    if (!r.ok) {
      const detail = (await r.text()).slice(0, 300);
      return res.status(r.status).json({ error: detail || 'Erreur ElevenLabs' });
    }

    const buf = Buffer.from(await r.arrayBuffer());
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(buf);
  } catch (e) {
    return res.status(502).json({ error: 'ElevenLabs injoignable : ' + (e && e.message) });
  }
}
