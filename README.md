# Simulateur d'appel découverte : mise en production (GitHub + Vercel)

Rien à installer.

```
index.html                 la page (styles, logique, polices, logo)
assets/prospects/*.jpg     les portraits des prospects
api/claude.mjs             la fonction serverless qui parle à l'API Anthropic
package.json               déclare le projet en module ES (nécessaire à Vercel)
```

## 1. Le dépôt

Crée un dépôt GitHub et pousse le tout **en gardant l'arborescence**. `api/claude.mjs` doit rester dans un dossier `api/` à la racine, c'est ce qui crée la route `/api/claude`. Et `assets/prospects/` doit rester à côté de `index.html`, sinon les portraits ne s'affichent pas (l'outil retombe sur les initiales, sans casser l'appel).

## 2. Vercel

1. vercel.com → *Add New… → Project* → importe le dépôt.
2. Framework Preset : **Other**. Pas de build command, pas d'output directory.
3. *Settings → Environment Variables* :
   - `ANTHROPIC_API_KEY` = ta clé (console.anthropic.com → API keys)
   - `ACCESS_CODE` = *(optionnel)* un mot de passe partagé, voir plus bas
4. Deploy. La page est en ligne, le simulateur fonctionne.

Chaque `git push` redéploie automatiquement.

## 3. Coût et garde-fous

Chaque réplique du prospect = un appel Haiku (quelques centimes pour 100 appels). Le débrief final utilise Sonnet, plus cher, mais une seule fois par simulation.

**Sans protection, n'importe qui qui trouve l'URL consomme ta clé.** Trois options, par ordre d'effort :

- **Code d'accès dans le lien.** Définis `ACCESS_CODE` dans Vercel, puis diffuse l'URL sous la forme
  `https://ton-projet.vercel.app/?code=TON_CODE`.
  La page lit le code dans l'adresse et le transmet à la fonction ; sans lui, l'API refuse. Aucun fichier à modifier. Ça bloque les robots et les curieux, pas quelqu'un qui partage ton lien — suffisant pour une diffusion privée à tes clients.
- **Vercel Deployment Protection** (Settings → Deployment Protection) : mot de passe sur tout le site, plan Pro.
- **Vrais comptes** (Clerk, Supabase Auth) si tu vends l'accès à l'outil.

Mets aussi une **limite de dépense mensuelle** dans la console Anthropic (Settings → Limits).

## 4. Ce que tes clients doivent savoir

- **Chrome ou Edge** pour le mode vocal. Safari et Firefox ne gèrent pas la reconnaissance vocale du navigateur : ils basculent automatiquement en mode écrit.
- Il faut **autoriser le micro** à la première utilisation.
- Vocal : on maintient le bouton micro (ou la barre d'espace), on parle, on relâche — la réplique part.
- La voix du prospect est celle du navigateur (synthèse locale). Pour une voix vraiment naturelle il faut brancher un service neuronal (ElevenLabs, OpenAI TTS, Azure) : même principe, un appel de plus dans `api/`.

## 5. Modifier le contenu

Les profils de prospects (métiers, tempéraments, objections, contextes), les 3 niveaux de challenge et les critères de notation vivent dans le code de l'application. `index.html` est un fichier compilé : pour changer ces listes, demande-moi la modification et je te régénère le fichier — c'est plus sûr qu'une édition à la main dans 2,7 Mo de bundle.
