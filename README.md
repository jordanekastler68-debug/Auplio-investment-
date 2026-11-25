# Auplio Investment

Application mobile (PWA installable sur Android) pour gérer le budget d'un couple, repérer où économiser, préparer un achat immobilier et calculer chaque mois le montant réellement investissable.
Complément de Vigie Trading Analytics : Vigie dit **où** investir, Auplio Investment dit **combien**, et seulement après la sécurité et l'apport.

## Fonctionnement (v0.4)
Chacun installe l'appli sur son téléphone et saisit **ses** dépenses. Chaque mois, chacun entre le **net payé** de sa fiche de paie. Les deux téléphones se réunissent par « Envoyer mes données » / « Recevoir et fusionner » pour la vue d'ensemble du foyer.

- **Accueil** : fiches de paie du mois, vue d'ensemble (qui a gagné / dépensé quoi, reste du foyer), « À faire ce mois-ci » (virements épargne de sécurité → apport maison → investissement, avec bouton *Fait* qui met à jour l'épargne ; budgets dépassés ; postes qui dérapent), objectifs, détail du calcul replié.
- **Saisie** · **Dépenses** (filtre Tout / chacun / Commun, où part l'argent, budgets, où économiser) · **Maison** (projet immobilier) · **Réglages**.

## Fonctions (v0.3)
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
- **Import de relevés bancaires (CSV)** : toutes banques françaises et néobanques (détection automatique du séparateur, de l'encodage, des colonnes, des dates et montants, fichiers avec ou sans en-tête). Catégorisation automatique (commerçants courants + règles apprises quand on corrige), libellés nettoyés, anti-doublons d'un import à l'autre, annulation du dernier import. Décochés d'office : salaires, virements vers l'épargne / eToro / courtiers, virements internes, charges fixes déjà déclarées.
- **Partage entre les deux téléphones** : envoi des données (partage Android : WhatsApp, mail…) et fusion sur l'autre téléphone, sans doublons, suppressions propagées, réglages les plus récents conservés.
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
- Synchronisation automatique (sans échange de fichier) via un petit serveur (Firebase / Supabase).
- Charges fixes datées (prélèvements réels) et revenus variables mois par mois.
- Export du montant investissable vers Vigie.
