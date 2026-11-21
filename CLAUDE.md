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

Fait : règles CNAV + Agirc-Arrco sur barèmes 2026 sourcés, AVPF simplifiée, générateur calé (`bun scripts/calage.ts --ajuste --ecrit` réécrit `generateur/hypotheses.data.json` et `apps/web/src/calage.json`), pages Accueil, Simuler (15 leviers), Décisions, Carrières, Modèle. Les leviers sont définis une seule fois dans `apps/web/src/leviers.ts`.
Calage : salaires sur l'Insee 2025, durées sur la Drees (génération 1953) ; les pensions ne sont jamais ciblées, elles vérifient. Écarts actuels : D1 +19 %, médiane -10 %, D9 -15 % (cible tous régimes, modèle privé seul ; critère du projet : ±10 %). Cas types COR (génération 1964) : carrières continues à ±2 % ; carrières interrompues hors tolérance (+12 % chômage, -8 % enfant).
Pondération : générations 1930 à 2008, poids = pyramide Insee × part du privé (`bun scripts/build-population.ts`, à relancer après un calage). Totaux à moins de 8 % des chiffres publiés. Reste, par priorité : projection année par année (démographie, long terme), bloc résiduel des autres régimes, comportements de départ, chômage non indemnisé, carrières longues.

`proto/` contient des maquettes jetables à données fictives.
