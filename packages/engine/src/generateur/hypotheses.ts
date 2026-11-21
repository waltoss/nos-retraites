import donnees from "./hypotheses.data.json" with { type: "json" };

/**
 * Hypothèses du générateur de carrières.
 *
 * Ce ne sont PAS des paramètres légaux ni des statistiques publiées : ce sont les
 * paramètres libres du modèle. Une partie est ajustée par `scripts/calage.ts` sur les
 * durées de carrière et les pensions de la génération 1953 (Drees, EIR 2020) ; le reste
 * est posé à la main.
 */
export interface Hypotheses {
	/** Part de femmes dans une génération. */
	partFemmes: number;
	/** Âge d'entrée dans la vie active : moyenne, écart-type, effet du rang de salaire (années par écart-type). */
	ageEntree: {
		moyenne: number;
		ecartType: number;
		effetRang: number;
		min: number;
		max: number;
	};
	/**
	 * Décalage de l'âge d'entrée selon la génération, en années, par rapport aux générations récentes :
	 * points (année de naissance, décalage). Les générations anciennes ont commencé plus tôt.
	 */
	decalageEntree: ReadonlyArray<readonly [generation: number, annees: number]>;
	/**
	 * Carrières partielles : individus présents dans le système une partie seulement de leur vie active
	 * (arrivée tardive en France, départ à l'étranger, activité non déclarée).
	 */
	carrierePartielle: {
		part: { F: number; H: number };
		dureeMin: number;
		dureeMax: number;
	};
	/**
	 * Polypensionnés : part des individus qui passent une partie de leur vie active dans un autre
	 * régime (fonction publique, indépendants, agriculture), et bornes de cette partie, en part
	 * de la vie active. Elle se place au début ou à la fin de la carrière, à chances égales.
	 */
	autreRegime: {
		part: { F: number; H: number };
		dureeMin: number;
		dureeMax: number;
	};
	/** Salaire à temps plein, en part du PASS, pour un individu médian : points (âge, part du PASS). */
	profilSalaire: ReadonlyArray<readonly [age: number, partDuPass: number]>;
	/** Multiplicateur d'ensemble du profil de salaire. */
	niveauSalaire: number;
	/** Dispersion du niveau permanent de salaire (écart-type du logarithme). */
	sigmaPermanent: number;
	/** Dispersion des chocs annuels de salaire (écart-type du logarithme). */
	sigmaTransitoire: number;
	/**
	 * Haut de la distribution : au-dessus de ce rang (en écarts-types), le salaire croît plus vite
	 * que la loi log-normale, de cette pente par écart-type. Réglé sur les centiles 95 et 99 de l'Insee.
	 */
	queueSalaire: { seuil: number; pente: { F: number; H: number } };
	/** Pente de salaire supplémentaire par année d'âge et par écart-type de rang. */
	penteRang: number;
	/** Rapport du salaire des femmes à celui des hommes, à caractéristiques égales. */
	ecartSalaireFemmes: number;
	/**
	 * Part des individus qui sont cadres, les mieux classés par le salaire, selon la génération :
	 * points (année de naissance, part). Réglée sur la part des retraités qui ont des droits Agirc
	 * (31 % des hommes, 13 % des femmes en 2018) et, pour les générations récentes, sur la part
	 * des cadres parmi les cotisants (26 % et 22 % en 2024), relevée comme chez les hommes
	 * pour passer d'une photographie à une carrière entière.
	 */
	partCadres: {
		F: ReadonlyArray<readonly [generation: number, part: number]>;
		H: ReadonlyArray<readonly [generation: number, part: number]>;
	};
	/** Répartition du nombre d'enfants (indice = nombre d'enfants). */
	repartitionEnfants: ReadonlyArray<number>;
	agePremierEnfant: { moyenne: number; ecartType: number };
	ecartEntreEnfants: number;
	/** Probabilité, chaque année passée en emploi, de commencer une période hors emploi (individu médian). */
	depuisEmploi: { chomage: number; maladie: number; inactivite: number };
	/** Sensibilité du risque de chômage au rang de salaire (multiplicateur par écart-type en moins). */
	risqueRang: number;
	/** Durée moyenne des périodes hors emploi, en mois ; le congé maternité a une durée fixe. */
	dureeMois: {
		chomage: number;
		maladie: number;
		inactivite: number;
		maternite: number;
	};
	/**
	 * Probabilité qu'une mère interrompe son activité après un congé maternité, durée moyenne de
	 * l'interruption en mois, et part des interruptions qui sont définitives.
	 */
	interruptionNaissance: {
		probabilite: number;
		dureeMois: number;
		partDefinitive: number;
	};
	/**
	 * Part des mères au foyer qui remplissent la condition de ressources de l'AVPF.
	 * Simplification : le droit est ouvert tant que le plus jeune enfant a moins de 3 ans,
	 * ou moins de 21 ans dans une famille de 3 enfants ou plus.
	 */
	avpf: { part: number };
	/** Pente de la probabilité d'interruption par génération après 1953 (par an, relative), bornée à zéro. */
	tendanceInterruption: number;
	/**
	 * Temps partiel des femmes : la part de salariées à temps partiel de chaque année (Dares) est
	 * multipliée par `meres` tant qu'un enfant a moins de 12 ans, et par `autres` sinon.
	 * Les deux sont choisis pour que l'ensemble retrouve la part publiée ; le premier est une hypothèse.
	 */
	tempsPartielFemmes: { meres: number; autres: number };
	/** Après cet âge, les sorties de l'emploi sont plus fréquentes et les périodes hors emploi plus longues. */
	seniors: {
		age: number;
		multiplicateurSorties: number;
		multiplicateurDurees: number;
	};
	depart: ComportementDepart;
	/** Largeur de la zone juste au-dessus du SMIC où sont étalés les salaires que le modèle placerait dessous. */
	etalementSmic: number;
	/** Heures annuelles d'un temps plein, pour le plancher au SMIC. */
	heuresAnnuelles: number;
}

/**
 * Comportement de départ : ce que font les individus quand ils ont le choix.
 * Parts réglées sur les départs observés au régime général (`data/references/departs.json`).
 */
export interface ComportementDepart {
	/**
	 * Part de ceux qui n'ont ni emploi ni durée suffisante à l'âge légal et obtiennent
	 * le taux plein dès cet âge, au titre de l'inaptitude ou de l'invalidité.
	 */
	partInaptitude: number;
	/** Part de ceux à qui il manque des trimestres et qui acceptent une décote. */
	partDecote: number;
	/** Nombre maximal de trimestres de décote acceptés ; chacun a son seuil entre 1 et ce maximum. */
	trimestresDecoteMax: number;
	/** Part de ceux qui atteignent le taux plein en emploi et continuent de travailler. */
	partSurcote: number;
	/** Durée moyenne de cette poursuite d'activité, en trimestres. */
	trimestresSurcote: number;
}

/** Valeurs calées par `scripts/calage.ts`, qui réécrit `hypotheses.data.json`. */
export const HYPOTHESES: Hypotheses = donnees as unknown as Hypotheses;

/**
 * Facteurs d'un scénario : multiplicateurs appliqués aux hypothèses du générateur.
 * Ils valent pour toute la carrière de toutes les générations, comme si la situation
 * avait toujours été celle-là : c'est une comparaison d'états, pas une projection.
 */
export interface Facteurs {
	/** Multiplicateur du risque annuel de chômage. */
	chomage?: number;
	/** Multiplicateur de la probabilité d'interruption d'activité après une naissance. */
	interruptionsNaissance?: number;
	/** Multiplicateur du temps partiel des mères de jeunes enfants. */
	tempsPartielMeres?: number;
	/** Multiplicateur des sorties de l'emploi après 55 ans. */
	sortiesSeniors?: number;
	/** Rapport du salaire des femmes à celui des hommes. */
	ecartSalaireFemmes?: number;
}

export function appliquerFacteurs(h: Hypotheses, f: Facteurs = {}): Hypotheses {
	return {
		...h,
		depuisEmploi: {
			...h.depuisEmploi,
			chomage: h.depuisEmploi.chomage * (f.chomage ?? 1),
		},
		interruptionNaissance: {
			...h.interruptionNaissance,
			probabilite: Math.min(
				1,
				h.interruptionNaissance.probabilite * (f.interruptionsNaissance ?? 1),
			),
		},
		tempsPartielFemmes: {
			...h.tempsPartielFemmes,
			meres: h.tempsPartielFemmes.meres * (f.tempsPartielMeres ?? 1),
		},
		seniors: {
			...h.seniors,
			multiplicateurSorties:
				h.seniors.multiplicateurSorties * (f.sortiesSeniors ?? 1),
		},
		ecartSalaireFemmes: f.ecartSalaireFemmes ?? h.ecartSalaireFemmes,
	};
}
