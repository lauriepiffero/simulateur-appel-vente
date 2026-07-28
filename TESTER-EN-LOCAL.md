# Tester avec le micro avant de diffuser

Le micro du navigateur n'est autorisé que sur **https** ou sur **localhost**. C'est pour ça qu'il ne marche ni dans l'aperçu intégré, ni en ouvrant le fichier en double-clic (`file:///…`). Deux façons de tester pour de vrai.

## Le plus rapide : déployer, puis tester

Déployer sur Vercel ne rend pas l'outil public pour autant :

1. Pousse le dossier sur GitHub, importe-le dans Vercel, ajoute `ANTHROPIC_API_KEY` (voir README).
2. Ajoute aussi `ACCESS_CODE` avec un code à toi.
3. Ouvre `https://ton-projet.vercel.app/?code=TON_CODE` dans **Chrome**.

Le micro fonctionne (c'est de l'https), l'IA répond, et sans le code personne ne peut consommer ta clé. Tu ne communiques l'URL à tes clients que quand tu es satisfait. Tu peux aussi tester sur une *Preview* (une branche autre que `main`) : même chose, URL différente.

## En local, sur ta machine

Il faut Node.js installé (nodejs.org, version LTS).

```bash
cd deploy
npm i -g vercel                 # une seule fois
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env.local
vercel dev
```

Puis ouvre **http://localhost:3000 dans Chrome** (localhost est considéré comme sécurisé : le micro est autorisé).

À la première utilisation Chrome demande l'accès au micro → *Autoriser*. Si tu as refusé par erreur : clique sur l'icône à gauche de l'adresse → Micro → Autoriser, puis recharge.

## Rappels

- **Chrome ou Edge** obligatoire pour le vocal. Safari et Firefox n'ont pas la reconnaissance vocale du navigateur et basculent en mode écrit.
- Vocal : maintiens le bouton micro **ou la barre d'espace**, parle, relâche — ta réplique part toute seule.
- Casque recommandé : sans casque, la voix du prospect sortant du haut-parleur peut être réentendue par le micro.
- Le mode écrit, lui, marche partout — y compris dans l'aperçu intégré — pour tester le contenu, les niveaux et le débrief sans micro.
