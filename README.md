# MonApp — Phase 4 (vocal)

- **Appli** (React + Vite) : `.exe` Windows (Electron) et `.apk` Android (Capacitor), compilés par GitHub Actions.
- **Serveur** (dossier `serveur/`) : Node.js sans dépendances, à lancer sur ton PC (comme un serveur Minecraft).

## Ce qui marche
Comptes en ligne (pseudo + mot de passe, code d'inscription), profil, statuts, serveurs, salons, codes d'invitation, rôles (propriétaire / admin / membre), exclusion de membres, liste des membres en ligne.
Messages en temps réel, images, réactions emoji, suppression de messages (les siens, ou ceux des autres pour les admins).

## Lancer le serveur
Voir `serveur/LISEZMOI.txt` : installe Node.js (LTS), puis double-clique sur `serveur/lancer-serveur.bat`.

## Compiler l'appli
Onglet **Actions** de GitHub → **Build Windows (.exe)** / **Build Android (.apk)** → **Run workflow**.

## Vocal (Phase 4)
Salons vocaux (🔊) : micro, sourdine, caméra, indicateur « qui parle », jusqu'à 8 personnes par salon.
La voix passe directement entre les joueurs (WebRTC), le serveur ne fait que les mettre en relation.
Si certains amis n'arrivent pas à s'entendre (réseau très restrictif), ajoute un serveur TURN dans `serveur/data/config.json` :
`"turn": { "urls": "turn:mon-serveur:3478", "username": "...", "credential": "..." }`
