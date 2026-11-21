# Dépôts de code publics : Trajectoire (Drees) et Destinie 2 (Insee)

Dépôts clonés et lus le 2026-11-21. Tout ce qui suit vient des fichiers des dépôts ; les points non vérifiés sont signalés.

## 1. Drees — `calculPension` (module de calcul des droits du modèle Trajectoire)

- **URL** : https://gitlab.com/DREES_code/public/outils/calcul_pension — dernier commit `ec5a871` du 2023-01-20. Aucun dépôt « DREES_code » pertinent sur GitHub.
- **Langage** : R (paquet `calculPension` 0.1, `data.table`), environ 13 300 lignes dans `R/`.
- **Licence** : fichier `LICENSE` = texte français de l'**EUPL v. 1.2** ; `DESCRIPTION` : `License: EUPL` ; README : « distribué sous licence EUPL ».
- **Périmètre** : le README précise que ces fonctions sont « utilisées telles quelles dans le modèle Trajectoire » et représentent « un peu plus d'un tiers du programme total ». Le reste de Trajectoire (génération des carrières, comportements de départ) n'est pas dans ce dépôt et je ne l'ai pas trouvé dans le groupe GitLab `DREES_code`. Pas annuel pour les carrières, mensuel pour les dates.
- **Calcul CNAV et Agirc-Arrco** : pas de fichier par régime ; les régimes sont des valeurs d'une colonne « caisse » traitées par les mêmes fonctions.
  - `R/fonctionsCalculsPensions.R` (3 787 lignes) : `calculeSam`, `calculeNbTrimDecote`, `calculeSurcote`, `carrieresLongues`, `ecreteMico`, `calculeMajorationEnfant`, `gestionFusionAgircArrco`, `dateLiqComplementaire`, `applicationModulationTemporaire`, `calculePensionTotale`.
  - `R/fonctionsCalculsDivers.R` : `calculePtGratuits`, `calculePensionNette`, `calculeRemuNette`.
  - `R/fonctionChapeau.R` (enchaînement), `R/gestionParametres.R` (chargement et prolongement des paramètres).
  - Non vérifié : l'endroit exact où sont acquis les points Agirc-Arrco année par année.
- **Paramètres législatifs versionnés** (`inst/extdata/`), en binaire R ou Excel, pas en texte :
  - `parametres.Rds` : liste de tables (`ageDuree`, `coeffDecote`, `coeffSurcote`, `nbAnPourSam`, `revaloSalaireSam`, `paramMico`, `valeurPtAcquisition`, `valeurPtService`, `majoEnfantAA`, `garantieMinimalePtsAgirc`, `paramCotis`, `revalo`…).
  - `seriesIPP.Rds` : copie figée des barèmes IPP (`parametrePriveCnav`, `parametrePriveAgirc`, `parametrePriveArrco`, `parametrePriveAgircArrco`…) ; le code peut les retélécharger depuis `framagit.org/french-tax-and-benefit-tables/baremes-ipp-yaml`.
  - Hypothèses COR 2021 et 2022 en `.xlsx` : `hypo_parametres_2022_V3.xlsx` (feuilles `Revalo_RB`, `ASPA`, `Minima`, `Sal_valid`, `Smic_AVPF`, `AGIRC-ARRCO`), `hypo_Salaires_Prix_PIB_*`, `hypo_cotisants_chômage_*`, `hypo_taux_cotisation_et_legislation_2020_drees.xlsx` (`TxCot`, `PlafondARS`…).
- **Cas types COR** : `cas-typeCOR/script.R` rejoue les cas types pour les générations 1950 à 2000 à partir de `cas-typeCOR/hypo_cas_types_PourR - envoi DREES.xls` (non ouvert ici).
- **Réutilisable pour un portage TypeScript** :
  - la logique de calcul (SAM, décote, surcote, minimum contributif, carrières longues, fusion Agirc-Arrco, modulation temporaire) comme spécification exécutable ;
  - `script.R` + le classeur des cas types : banc de test direct contre les figures 3.3 et 3.4 du COR ;
  - les tables de paramètres, à exporter en JSON avec R (`readRDS`).
- **Précautions** :
  - L'appendice de l'EUPL 1.2 du dépôt liste l'AGPL v. 3 parmi les licences compatibles : une œuvre dérivée combinée à du code AGPL-3.0 peut être distribuée sous AGPL-3.0. Une traduction en TypeScript est une œuvre dérivée : conserver les mentions de droit d'auteur Drees, indiquer la provenance et les modifications.
  - Les barèmes IPP et les classeurs du COR ont leurs propres conditions de réutilisation, non précisées dans le dépôt : à vérifier avant de les redistribuer.
  - Code arrêté en janvier 2023, donc antérieur à la réforme des retraites de 2023 et aux hypothèses COR 2026 : paramètres et règles à mettre à jour. Le README prévient que l'outil est illustratif et simplifie certaines règles.

## 2. Insee — Destinie 2

- **URL** : https://github.com/InseeFr/Destinie-2 — commit `4c1d34b` du 2025-10-15.
- **Langage** : C++ (cœur dans `src/`, via Rcpp) piloté depuis R (`R/`, `demo/simulation.R`).
- **Licence** : `COPYING.txt` = GNU GPL version 3 ; `DESCRIPTION` : `GPL-3.0-or-later` ; en-têtes : « version 3 of the License, or (at your option) any later version », © Insee 2005-2018. Un fichier `inst/extdata/COPYING_ODbL.txt` (ODbL) est présent, sans indication dans le dépôt des données qu'il couvre.
- **Tables de paramètres** :
  - `inst/extdata/COR_2017|2018|2019|2021|2022|2023/` : `ParamSociaux.xls` (législation et barèmes), `PARAM_transitions.xls` (cibles de chômage et d'inactivité) ; le dossier 2018 contient aussi les classeurs d'hypothèses du COR. Pas de dossier postérieur à `COR_2023`.
  - `inst/extdata/Param_demo_2017|2022/` (mortalité, fécondité, migrations), `PARAM_mortalite_diff.xls`.
  - Versions empaquetées dans `data/*.rda` : `eco_cho_7_prod10` etc. (table `macro` 221 × 113 : `Prix`, `PlafondSS`, `SMIC`, `SMPT`, `SalValid`, `ValPtARRCO`, `SalRefAGIRC_ARRCO`, `ValPtAGIRC_ARRCO`, taux de cotisation… ; table `CiblesTrans` 114 × 36), scénarios démographiques `fec_*_vie_*_mig_*`. Scripts de construction dans `data-raw/`.
  - Les règles sont codées dans `src/Legislation.cpp` (722 lignes) et `src/DroitsRetr.cpp` (1 682 lignes : `SalBase`, `Points`, `DecoteSurcote`, `MinCont`, `LiqPrive`, `LiqPublic`, `coeffTempo`), plus `Retraite.cpp`, `Cotisations.cpp`, `Reversion.cpp`.
- **Générateur de trajectoires professionnelles** :
  - Transitions emploi / chômage / inactivité : `src/Transitions.cpp` et `.h`, coefficients dans `inst/extdata/EqTrans.xls` et `data/eq_struct.rda` (`EqTrans`, 294 × 40). Variables : polynôme d'âge (`age`, `age2`, `age3`, variantes juste après la fin des études), âge de fin d'études relatif (`findet_rel`), durées dans l'emploi, le statut, le chômage et l'inactivité (`dur_emp`, `dur_statut`, `durchom`, `durina`), nombre d'enfants (`nbenf`, `NbEnf1`, `NbEnf3`), statuts d'origine et de destination, indicatrices 55 à 58 ans, préretraites. Calage annuel sur `CiblesTrans` (`CHO_*`, `INA_*` par sexe et tranche d'âge de 5 ans, `PART_FP`).
  - Équations de salaire : `src/Salaires.cpp` et `.h`, coefficients dans `inst/extdata/EqSalaires.xls` et `import_eqSalaires/{pri,pub,ind}_{h,f}.xls` (privé, public, indépendants × sexe), `EqSalaires` 6 × 30 : constante, termes `E`, `E2`, `D`, `D2`, `FR` (sens exact non vérifié ici), effet individuel (`mean_indiv`, `Sig2_indiv`, `meanpente_indiv`), aléa annuel (`Sig2_an`), correctifs par sexe et âge (`CStructSexeAge`).
  - Variables individuelles en entrée (table `ech`) : `sexe`, `anaiss`, `moisnaiss`, `findet`, `typeFP`, `neFrance`, `dipl`, `tresdip`, `peudip`, `taux_prim`, `emigrant`.
- **Population de départ fournie : oui.**
  - `inst/extdata/input/simul_patrimoine.Rdata` (et `_rebasage`) : `ech` 62 663 individus, `emp` 2 545 589 lignes (`Id`, `age`, `statut`, `salaire`), `fam` (parents, enfants, conjoint).
  - `data/test.rda` : même structure, 50 910 individus, documenté comme « échantillon non représentatif de la population en 2010 ».
  - Le README décrit une pseudo-population de 30 000 ménages tirée de l'enquête Histoire de vie et Patrimoine 2017-2018 ; le dépôt ne dit pas explicitement que `simul_patrimoine.Rdata` est ce fichier (probable d'après le nom, non confirmé).
- **Réutilisable pour un portage TypeScript** : les coefficients `EqTrans` et `EqSalaires` et l'algorithme de calage (c'est la brique qui manque côté Drees) ; les carrières de `emp` comme population synthétique de test ; `DroitsRetr.cpp` comme seconde implémentation de référence du régime général et de l'Agirc-Arrco.
- **Précautions** :
  - Un portage est une œuvre dérivée sous GPL-3.0-or-later. L'article 13 de la GPL v3 (présent dans `COPYING.txt`) autorise la combinaison avec une œuvre AGPL v3 : les fichiers portés restent sous GPL-3.0-or-later avec la mention Insee, l'ensemble peut être diffusé comme projet AGPL-3.0. Marquer la licence fichier par fichier.
  - Statut des données (ODbL ou non, pseudo-population issue d'une enquête) à clarifier avec l'Insee avant de les redistribuer dans le dépôt.
  - Législation intégrée jusqu'aux hypothèses COR 2023 ; le README signale des simplifications (trois grands statuts, indépendants tous soumis aux mêmes règles).

Ces remarques de licence sont une lecture des fichiers, pas un avis juridique.
