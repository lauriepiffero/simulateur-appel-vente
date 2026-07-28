// Vercel Serverless Function — proxy vers l'API Anthropic.
// La clé reste côté serveur : elle n'est jamais exposée au navigateur.
// Variable d'environnement requise dans Vercel : ANTHROPIC_API_KEY
// Optionnel : ACCESS_CODE (si défini, le client doit envoyer le même code)

const ALLOWED_MODELS = [
  'claude-haiku-4-5',
  'claude-sonnet-4-5'
];

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(500).json({ error: 'ANTHROPIC_API_KEY manquante côté serveur' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  body = body || {};

  if (process.env.ACCESS_CODE && body.accessCode !== process.env.ACCESS_CODE) {
    return res.status(401).json({ error: 'Code d\'accès invalide' });
  }

  const messages = Array.isArray(body.messages) ? body.messages : [];
  if (!messages.length) return res.status(400).json({ error: 'messages requis' });

  const model = ALLOWED_MODELS.includes(body.model) ? body.model : 'claude-haiku-4-5';
  const max_tokens = Math.min(Number(body.max_tokens) || 600, 4000);

  const payload = { model, max_tokens, messages };
  if (body.system) payload.system = String(body.system);

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(payload)
    });

    const data = await r.json();
    if (!r.ok) {
      return res.status(r.status).json({ error: (data && data.error && data.error.message) || 'Erreur API' });
    }
    const text = (data.content || [])
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('')
      .trim();
    return res.status(200).json({ text });
  } catch (e) {
    return res.status(502).json({ error: 'Appel API impossible : ' + (e && e.message) });
  }
}
