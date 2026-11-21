# nos-retraites.app

Simulateur citoyen, indépendant et open source (AGPL-3.0) du système de retraite français par répartition.
Deux questions : effet d'une politique publique sur les distributions des cotisants et des retraités ; pension d'un individu selon sa place et sa carrière.

Le vocabulaire métier est défini dans `CONTEXT.md`. Le lire avant de nommer quoi que ce soit.

## Décisions de conception

- **Équation** : cotisations + autres ressources + besoin de financement = pensions. Tout levier se rattache à un terme.
- **Moteur** : microsimulation légère. Unité = carrière individuelle (états annuels, salaires, événements). Population synthétique de 20 000 à 50 000 individus, pondérée sur des cohortes démographiques. Graine aléatoire fixe.
- **Régimes** : CNAV + Agirc-Arrco en vraies règles ; le reste en bloc résiduel calé sur le COR. Un régime = un module.
- **Leviers à deux étages** : politique → facteur (hypothèse sourcée, fourchette) ; facteur → système (calcul du moteur). Une politique est un objet de données, le moteur ne la connaît pas.
- **Financement** : par défaut le besoin de financement part en dette ; l'utilisateur le répartit ensuite entre pensions, cotisations, âge, dette.
- **Référence** : droit en vigueur (barème par génération, versionné). Les variantes politiques sont des scénarios prédéfinis.
- **Calage** : année de base 2025 ; backtest 2010 → 2025 (ajustement 2010-2019, validation 2020-2025, peu de paramètres libres) ; COR en recoupement, pas en cible.
- **Individuel** : saisie rapide (naissance, sexe, salaire) puis affinée ; résultat affiché dans les distributions, en euros constants.

## Stack

- Bun, TypeScript strict, monorepo. `packages/engine` : fonctions pures, isomorphe (navigateur en Web Worker, scripts Bun, Worker Cloudflare), aucune dépendance au DOM.
- Front : TanStack Start + React. Hébergement : Cloudflare. Pas de backend requis, pas de mesure d'audience.
- Tests : `bun test`. Les tolérances de calage sont écrites dans les tests.

## Conventions

- Termes métier et acronymes en français sans accents, tels que définis dans `CONTEXT.md` (`carriere`, `decote`, `trimestresValides`). Tout le reste en anglais (`computePension`, `runSimulation`).
- Un terme absent de `CONTEXT.md` y est ajouté avant d'entrer dans le code.
- Chaque paramètre porte `source`, `url`, `date`. Aucun chiffre codé sans avoir été lu dans sa source.
- Données : les scripts téléchargent et transforment ; seuls les JSON dérivés sont versionnés (`data/raw/` est ignoré).
- Budget de performance : une simulation de 20 000 individus en moins de 500 ms sur mobile.

## Garde-fous

- Neutralité : aucune recommandation ; leviers à égalité, avec leurs controverses.
- Projet indépendant : rien qui évoque un site de l'État (ni Marianne, ni tricolore).
- Incertitude visible : fourchettes, erreur du backtest publiée, « ne remplace pas M@rel ».
- Vie privée : les saisies individuelles ne quittent pas le navigateur.

## Commandes

`bun test packages`, `bun run dev`, `bun run build`, `bun run check`, `bun run --cwd apps/web deploy` (mise en production sur nos-retraites.app avec la CLI `cf`, config dans `apps/web/cloudflare.config.ts`), `bun scripts/build-baremes.ts` (régénère `france.data.json` depuis `data/baremes`), `bun scripts/compare-drees.ts` (photographie du scénario de référence).

## État

Fait : règles CNAV + Agirc-Arrco sur barèmes 2026 sourcés, générateur naïf, pages Accueil, Simuler (15 leviers), Décisions, Carrières, Modèle. Les leviers sont définis une seule fois dans `apps/web/src/leviers.ts`.
Reste : cas types du COR (il manque le salaire moyen par tête), calage du générateur (`generateur/hypotheses.ts` est posé à la main), poids par cohorte, démographie (natalité, immigration), comportements de départ (décote, surcote).
Critères : cas types COR à ±2 % ; médiane et déciles extrêmes des pensions à ±10 % de la Drees (échec actuel sur le 1er décile), sinon repli sur un modèle par cellules.

`proto/` contient des maquettes jetables à données fictives.
