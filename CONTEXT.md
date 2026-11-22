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
- **Poste de ressources** : ligne des autres ressources telle que le COR la publie (contributions d'équilibre, CSG, impôts et taxes affectés, transferts).
- **Assiette** : ce qu'un poste de ressources suit dans un scénario (masse des salaires, masse des pensions) ; une fonction du moteur par assiette.
- **Ressource nouvelle** : ressource hors cotisations qu'un scénario ajoute ou retire, décrite par un objet de données et calculée par la fonction de son type.
- **Capitalisation** : mode de financement où chacun accumule un compte, placé, qui paie sa propre rente ; ici un étage en plus de la répartition.
- **Versement** : somme portée chaque année sur le compte de capitalisation d'un individu, en part de son salaire brut.
- **Rendement réel** : ce que le fonds rapporte par an au-dessus des prix, net de frais ; hypothèse en fourchette basse, centrale, haute.
- **Rente** : revenu viager tiré du compte de capitalisation au départ, en plus de la pension.
- **Encours** : total des comptes des actifs et des réserves des rentes en cours.
- **Solde** : ressources moins dépenses sur une année ; lecture officielle avec les versements d'équilibre de l'État en ressources, ou lecture sans eux.
- **Besoin de financement** : montant annuel qui manque pour fermer l'équation ; l'opposé du solde quand il est négatif.
- **Dette cumulée** : somme des besoins de financement non comblés depuis l'année de base, avec ou sans intérêts.
- **Financement** : répartition du besoin de financement entre pensions, cotisations, âge et dette, choisie par l'utilisateur.

## Les individus

- **Individu** : personne synthétique de la population simulée, porteuse d'une carrière et d'un poids.
- **Génération** : ensemble des individus nés la même année.
- **Cohorte** : effectif réel d'une génération par sexe, suivi d'année en année par la démographie.
- **Poids** : nombre de personnes réelles qu'un individu représente : la population de son âge et de son sexe dans le champ, partagée entre les individus simulés de cette cellule.
- **Pyramide** : population réelle par sexe et âge une année donnée, d'après l'Insee.
- **Champ** : partie de la population réelle qu'une population simulée représente (les salariés du privé, les fonctionnaires civils), définie par une part à chaque âge ou à chaque génération. Il dit aussi quelles affiliations font un cotisant et quels régimes versent les pensions du champ ; ce que les mêmes individus cotisent et perçoivent ailleurs est compté à part (`autres`).
- **Indépendant** : artisan ou commerçant, pendant une partie de sa vie active. Le modèle ne simule que ceux qui ont aussi été salariés du privé ; les deux métiers partagent un régime mais pas l'histoire de leur complémentaire.
- **Auto-entrepreneur** : indépendant au régime simplifié créé en 2009, aux revenus bien plus faibles ; il fait baisser le revenu moyen des indépendants depuis cette date.
- **Population synthétique** : ensemble des individus simulés, construit à partir d'agrégats publics et non de données personnelles.
- **Carrière** : suite annuelle des états, salaires et événements d'un individu, de l'entrée dans la vie active à la liquidation.
- **État** : situation d'un individu sur une année : emploi cotisant, chômage, maladie ou maternité, inactivité, retraite. Chaque état dit combien on cotise et combien on valide.
- **Événement** : fait daté qui modifie une carrière (naissance d'un enfant, interruption, migration, liquidation).
- **Générateur de carrières** : composant qui fait avancer chaque individu d'une année par des probabilités de transition entre états.
- **Graine** : valeur qui fixe les tirages aléatoires, identique entre scénarios pour que l'écart vienne de la réforme.
- **Alternance** : années d'apprentissage ou de contrat en alternance avant l'entrée dans la vie active, payées en part du SMIC et qui valident des trimestres.
- **Carrière partielle** : carrière dont une partie seulement se déroule dans le système français (arrivée tardive, départ à l'étranger).
- **Portrait** : carrière d'un individu présentée à l'utilisateur pour illustrer une partie d'une distribution.

## Les règles

- **Régime** : caisse qui verse une pension selon ses propres règles (Cnav, Agirc-Arrco, SRE, CNRACL). Une politique peut s'adresser à un seul régime.
- **Affiliation** : statut sous lequel une année est travaillée (`prive`, `sre`, `cnracl`, `militaire`), qui ouvre des droits dans un ou plusieurs régimes ; un module du moteur. `autre` désigne un régime que le modèle ne simule pas : l'année ne compte que pour la durée tous régimes.
- **Affiliation principale** : celle où l'individu a le plus travaillé ; elle décide de son départ, et ses règles propres s'appliquent à lui.
- **Étage** : place d'un régime, base, complémentaire, ou intégré quand il tient lieu des deux (fonction publique).
- **Modèle** : les affiliations simulées, leurs régimes et les décisions des individus (`MODELE`). Ajouter un régime, c'est y ajouter une entrée.
- **Bloc résiduel** : ce qui manque au privé et aux fonctionnaires simulés pour retrouver les totaux publiés du système entier (autres régimes, réversion, autres ressources) ; dans un scénario, les régimes alignés sur le régime général suivent toutes ses règles, les autres seulement les règles communes à tous.
- **Règle commune** : règle d'un scénario qui vaut pour tous les régimes (âge légal, durée requise, âge du taux plein automatique, avance pour début précoce, décote et surcote, droits familiaux, revalorisation), par opposition aux règles propres au privé (meilleures années, taux plein, minimum contributif, valeur du point, taux de cotisation).
- **Régime aligné** : régime de base qui applique les règles de calcul du régime général (indépendants, salariés agricoles).
- **Cadrage** : totaux publiés du système entier, année par année, sur lesquels le bloc résiduel est calé (projections du COR).
- **Barème** : table versionnée des paramètres légaux par génération ou par année (âge légal, durée requise, taux).
- **Âge légal** : âge minimal d'ouverture des droits à la retraite.
- **Âge du taux plein automatique** : âge à partir duquel la décote ne s'applique plus, quelle que soit la durée validée.
- **Fonctionnaire** : agent titulaire de l'État, d'une collectivité ou d'un hôpital, qui relève d'un régime de la fonction publique et non du régime général.
- **Versant** : l'une des trois parties de la fonction publique (État, territoriale, hospitalière) ; l'État a son régime, les deux autres partagent la CNRACL.
- **Traitement** : part de la rémunération d'un fonctionnaire fixée par son indice ; seule base de sa pension.
- **Indice** : nombre de points attaché à l'échelon d'un fonctionnaire ; multiplié par la valeur du point d'indice, il donne le traitement.
- **Prime** : part de la rémunération d'un fonctionnaire hors traitement, qui n'entre pas dans le calcul de sa pension.
- **Durée de services** : trimestres passés comme fonctionnaire, qui fixent la proratisation de la pension de la fonction publique.
- **Bonification** : trimestres ajoutés à la durée de services sans avoir été travaillés (enfants nés avant 2004, certains métiers).
- **Catégorie active** : emplois de fonctionnaires à risque ou fatigue particuliers (policiers, aides-soignants, pompiers) qui ouvrent un départ avant l'âge légal après une durée de services minimale.
- **Sédentaire** : fonctionnaire qui n'est pas en catégorie active et part à l'âge légal commun.
- **Minimum garanti** : plancher de la pension d'un fonctionnaire, fonction de sa durée de services ; l'équivalent du minimum contributif.
- **Liquidation** : moment où un individu fait calculer et verser sa pension ; elle clôt sa carrière.
- **Montée en charge** : application progressive d'un nouvel âge légal ou d'une nouvelle durée requise, d'un pas par génération à partir de la première concernée.
- **Avance pour début précoce** : baisse de l'âge légal et de la durée requise d'un individu selon l'âge auquel il a commencé à cotiser, par paliers et dans une limite ; règle de scénario, absente du droit en vigueur.
- **Carrière longue** : départ anticipé avant l'âge légal, ouvert à ceux qui ont commencé à cotiser jeunes et réunissent la durée cotisée.
- **Trimestre réputé cotisé** : trimestre non cotisé qui compte quand même pour une carrière longue, dans la limite d'un plafond par type de période.
- **Inaptitude** : motif de départ qui donne le taux plein dès l'âge légal quelle que soit la durée ; regroupe ici les anciens invalides.
- **Profil** : penchants d'un individu (santé, attachement au travail, ampleur), tirés une fois entre 0 et 1 et identiques dans tous les scénarios.
- **Décision** : ce que fait un individu quand il a le choix, selon son profil, sa situation et les règles ; un penchant y est comparé à un seuil. Seul le départ est une décision pour l'instant.
- **Comportement de départ** : seuils de la décision de départ (part de ceux qui acceptent une décote, qui continuent après le taux plein), réglés sur les départs observés.
- **Trimestre validé** : unité de durée d'assurance acquise par le travail (trimestre cotisé) ou par une période assimilée.
- **Période assimilée** : période sans cotisation qui valide quand même des trimestres (chômage indemnisé, maladie, maternité).
- **Durée requise** : nombre de trimestres validés nécessaire à une génération pour le taux plein.
- **Taux plein** : taux maximal de liquidation du régime général, appliqué au salaire annuel moyen.
- **Décote** : réduction du taux de liquidation pour chaque trimestre manquant.
- **Surcote** : majoration de la pension pour chaque trimestre travaillé au-delà du taux plein après l'âge légal.
- **Point** : unité de droit du régime complémentaire, achetée par les cotisations au prix d'achat et convertie en pension à la valeur de service.
- **Compte de carrière** : droits acquis année par année au titre d'une affiliation (trimestres, salaires revalorisés, points), indépendants des règles du scénario. Une carrière qui change d'affiliation a un compte par affiliation.
- **Carrière type** : carrière théorique en emploi continu à salaire fixé, utilisée pour vérifier les règles.
- **Cadre** : salarié qui, avant 2019, acquérait des points Agirc au-dessus du PASS au lieu de points Arrco.
- **Tranche** : part du salaire entre deux multiples du PASS, à laquelle s'applique un taux de cotisation.
- **Proratisation** : rapport entre la durée validée et la durée requise, plafonné à 1, qui réduit la pension de base.
- **Coefficient d'anticipation** : minoration définitive de la pension complémentaire en cas de départ sans le taux plein.
- **Droits familiaux** : avantages de retraite liés aux enfants (trimestres supplémentaires, majoration de pension).
- **Revalorisation** : règle d'évolution annuelle des pensions déjà liquidées (prix, salaires, gel). Dans un scénario : un écart aux prix, sa durée, et le seuil de pension en dessous duquel il ne s'applique pas.
- **Suite de la pension** : ce que la première pension d'un individu devient d'année en année après son départ, en euros constants.
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
- **Élasticité** : ampleur supposée de l'effet d'une politique sur un facteur, donnée en fourchette basse, centrale, haute, d'après des évaluations publiées (`data/references/elasticites.json`).
- **Délai d'effet** : temps entre la mise en place d'une politique et son effet sur l'équation.
- **Scénario** : jeu complet de valeurs de leviers et de financement, encodable dans une URL.
- **Scénario type** : scénario tout fait qui représente une grande option du débat, sans nom de parti.
- **Scénario de référence** : scénario du droit en vigueur, auquel tous les autres sont comparés.
- **Projection** : suite des années de l'année de référence à 2070, où l'on regarde chaque année qui cotise et qui perçoit, en euros constants.
- **Année d'effet** : première année où les règles d'un scénario s'appliquent ; ceux qui sont partis avant gardent leur pension.
- **Trajectoire** : évolution d'une grandeur au fil de la projection, pour le droit en vigueur et pour un scénario.
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
- **CNRACL** : Caisse nationale de retraites des agents des collectivités locales, régime des fonctionnaires territoriaux et hospitaliers.
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
- **RAFP** : retraite additionnelle de la fonction publique, régime par points assis sur les primes dans la limite de 20 % du traitement.
- **RMPT** : rémunération moyenne par tête de l'ensemble de l'économie, référence des carrières types du COR.
- **SAM** : salaire annuel moyen, moyenne des meilleures années de salaire plafonnées et revalorisées, base du calcul CNAV.
- **SMIC** : salaire minimum interprofessionnel de croissance.
- **SRE** : Service des retraites de l'État, régime des fonctionnaires de l'État et des militaires.
- **TZCLD** : Territoires zéro chômeur de longue durée, dispositif d'embauche en CDI de chômeurs de longue durée.
- **Lura** : liquidation unique des régimes alignés ; depuis juillet 2017, une seule pension de base pour qui a relevé de plusieurs régimes alignés. Le modèle calcule encore une pension par régime, comme avant.
- **RCI** : retraite complémentaire des indépendants, par points, créée en 2013 par la fusion des régimes des artisans (1979) et des commerçants (2004).
- **SSI** : Sécurité sociale des indépendants ; ici, la retraite de base des artisans et commerçants (`ssi`), calculée comme celle du régime général sur leurs seuls revenus d'indépendant.
