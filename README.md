# MonApp — Phase 1 (version locale, 100 % GitHub)

Une seule base de code (React + Vite) :
- **Windows .exe** via Electron
- **Android .apk** via Capacitor
- Compilation automatique par **GitHub Actions** (rien à installer sur ton PC).

## Ce qui marche
Compte avec pseudo + mot de passe (sans e-mail), profil (avatar, pseudo stylé, bio), statuts (en ligne / inactif / ne pas déranger / invisible).

⚠️ Les comptes sont enregistrés **sur l'appareil** : pas de synchronisation, pas de récupération de mot de passe, et personne d'autre ne peut se connecter. Les messages entre utilisateurs et le vocal demanderont un serveur (phases suivantes).

## Compiler
1. Envoie tout le contenu de ce dossier (y compris `.github`) dans un dépôt GitHub.
2. Onglet **Actions** → **Build Windows (.exe)** → **Run workflow**. Pareil pour **Build Android (.apk)**.
3. Quand c'est fini (coche verte), clique sur l'exécution, puis télécharge le fichier dans **Artifacts**.
