# Auplio Investment

Tableau de bord du couple pour **acheter une maison** : chacun note ses dépenses sur son téléphone, saisit
son net payé chaque mois, et les deux voient le même tableau de bord.

## Écrans (v0.5)
- **Tableau de bord** : date d'achat possible de la maison (apport, effort du mois réparti entre les deux,
  bouton « C'est fait »), mensualité et endettement (35 % max), colonnes Jordane / Iris (salaire, charges,
  dépenses, reste), total du foyer, **charges du mois** (loyer, eau, électricité, internet, assurances,
  crédits…, ramenées au mois si facturées tous les 2/3/6/12 mois), où part l'argent à deux.
- **Ajouter** : montant, catégorie, ajouter (3 touches), au nom de la personne du téléphone.
- **Historique** : dépenses du mois, filtre par personne, fiches de paie du mois.
- **Réglages** (roue dentée) : synchro, maison, charges, foyer, catégories, relevé CSV, sauvegarde.

## Synchronisation
Dépôt GitHub **privé** (ex. `auplio-foyer`), un fichier par personne (`foyer/a.json`, `foyer/b.json`) :
chaque téléphone n'écrit que le sien, aucun conflit. Fusion : dépenses unies par identifiant, suppressions
propagées, salaire de chacun pris sur son propre téléphone, réglages = version modifiée le plus récemment.
Le second téléphone se configure avec un **code d'invitation** (Réglages → Envoyer le code d'invitation).

## Installation
- **Android** : APK publiée dans les Releases du dépôt privé `Auplio` (`investment-android-N`).
- **iPhone** : Safari → https://jordanekastler68-debug.github.io/Auplio-investment-/ → Partager → « Sur l'écran d'accueil ».

## Développement
`python3 -m http.server 8080` puis http://localhost:8080. Incrémenter `VERSION` dans `sw.js` à chaque mise en ligne.
