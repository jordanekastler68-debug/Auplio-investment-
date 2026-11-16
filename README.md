# Auplio Investment

Application mobile (PWA installable sur Android) pour suivre ses dépenses et calculer chaque mois le montant réellement investissable. Complément de Vigie Trading Analytics : Vigie dit **où** investir, Auplio Investment dit **combien**.

## Fonctions (v0.1)
- **Saisie** : montant + catégorie en deux taps, note et date facultatives.
- **Mois** : revenus, charges fixes, dépenses, reste ; répartition par catégorie ; navigation mois par mois.
- **Investir** : calcul transparent
  `revenus − charges fixes − dépenses variables (moyenne 3 mois) = surplus`
  → le surplus remplit d'abord l'épargne de précaution (objectif en mois de dépenses)
  → une marge de sécurité (%) est conservée → le reste est investissable.
- **Réglages** : revenus, charges fixes, épargne de précaution, catégories, export JSON/CSV, import.

Données 100 % locales sur le téléphone (localStorage), fonctionne hors ligne.

## Installation sur le téléphone
1. Activer GitHub Pages : *Settings → Pages → Deploy from a branch → `main` / root*.
2. Ouvrir `https://jordanekastler68-debug.github.io/Auplio-investment-/` dans Chrome sur Android.
3. Menu ⋮ → **Ajouter à l'écran d'accueil**.

## Développement local
```
python3 -m http.server 8080
```
Puis ouvrir http://localhost:8080. Après chaque modification publiée, incrémenter `VERSION` dans `sw.js`.

## Pistes suivantes
- Dépenses récurrentes automatiques, budgets par catégorie avec alertes.
- Revenus variables (mois par mois).
- Export du montant investissable vers Vigie.
