# Appli Android d'Auplio Investment

Enveloppe Android (WebView) autour des mêmes fichiers que la version web : `index.html`, `app.js`,
`bank.js`, `styles.css`. Ils sont rangés dans l'APK, donc l'appli fonctionne hors ligne et les
données restent dans le stockage privé de l'appli (effacées seulement si on la désinstalle).

- **Fabrication** : GitHub Actions, dans le dépôt privé `Auplio`, branche `investment`
  (workflow `investment-android.yml`). Il récupère ce dépôt, ajoute la clé de signature et publie
  l'APK dans les Releases du dépôt `Auplio` (versions `investment-android-N`).
- **Clé de signature** : jamais dans ce dépôt public. Elle est dans le dépôt privé `Auplio`, branche
  `investment`, dossier `signing/`. Sans elle, une mise à jour exigerait de désinstaller l'appli.
- **Pont JavaScript** `AuplioAndroid` : `share()` (envoi du fichier de partage), `save()` (exports
  dans Téléchargements/Auplio Investment), `version()`.
- Pour publier une nouvelle version après une modification ici : pousser un commit sur la branche
  `investment` du dépôt `Auplio` (ou relancer le workflow).
