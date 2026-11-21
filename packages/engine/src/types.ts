/** Vocabulaire : voir CONTEXT.md à la racine. */

export type Sexe = "F" | "H";

export type Etat =
	| "emploi"
	| "chomage"
	| "maladieMaternite"
	| "inactivite"
	| "retraite";

/** Une année de carrière. L'individu est supposé né un 1er janvier : l'année civile et l'âge coïncident. */
export interface AnneeCarriere {
	annee: number;
	/** État où l'individu a passé le plus de mois dans l'année. */
	etat: Etat;
	/** Salaire brut perçu dans l'année, en euros courants. */
	salaireBrut: number;
	/**
	 * Mois passés en emploi, au chômage, en maladie ou maternité ; le reste de l'année est de l'inactivité.
	 * Absents, l'année entière est passée dans l'état indiqué.
	 */
	moisEmploi?: number;
	moisChomage?: number;
	moisMaladie?: number;
	/** Quotité de travail quand elle est inférieure à un temps plein. */
	quotite?: number;
	/**
	 * Année travaillée dans un autre régime (fonction publique, indépendants, agriculture) :
	 * elle compte pour la durée tous régimes, sans salaire porté au compte ni points.
	 */
	autreRegime?: boolean;
	/**
	 * Primes de l'année, comprises dans le salaire brut. Leur présence marque une année de fonctionnaire :
	 * le reste du salaire est le traitement, seule base de la pension de la fonction publique.
	 */
	primes?: number;
	/** Année validée au titre de l'AVPF : 4 trimestres et un salaire au SMIC portés au compte. */
	avpf?: boolean;
}

export interface Carriere {
	anneeNaissance: number;
	sexe: Sexe;
	/** Années de naissance des enfants. */
	enfants: number[];
	cadre: boolean;
	/** Années successives, de l'entrée dans la vie active jusqu'à la fin de l'horizon simulé. */
	annees: AnneeCarriere[];
	/**
	 * Tirage entre 0 et 1 propre à l'individu, qui fixe son comportement de départ
	 * (inaptitude, départ avec décote, poursuite d'activité). Absent, il part dès le taux plein.
	 */
	tirageDepart?: number;
	/** Présent, la carrière relève de la fonction publique : les années sans primes sont celles d'un autre régime. */
	fonctionPublique?: StatutFonctionnaire;
}

export type RegimeFonctionPublique = "sre" | "cnracl";
export type CategorieFonctionnaire = "sedentaire" | "actif" | "superActif";

export interface StatutFonctionnaire {
	/** SRE pour l'État, CNRACL pour les collectivités et les hôpitaux. */
	regime: RegimeFonctionPublique;
	categorie: CategorieFonctionnaire;
}

export interface Individu {
	id: number;
	poids: number;
	carriere: Carriere;
}

/** Âge exprimé en trimestres entiers (4 × années + trimestres). */
export type AgeTrimestres = number;

export interface Liquidation {
	age: AgeTrimestres;
	/** Année civile du départ. */
	annee: number;
}

export interface DetailCnav {
	salaireAnnuelMoyen: number;
	trimestresValides: number;
	trimestresCotises: number;
	/** Trimestres validés dans d'autres régimes : comptés dans la durée validée, pas dans la proratisation. */
	trimestresAutresRegimes: number;
	trimestresMda: number;
	dureeRequise: number;
	tauxLiquidation: number;
	trimestresDecote: number;
	trimestresSurcote: number;
	proratisation: number;
	majorationEnfants: number;
	minimumContributifApplique: boolean;
	/** Motif du départ quand ce n'est pas le cas général. */
	motif?: "carriereLongue" | "inaptitude";
	/** Pension annuelle brute, en euros de l'année de référence. */
	pensionAnnuelle: number;
}

export interface DetailAgircArrco {
	points: number;
	coefficientAnticipation: number;
	majorationEnfants: number;
	/** Pension annuelle brute, en euros de l'année de référence. */
	pensionAnnuelle: number;
}

export interface DetailFonctionPublique {
	/** Traitement annuel de référence, en euros de l'année de référence : celui des six derniers mois, ou la moyenne des meilleures années d'un scénario. */
	traitementDeReference: number;
	/** Durée de services, en trimestres. */
	services: number;
	bonifications: number;
	/** Durée d'assurance tous régimes, qui fixe la décote et la surcote. */
	trimestresValides: number;
	dureeRequise: number;
	/** Taux appliqué au traitement de référence, proratisation comprise, avant décote et surcote. */
	tauxLiquidation: number;
	trimestresDecote: number;
	trimestresSurcote: number;
	majorationEnfants: number;
	minimumGarantiApplique: boolean;
	/** Rente annuelle de la retraite additionnelle sur les primes ; nulle quand les points sont versés en capital. */
	rafp: number;
	/** Pension annuelle brute du régime, hors retraite additionnelle, en euros de l'année de référence. */
	pensionAnnuelle: number;
}

export interface Pension {
	liquidation: Liquidation;
	cnav: DetailCnav;
	agircArrco: DetailAgircArrco;
	/** Présent pour une carrière de fonctionnaire ; les deux autres détails sont alors vides. */
	fonctionPublique?: DetailFonctionPublique;
	/** Pension mensuelle brute totale, en euros de l'année de référence. */
	mensuelleBrute: number;
}

/** Mois de l'année passés dans chaque état. */
export function moisParEtat(a: AnneeCarriere): {
	emploi: number;
	chomage: number;
	maladie: number;
} {
	if (a.moisEmploi === undefined)
		return {
			emploi: a.etat === "emploi" ? 12 : 0,
			chomage: a.etat === "chomage" ? 12 : 0,
			maladie: a.etat === "maladieMaternite" ? 12 : 0,
		};
	return {
		emploi: a.moisEmploi,
		chomage: a.moisChomage ?? 0,
		maladie: a.moisMaladie ?? 0,
	};
}
