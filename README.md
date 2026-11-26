# MonApp — Phase 2 (serveur sur ton PC)

- **Appli** (React + Vite) : `.exe` Windows (Electron) et `.apk` Android (Capacitor), compilés par GitHub Actions.
- **Serveur** (dossier `serveur/`) : Node.js sans dépendances, à lancer sur ton PC (comme un serveur Minecraft).

## Ce qui marche
Comptes en ligne (pseudo + mot de passe, code d'inscription), profil, statuts, serveurs, salons, codes d'invitation, rôles (propriétaire / admin / membre), exclusion de membres, liste des membres en ligne.
Les messages arrivent à la Phase 3.

## Lancer le serveur
Voir `serveur/LISEZMOI.txt` : installe Node.js (LTS), puis double-clique sur `serveur/lancer-serveur.bat`.

## Compiler l'appli
Onglet **Actions** de GitHub → **Build Windows (.exe)** / **Build Android (.apk)** → **Run workflow**.
