# MonApp — Phase 7

- **Appli** (React + Vite) : `.exe` Windows (Electron) et `.apk` Android (Capacitor), compilés par GitHub Actions.
- **Serveur** (dossier `serveur/`) : Node.js sans dépendances, à lancer sur ton PC (comme un serveur Minecraft).

## Nouveautés Phase 7
- **Collection de jeux** sur ton profil (statut, plateforme, heures, note, favoris, visible ou privée) + badge Gamer.
- **Connexion avec Google** (facultative) : voir `serveur/LISEZMOI.txt`. Marche seulement via localhost ou une adresse https.

## Nouveautés Phase 6
- **Pièces 🪙** : récompense quotidienne (50, jusqu'à 100 avec une série), quêtes du jour (3 par jour), bonus de badges.
- **Quêtes** : messages, réactions, images, clips, vocal à plusieurs (pas en sourdine), partage d'écran. Tout est compté par le serveur.
- **Badges** : 8 badges automatiques, visibles sur le profil.
- **Boutique** : cadres d'avatar, effets de bannière, effets de pseudo (animés) et titres. Page « 🪙 Boutique » depuis ta carte en bas à gauche.

## Nouveautés Phase 5
- **Rôles** illimités (50) avec couleur, hiérarchie (↑/↓) et 20 permissions ; permissions de base « @everyone » ; propriétaire / administrateur.
- **Paramètres du serveur** (⚙) : nom, icône, description, code d'invitation, transfert de propriété, salons (sujet, mode lent, lecture seule), bannis, soundboard.
- **Mode Communauté** : règlement à accepter, message d'accueil, serveur public visible dans « Découvrir ».
- **Pseudos libres** : n'importe quels caractères (emojis, accents, symboles…), sauf invisibles/de contrôle. Surnoms par serveur.
- **Profil** : bannière, pronoms, lieu, statut personnalisé, 5 liens + réglages d'apparence, audio/vidéo, qualité du partage d'écran.
- **Vocal** : partage d'écran (jusqu'à 1080p120, ordinateur), soundboard, clips (60 s max, envoyés dans un salon texte).

## Lancer le serveur
Voir `serveur/LISEZMOI.txt`. Mise à jour : remplace seulement les fichiers, **jamais** le dossier `serveur/data`.

## Compiler l'appli
Onglet **Actions** de GitHub → **Build Windows (.exe)** / **Build Android (.apk)** → **Run workflow**.

## Limites connues
- 120 images/s dépend du PC et du débit montant (chaque spectateur reçoit son flux).
- Partage d'écran impossible depuis le téléphone (on peut regarder). Les clips sont manuels (démarrer/arrêter).
- Réseau très restrictif : ajoute un serveur TURN dans `serveur/data/config.json` : `"turn": { "urls": "turn:...", "username": "...", "credential": "..." }`
