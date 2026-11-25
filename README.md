# Auplio Investment

Application mobile (PWA installable sur Android) pour gérer le budget d'un couple, repérer où économiser, préparer un achat immobilier et calculer chaque mois le montant réellement investissable.
Complément de Vigie Trading Analytics : Vigie dit **où** investir, Auplio Investment dit **combien**, et seulement après la sécurité et l'apport.

## Fonctions (v0.2)
- **Saisie** : dépense ou revenu exceptionnel en deux taps, payé par l'un, l'autre ou en commun.
- **Mois** : revenus du foyer, charges fixes, dépenses, reste ; répartition par personne et par catégorie.
- **Économies** : taux d'épargne du foyer, leviers chiffrés (réduction testée de 5 à 50 %, gain par mois et par an, effet sur la date d'apport), budgets par catégorie avec projection fin de mois, postes qui dérapent par rapport à la moyenne, abonnements.
- **Objectifs** : cascade du surplus mensuel
  `salaires − charges fixes − dépenses variables (moyenne 3 mois) = surplus`
  → 1. épargne de précaution (objectif en mois de dépenses)
  → marge gardée sur le compte (%)
  → 2. apport immobilier (part réglable du reste)
  → 3. investissable (pour Vigie).
  Projet immobilier : frais de notaire (ancien 7,5 % / neuf 2,5 %), apport visé, mensualité avec assurance, taux d'endettement vs 35 % (règle HCSF), durée max 25 ans (27 en neuf), capacité d'emprunt, prix maximum, coût du crédit, reste à vivre après achat, date estimée de l'apport.
- **Réglages** : prénoms et salaires, charges fixes typées (loyer, crédit, abonnement, charge), catégories, export JSON/CSV, import.

Données 100 % locales sur le téléphone (IndexedDB + copie localStorage), fonctionne hors ligne. Les données v0.1 sont reprises automatiquement.

## Installation sur le téléphone
1. Activer GitHub Pages : *Settings → Pages → Deploy from a branch → `main` / root*.
2. Ouvrir `https://jordanekastler68-debug.github.io/Auplio-investment-/` dans Chrome sur Android.
3. Menu ⋮ → **Ajouter à l'écran d'accueil** (ou « Installer l'application »).

## Développement local
```
python3 -m http.server 8080
```
Puis ouvrir http://localhost:8080. Après chaque modification publiée, incrémenter `VERSION` dans `sw.js`.

## Pistes suivantes
- Synchronisation entre les deux téléphones du couple.
- Import des relevés bancaires (CSV) pour éviter la saisie manuelle.
- Charges fixes datées (prélèvements réels) et revenus variables mois par mois.
- Export du montant investissable vers Vigie.
