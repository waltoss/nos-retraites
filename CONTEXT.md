# Contexte : vocabulaire du domaine

Un terme, une définition. L'identifiant de code est le terme sans accents (`decote`, `trimestresValides`).

## Le système

- **Répartition** : mode de financement où les cotisations d'une année paient les pensions de la même année.
- **Équation des retraites** : cotisations + autres ressources + besoin de financement = pensions.
- **Cotisant** : individu qui verse des cotisations vieillesse au cours de l'année.
- **Retraité** : individu qui perçoit une pension de droit direct au cours de l'année.
- **Ratio démographique** : nombre de cotisants divisé par le nombre de retraités.
- **Pension relative** : pension moyenne divisée par le revenu d'activité moyen.
- **Autres ressources** : recettes du système hors cotisations (CSG, impôts affectés, transferts de l'État et d'autres branches).
- **Solde** : ressources moins pensions sur une année, hors besoin de financement.
- **Besoin de financement** : montant annuel qui manque pour fermer l'équation ; l'opposé du solde quand il est négatif.
- **Dette cumulée** : somme des besoins de financement non comblés depuis l'année de base, avec ou sans intérêts.
- **Financement** : répartition du besoin de financement entre pensions, cotisations, âge et dette, choisie par l'utilisateur.

## Les individus

- **Individu** : personne synthétique de la population simulée, porteuse d'une carrière et d'un poids.
- **Génération** : ensemble des individus nés la même année.
- **Cohorte** : effectif réel d'une génération par sexe, suivi d'année en année par la démographie.
- **Poids** : nombre de personnes réelles qu'un individu représente : la population de son âge et de son sexe dans le champ, partagée entre les individus simulés de cette cellule.
- **Pyramide** : population réelle par sexe et âge une année donnée, d'après l'Insee.
- **Champ** : partie de la population réelle que la population simulée représente (aujourd'hui les salariés du privé), définie par une part à chaque âge.
- **Population synthétique** : ensemble des individus simulés, construit à partir d'agrégats publics et non de données personnelles.
- **Carrière** : suite annuelle des états, salaires et événements d'un individu, de l'entrée dans la vie active à la liquidation.
- **État** : situation d'un individu sur une année : emploi cotisant, chômage, maladie ou maternité, inactivité, retraite. Chaque état dit combien on cotise et combien on valide.
- **Événement** : fait daté qui modifie une carrière (naissance d'un enfant, interruption, migration, liquidation).
- **Générateur de carrières** : composant qui fait avancer chaque individu d'une année par des probabilités de transition entre états.
- **Graine** : valeur qui fixe les tirages aléatoires, identique entre scénarios pour que l'écart vienne de la réforme.
- **Carrière partielle** : carrière dont une partie seulement se déroule dans le système français (arrivée tardive, départ à l'étranger).
- **Portrait** : carrière d'un individu présentée à l'utilisateur pour illustrer une partie d'une distribution.

## Les règles

- **Régime** : ensemble de règles de cotisation et de calcul de pension propre à une population (un module du moteur).
- **Bloc résiduel** : agrégat des régimes non modélisés en vraies règles, calé sur les totaux publiés.
- **Barème** : table versionnée des paramètres légaux par génération ou par année (âge légal, durée requise, taux).
- **Âge légal** : âge minimal d'ouverture des droits à la retraite.
- **Âge du taux plein automatique** : âge à partir duquel la décote ne s'applique plus, quelle que soit la durée validée.
- **Liquidation** : moment où un individu fait calculer et verser sa pension ; elle clôt sa carrière.
- **Trimestre validé** : unité de durée d'assurance acquise par le travail (trimestre cotisé) ou par une période assimilée.
- **Période assimilée** : période sans cotisation qui valide quand même des trimestres (chômage indemnisé, maladie, maternité).
- **Durée requise** : nombre de trimestres validés nécessaire à une génération pour le taux plein.
- **Taux plein** : taux maximal de liquidation du régime général, appliqué au salaire annuel moyen.
- **Décote** : réduction du taux de liquidation pour chaque trimestre manquant.
- **Surcote** : majoration de la pension pour chaque trimestre travaillé au-delà du taux plein après l'âge légal.
- **Point** : unité de droit du régime complémentaire, achetée par les cotisations au prix d'achat et convertie en pension à la valeur de service.
- **Compte de carrière** : droits acquis année par année par un individu (trimestres, salaires revalorisés, points), indépendants des règles du scénario.
- **Carrière type** : carrière théorique en emploi continu à salaire fixé, utilisée pour vérifier les règles.
- **Cadre** : salarié qui, avant 2019, acquérait des points Agirc au-dessus du PASS au lieu de points Arrco.
- **Tranche** : part du salaire entre deux multiples du PASS, à laquelle s'applique un taux de cotisation.
- **Proratisation** : rapport entre la durée validée et la durée requise, plafonné à 1, qui réduit la pension de base.
- **Coefficient d'anticipation** : minoration définitive de la pension complémentaire en cas de départ sans le taux plein.
- **Droits familiaux** : avantages de retraite liés aux enfants (trimestres supplémentaires, majoration de pension).
- **Revalorisation** : règle d'évolution annuelle des pensions déjà liquidées (prix, salaires, gel).
- **Polypensionné** : retraité qui perçoit des pensions de plusieurs régimes de base.
- **Taux de remplacement** : première pension divisée par le dernier revenu d'activité d'un individu.
- **Euros constants** : montants exprimés au pouvoir d'achat de l'année de base ; seule unité affichée.

## La simulation

- **Facteur** : terme de la décomposition de l'équation, modifiable directement (fécondité, solde migratoire, taux d'emploi, chômage, âge de départ).
- **Politique** : mesure publique décrite comme un jeu de déplacements de facteurs, avec élasticités, délai d'effet et sources.
- **Levier** : toute commande de l'interface, facteur ou politique.
- **Réglage** : valeur donnée à un levier par l'utilisateur quand elle s'écarte du droit en vigueur.
- **Décision** : réglage type d'un seul levier, appliqué seul pour mesurer son effet.
- **Terme** : l'un des quatre facteurs de l'équation qu'un levier déplace (cotisants, cotisation moyenne, retraités, pension moyenne).
- **Élasticité** : ampleur supposée de l'effet d'une politique sur un facteur, donnée en fourchette basse, centrale, haute.
- **Délai d'effet** : temps entre la mise en place d'une politique et son effet sur l'équation.
- **Scénario** : jeu complet de valeurs de leviers et de financement, encodable dans une URL.
- **Scénario de référence** : scénario du droit en vigueur, auquel tous les autres sont comparés.
- **Calage** : ajustement des hypothèses du générateur pour que salaires et durées de carrière simulés reproduisent les données observées.
- **Cas type** : carrière type publiée par le COR avec son taux de remplacement, utilisée pour vérifier les règles de calcul.
- **Backtest** : simulation partant d'une année passée avec les données observées de l'époque, comparée au présent.
- **Recoupement** : comparaison des résultats avec des chiffres publiés par un organisme tiers, sans en faire une cible.

## Acronymes

- **AOD** : âge d'ouverture des droits, synonyme d'âge légal.
- **Agirc-Arrco** : régime complémentaire obligatoire, par points, des salariés du privé.
- **AVPF** : assurance vieillesse des parents au foyer, qui valide des trimestres et porte un salaire au SMIC au compte d'un parent sans activité.
- **CADES** : Caisse d'amortissement de la dette sociale, qui porte et rembourse les déficits passés de la Sécurité sociale.
- **CNAV** : Caisse nationale d'assurance vieillesse, régime de base des salariés du privé (« régime général »).
- **COR** : Conseil d'orientation des retraites, auteur des projections officielles annuelles.
- **CRDS** : contribution au remboursement de la dette sociale, impôt affecté à la CADES.
- **CSG** : contribution sociale généralisée, impôt sur les revenus affecté à la protection sociale.
- **Drees** : service statistique des ministères sociaux, auteur du modèle Trajectoire et des statistiques sur les pensions.
- **EBE** : entreprise à but d'emploi, employeur des salariés d'un territoire TZCLD.
- **EIC** : échantillon interrégimes de cotisants, données individuelles de carrière non publiques ; nous ne l'utilisons pas.
- **INSEE** : institut national de la statistique, source de la démographie, de l'emploi et des salaires.
- **LFSS** : loi de financement de la Sécurité sociale, votée chaque année.
- **MDA** : majoration de durée d'assurance, trimestres accordés au titre des enfants.
- **MICO** : minimum contributif, plancher de pension de base pour une carrière complète à bas salaires.
- **PASS** : plafond annuel de la Sécurité sociale, limite du salaire pris en compte par le régime de base.
- **PIB** : produit intérieur brut.
- **RMPT** : rémunération moyenne par tête de l'ensemble de l'économie, référence des carrières types du COR.
- **SAM** : salaire annuel moyen, moyenne des meilleures années de salaire plafonnées et revalorisées, base du calcul CNAV.
- **SMIC** : salaire minimum interprofessionnel de croissance.
- **TZCLD** : Territoires zéro chômeur de longue durée, dispositif d'embauche en CDI de chômeurs de longue durée.
