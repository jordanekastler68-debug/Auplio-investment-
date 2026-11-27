# NestGoal

Appli Android pour un couple, qui répond à une seule question : **quand est-ce qu'on achète notre maison ?**

Les données restent sur le téléphone (aucun serveur, aucun compte). Interface web (HTML, CSS, JavaScript
sans dépendance) empaquetée dans une appli Android (WebView, voir `android/LISEZMOI.md`).

## Écrans
- **Démarrage** (une seule fois) : prénoms, salaires nets avant impôt sur le revenu et jours de paie,
  maison visée, charges fixes, crédits en cours.
- **Accueil** : rappels, date d'achat avec la jauge du logo, épargne du mois, une colonne par personne.
- **Mois** : où part l'argent, salaires et charges du mois, dépenses par jour, filtres.
- **Projet** : date d'achat, apport, crédit possible, « et si… ? », réglages du crédit.
- **Bouton +** : une dépense en 3 gestes (montant, catégorie, valider).
- **Réglages** (icône profil) : le couple, charges fixes, crédits, catégories, thème, sauvegarde.

## Règles de calcul (`js/calc.js`)
- Mensualité maximale = 35 % des revenus nets avant impôt du couple, assurance comprise, moins les
  mensualités des crédits encore en cours à la date d'achat.
- Frais de notaire : 7,5 % (ancien), 2,5 % (neuf). Apport visé : frais seuls, ou frais + 10 % du prix.
- Date d'achat : premier mois où l'apport visé est réuni et où prix + frais − apport ≤ crédit possible.
- Épargne : salaires reçus − dépenses (charges et crédits ajoutés automatiquement chaque mois).

## Développement
- Lancer : `python3 -m http.server 8080` puis http://localhost:8080
- Tests : `npm test` (Node 18 ou plus, aucune dépendance)
- Icônes : remplacer `icons/logo.svg` puis `npm run icons` (Playwright requis)
- Incrémenter `VERSION` dans `sw.js` à chaque mise en ligne de la version web.
