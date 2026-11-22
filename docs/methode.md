# nos-retraites.app : note de méthode pour relecture

Version du 21 novembre 2026. Code et données : https://github.com/waltoss/nos-retraites

Cette note s'adresse à des économistes des retraites. Elle dit ce que l'outil calcule, sur quoi il est réglé, où il s'écarte des chiffres publiés, et ce que nous aimerions voir critiqué.

## But

Un simulateur public pour les débats de la présidentielle de 2027. Il montre ce qu'une réforme change jusqu'en 2070, pour le système (solde tous régimes) et pour les personnes (âge de départ, pension par génération). Il ne recommande rien. Les ordres de grandeur comptent plus que les niveaux.

## Architecture

- **Microsimulation** de 30 000 carrières synthétiques, générations 1930 à 2052, en TypeScript, exécutée dans le navigateur. Graine fixe : deux scénarios se comparent personne par personne.
- **Apprentissage** : avant le premier emploi, une part des jeunes est en alternance, selon l'âge et le nombre d'apprentis de l'année (1982-2024) ; un trimestre validé par an avant 2014 (hypothèse).
- **Carrières** : chaque année se découpe en mois d'emploi, de chômage, de maladie ou maternité, d'inactivité. Salaire selon l'âge, un rang permanent et un choc annuel. Naissances, interruptions, temps partiel des mères, AVPF simplifiée.
- **Règles** : régime général et Agirc-Arrco en vraies règles (salaire annuel moyen, proratisation, décote, surcote, minimum contributif, majorations pour enfants, points, coefficients d'anticipation), sur barèmes par génération lus dans leurs sources. Carrières longues selon la circulaire Cnav 2026-29.
- **Pondération** : poids = pyramide Insee par âge et sexe × part de l'âge qui relève du privé, réglée sur les cotisants et retraités de l'Agirc-Arrco fin 2024.
- **Projection 2026-2070** en euros constants : population selon les projections Insee de 2026, salaires +0,7 % par an (scénario de référence du COR), pensions liquidées indexées sur les prix.
- **Fonction publique** : une seconde population de 14 760 fonctionnaires et militaires (État, collectivités, hôpitaux, armées), en vraies règles : 75 % du traitement des six derniers mois, proratisation sur la durée de services, décote et surcote sur la durée tous régimes avec leur montée en charge de 2006 à 2020, minimum garanti, catégories actives et super-actives, bonifications pour enfants, invalidité, retraite additionnelle sur les primes. Carrières continues, traitement selon l'âge, l'ancienneté et un rang, primes en part du traitement (enseignants à part), temps partiel entre 30 et 50 ans aux parts de 2019. Militaires : seuls ceux qui partent avec une pension, sans décote, insensibles aux leviers d'âge. La part de chaque génération qui devient fonctionnaire est réglée par moindres carrés sur les cotisants et retraités de 2012 à 2025.
- **Système entier** : les autres régimes ne sont pas simulés. Un bloc résiduel est la différence entre les totaux projetés par le COR (juin 2026) et ce qui est simulé avec la loi actuelle (privé, pensions des fonctionnaires civils). Dans un scénario, il réagit levier par levier : les règles communes à tous les régimes (âge, durée, âge du taux plein automatique, avance pour début précoce, décote et surcote, droits familiaux, revalorisation avec sa durée et son seuil) s'y appliquent en entier ; les règles propres au régime général (meilleures années, taux plein, minimum contributif, taux de cotisation) ne s'appliquent qu'aux régimes alignés (groupe « Lura » du COR) ; celles de l'Agirc-Arrco restent dans l'Agirc-Arrco.
- **Réformes** : effet en 2028. Âge légal et durée requise montent de trois mois par génération à partir de la première qui atteint son âge légal en 2028. Ceux qui sont partis avant gardent leur pension.

## Réglage

Deux temps, et les pensions ne sont jamais ciblées.

1. Salaires sur les déciles Insee 2025 du privé.
2. Durées de carrière sur la génération 1953 (Drees, EIR 2020).

Comportements de départ réglés à la main sur les départs au régime général. Trois paramètres : part de départs pour inaptitude parmi ceux qui n'ont ni emploi ni durée à l'âge légal (45 %), part qui accepte une décote (20 %), part qui continue après le taux plein en emploi (62 %).

## Ce que le modèle retrouve, et ce qu'il manque

| Grandeur | Modèle | Publié |
|---|---|---|
| Cotisants du privé, 2026 (millions) | 19,3 | 20,1 |
| Retraités du privé, 2026 (millions) | 12,6 | 12,8 |
| Cotisations versées (Md€) | 202 | 217 |
| Pensions versées (Md€) | 243 | 221 |
| Pension médiane, génération 1953 (€/mois) | 1 416 | 1 618 (tous régimes) |
| Premier décile, génération 1953 | 635 | 465 (tous régimes) |
| Neuvième décile, génération 1953 | 2 710 | 3 140 (tous régimes) |
| Départs 2023 : carrière longue | 16 % | 18 % |
| Départs 2023 : inaptitude et ex-invalides | 17 % | 17 % |
| Départs 2023 : avec décote | 14 % | 13 % |
| Départs 2023 : avec surcote | 19 % | 18 % |
| Âge moyen de départ, 2023 | 63,3 | 63,3 |
| Cotisants pour un retraité, 2070 | 1,07 | 0,87 (COR, Agirc-Arrco) |
| Natalité 1,70 : solde 2070 (points de PIB) | +0,92 | +0,92 (COR) |
| Solde migratoire 230 000 : solde 2070 | +0,88 | +1,05 (COR) |

Les effectifs de 2026 sont réglés ; le reste est une vérification. Les cas types du COR sont reproduits à ±2 % en carrière continue (génération 1964), à +12 % et −8 % pour les carrières interrompues.

## Hypothèses qui pèsent le plus

1. **Bloc résiduel.** Régimes spéciaux, indépendants, autres complémentaires et réversions réagissent aux règles communes dans la même proportion que le régime de base du privé. Les cotisations des fonctionnaires y restent aussi : le nombre de postes est supposé indépendant de l'âge de départ.
1 bis. **Fonctionnaires.** Carrières réglées à la main, sans sortie vers le privé. Pensions de l'État et des militaires retrouvées à moins de 8 % de 2012 à 2024, celles de la CNRACL trop basses de 6 à 9 % alors que l'indice de fin de carrière y est trop haut de 6 %. La dépense en part de PIB suit la pente du COR à 2 points près jusqu'en 2070. Traitements passés : valeur du point plus 0,4 % par an ; futurs : comme les salaires du privé. Part des primes constante dans le temps. « Primes comptées » garde le taux de 75 % et les cotisations actuelles. PIB et autres ressources suivent la masse salariale du privé.
1 ter. **Ressources hors cotisations et capitalisation, en version simple.** Les ressources hors cotisations sont détaillées par poste (COR, tableau 2.2) mais suivent toutes la masse des salaires du privé. Une ressource nouvelle est un montant annoncé qui garde sa part du PIB : ni assiette, ni incidence, ni effet sur l'emploi. La capitalisation est un compte par salarié du privé à rendement réel fixe (2 %, 2,5 % ou 4,3 % par an, d'après l'OCDE), converti en rente au tarif unisexe de la mortalité Insee ; les pensions par répartition ne changent pas, et la part des versements prise sur les cotisations manque au solde. Page Ressources (`/ressources`).
2. **Comportements figés.** Les parts de départs avec décote, surcote ou pour inaptitude ne changent pas quand l'âge légal change. Aucun effet de l'âge légal sur l'emploi des seniors au-delà du report mécanique : celui qui était en emploi y reste, celui qui n'y était pas attend. De même, changer le taux de la décote ne déplace aucun départ : seul le montant des pensions change. L'avance pour début précoce se juge comme une carrière longue (cinq trimestres cotisés avant la fin de l'année d'un âge donné) et le seuil de revalorisation s'applique d'un coup, sur la seule pension simulée.
2 bis. **Écrêtement des pensions (cas limite).** Plafond et part conservée au-delà d'un seuil se jugent sur la pension totale des régimes simulés d'un individu, en euros constants : à la liquidation pour les nouveaux retraités, sur le montant au départ pour les pensions en cours, dès l'année d'effet. Les pensions qu'un même individu tire d'un régime non simulé sont ignorées, donc l'économie est sous-estimée ; le bloc résiduel réagit comme les pensions de base du privé. Aucun départ, aucune carrière ne change, et la solidité juridique d'une baisse de pensions liquidées n'est pas jugée.
3. **Carrières longues dans un scénario.** Elles gardent leur avance sur l'âge légal. Aucun texte ne le dit.
4. **Une seule génération de réglage.** Les suivantes diffèrent par l'âge d'entrée et la fréquence des interruptions après une naissance, pas par le reste.
5. **Retraités futurs sous-comptés.** La part du privé chez les retraités suit la génération, mais le rapport cotisants/retraités se dégrade moins vite que dans le COR.
6. **Mortalité** indépendante du niveau de pension. Pas de réversion simulée.
7. **Politiques familiales.** Effet sur la natalité par fourchettes basse, centrale, haute tirées d'évaluations étrangères, transposées à la France. Coût affiché, non déduit du solde.
8. **Cotisations.** Une hausse de taux n'a aucun effet sur l'emploi ni sur les salaires.

## Questions aux relecteurs

1. L'extension au système entier par un bloc résiduel qui ne suit que les règles communes est-elle défendable pour des ordres de grandeur ? Pour les fonctionnaires, quelle règle d'alignement simuler : 25 meilleures années avec primes au taux de 75 %, ou les règles du privé (régime général et complémentaire) appliquées à la rémunération entière ?
2. Comment faire réagir les comportements de départ à l'âge légal sans données individuelles ? Existe-t-il des élasticités publiées utilisables ?
3. Que faut-il supposer pour l'emploi des 60-64 ans quand l'âge légal monte ? Le report mécanique surestime-t-il le gain ?
4. L'écart sur le premier décile vient-il surtout des polypensionnés, ou d'un défaut du générateur de carrières ?
5. Le cumul des soldes sans intérêts est-il la bonne mesure de ce qui est laissé aux générations suivantes ? Faut-il un taux, lequel ?
6. Quel recoupement manque, qui vous ferait changer d'avis sur un résultat ?

## Pour reproduire

```
bun install
bun test packages                 # règles, calage, projection
bun scripts/calage.ts             # écarts aux cibles Insee et Drees
bun scripts/compare-departs.ts    # départs par année et par motif
bun scripts/compare-projection.ts # recoupements avec le COR
bun scripts/backtest.ts           # 2010-2024, privé et fonction publique
```

Sources et citations : `data/references/` et `data/baremes/`, chaque valeur avec sa source, son adresse et sa date de lecture.
