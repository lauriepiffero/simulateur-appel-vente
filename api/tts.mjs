// Vercel Serverless Function — synthèse vocale neuronale via OpenAI.
// Variable d'environnement requise : OPENAI_API_KEY
// Optionnel : ACCESS_CODE (même code que pour /api/claude)

const VOICES = ['alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'nova', 'onyx', 'sage', 'shimmer'];

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const key = process.env.OPENAI_API_KEY;
  if (!key) return res.status(500).json({ error: 'OPENAI_API_KEY manquante côté serveur' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  body = body || {};

  if (process.env.ACCESS_CODE && body.accessCode !== process.env.ACCESS_CODE) {
    return res.status(401).json({ error: 'Code d\'accès invalide' });
  }

  const text = String(body.text || '').slice(0, 1200);
  if (!text.trim()) return res.status(400).json({ error: 'text requis' });

  const voice = VOICES.includes(body.voice) ? body.voice : 'coral';
  const instructions = String(body.instructions || 'Parle en français, ton naturel de conversation téléphonique, débit posé, pas de ton commercial.').slice(0, 600);

  try {
    const r = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key },
      body: JSON.stringify({
        model: 'gpt-4o-mini-tts',
        voice,
        input: text,
        instructions,
        response_format: 'mp3'
      })
    });

    if (!r.ok) {
      const t = await r.text();
      return res.status(r.status).json({ error: t.slice(0, 300) });
    }

    const buf = Buffer.from(await r.arrayBuffer());
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(buf);
  } catch (e) {
    return res.status(502).json({ error: 'Appel TTS impossible : ' + (e && e.message) });
  }
}
