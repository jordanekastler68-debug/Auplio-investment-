# NestGoal sur Android

Enveloppe Android (WebView) autour des mêmes fichiers que la version web : `index.html`, `css/`, `js/`,
`fonts/`, `icons/`. Ils sont rangés dans l'APK : l'appli fonctionne sans connexion et les données restent
dans le stockage privé de l'appli (effacées seulement si on la désinstalle : pensez à la sauvegarde).

- **Identifiant Android** : `fr.auplio.investment`, conservé de l'ancienne appli (invisible à l'écran).
  NestGoal s'installe donc par-dessus, en simple mise à jour. Code Kotlin : paquet `fr.nestgoal`.
- **Fabrication** : GitHub Actions, dans le dépôt privé `Auplio`, branche `investment`. Le workflow
  récupère ce dépôt, ajoute la clé de signature et publie l'APK dans les Releases du dépôt `Auplio`.
  Il copie dans l'APK : `index.html`, `manifest.webmanifest`, `css/`, `js/`, `fonts/`, `icons/`
  (voir `copyWww` dans `app/build.gradle.kts`).
- **Clé de signature** : jamais dans ce dépôt public. Elle est dans le dépôt privé `Auplio`, branche
  `investment`, dossier `signing/`. Sans elle, une mise à jour exigerait de désinstaller l'appli.
- **Icône et écran de démarrage** : générés depuis `icons/logo.svg` par `node tools/make-icons.js`.
- **Pont JavaScript** `NestGoalAndroid` : `save()` (sauvegarde dans Téléchargements/NestGoal),
  `setDark()` (barres du système accordées au thème), `version()`.
- Pour publier une nouvelle version après une modification ici : pousser un commit sur la branche
  `investment` du dépôt `Auplio` (ou relancer le workflow à la main).
