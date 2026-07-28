// Vercel Serverless Function — voix du prospect.
//
// Deux fournisseurs, par ordre de priorité :
//   1. ElevenLabs, si ELEVENLABS_API_KEY est définie (le plus naturel)
//   2. OpenAI TTS, si OPENAI_API_KEY est définie (moins cher)
// Si aucune clé n'est là, la page retombe sur la voix du navigateur.
//
// Optionnel : ACCESS_CODE (même code que /api/claude)
//             ELEVENLABS_MODEL (par défaut eleven_multilingual_v2)

const OPENAI_VOICES = ['alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'nova', 'onyx', 'sage', 'shimmer'];

// Voix ElevenLabs de la bibliothèque par défaut, correctes en français.
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

function elevenVoiceFor(openaiVoice, genre) {
  const pool = EL_VOICES[genre === 'h' ? 'h' : 'f'];
  const i = Math.max(0, OPENAI_VOICES.indexOf(openaiVoice));
  return pool[i % pool.length];
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  body = body || {};

  if (process.env.ACCESS_CODE && body.accessCode !== process.env.ACCESS_CODE) {
    return res.status(401).json({ error: 'Code d\'accès invalide' });
  }

  const text = String(body.text || '').slice(0, 1200);
  if (!text.trim()) return res.status(400).json({ error: 'text requis' });

  const genre = body.genre === 'h' ? 'h' : 'f';
  const openaiVoice = OPENAI_VOICES.includes(body.voice) ? body.voice : 'coral';
  const instructions = String(body.instructions || 'Parle en français, ton naturel de conversation téléphonique.').slice(0, 600);

  const elKey = process.env.ELEVENLABS_API_KEY;
  const oaKey = process.env.OPENAI_API_KEY;

  const send = (buf) => {
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(buf);
  };

  // 1. ElevenLabs
  if (elKey) {
    try {
      const voiceId = body.elevenVoiceId || elevenVoiceFor(openaiVoice, genre);
      const model = process.env.ELEVENLABS_MODEL || 'eleven_multilingual_v2';
      const r = await fetch('https://api.elevenlabs.io/v1/text-to-speech/' + voiceId + '?output_format=mp3_44100_128', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'xi-api-key': elKey },
        body: JSON.stringify({
          text,
          model_id: model,
          voice_settings: { stability: 0.4, similarity_boost: 0.75, style: 0.35, use_speaker_boost: true }
        })
      });
      if (r.ok) return send(Buffer.from(await r.arrayBuffer()));
      const detail = (await r.text()).slice(0, 300);
      if (!oaKey) return res.status(r.status).json({ error: 'ElevenLabs : ' + detail });
      // sinon on tente OpenAI en secours
    } catch (e) {
      if (!oaKey) return res.status(502).json({ error: 'ElevenLabs injoignable : ' + (e && e.message) });
    }
  }

  // 2. OpenAI
  if (oaKey) {
    try {
      const r = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer ' + oaKey },
        body: JSON.stringify({ model: 'gpt-4o-mini-tts', voice: openaiVoice, input: text, instructions, response_format: 'mp3' })
      });
      if (r.ok) return send(Buffer.from(await r.arrayBuffer()));
      const detail = (await r.text()).slice(0, 300);
      return res.status(r.status).json({ error: 'OpenAI : ' + detail });
    } catch (e) {
      return res.status(502).json({ error: 'OpenAI injoignable : ' + (e && e.message) });
    }
  }

  return res.status(500).json({ error: 'Aucune clé de synthèse vocale configurée' });
}
