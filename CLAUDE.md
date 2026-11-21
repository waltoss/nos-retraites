# nos-retraites.app

Simulateur citoyen, indépendant et open source (AGPL-3.0) du système de retraite français par répartition.
Objectif : un outil pour les débats entre citoyens de la présidentielle 2027. Chacun doit pouvoir se faire un avis éclairé sur tous les leviers politiques et voir leurs effets collectifs (société, finances publiques, service public) et individuels (sa place, sa pension).
Horizon : montrer les effets de long terme et sur les générations futures, pas seulement l'année en cours.

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
- Front : TanStack Start + React. Hébergement : Cloudflare. Pas de backend requis, pas de mesure d'audience. Tests : `bun test`, tolérances de calage écrites dans les tests.

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

Fait : règles CNAV + Agirc-Arrco sur barèmes sourcés (générations 1930 à 2052, euros constants jusqu'en 2130 selon le COR), carrières en mois par état, générateur calé (`bun scripts/calage.ts --ajuste --ecrit`), pondération Insee × part du privé (`bun scripts/build-population.ts`, à relancer après un calage), projection 2026-2070 (`projection.ts`, réformes datées de 2028, montée en charge par génération), carrières longues (Cnav 2026) et comportements de départ réglés sur les départs observés (`data/references/departs.json`, `bun scripts/compare-departs.ts`), système entier par bloc résiduel calé sur le COR (`systeme.ts`, `bun scripts/build-systeme.ts`), natalité et migrations par interpolation des variantes Insee, politiques familiales par fourchettes (`bun scripts/build-politiques.ts`). Pages Accueil, Scénarios (`scenarios.ts`, options anonymes), Simuler, Et moi, Décisions, Carrières, Modèle. Leviers définis une seule fois dans `apps/web/src/leviers.ts`.
Backtest 2010-2024 (`bun scripts/backtest.ts`, bornes dans `test/backtest.test.ts`) : âge de départ à moins de 0,5 an, flux et effectifs à moins de 8 %, pension de base des femmes +18 à +23 %, complémentaire des hommes -12 à -29 %. Polypensionnés, taux moyens de la complémentaire et écart de salaire historique (`bun scripts/build-historique.ts`), mortalité selon la pension (`bun scripts/build-mortalite.ts`). Recoupements COR (`bun scripts/compare-projection.ts`) : natalité et migrations collent en 2070 ; 1,02 cotisant pour un retraité en 2070 contre 0,87.
Après un calage : build-population, build-systeme, compare-projection, backtest. Reste, par priorité : volume de travail annuel (petits contrats, temps partiel), part des cadres par sexe, bloc résiduel par levier, relecture extérieure (`docs/methode.md`).
`proto/` contient des maquettes jetables à données fictives.
