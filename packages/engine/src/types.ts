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
	etat: Etat;
	/** Salaire brut annuel en euros courants ; 0 hors emploi. */
	salaireBrut: number;
	/** Quotité de travail quand elle est inférieure à un temps plein. */
	quotite?: number;
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
	trimestresMda: number;
	dureeRequise: number;
	tauxLiquidation: number;
	trimestresDecote: number;
	trimestresSurcote: number;
	proratisation: number;
	majorationEnfants: number;
	minimumContributifApplique: boolean;
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

export interface Pension {
	liquidation: Liquidation;
	cnav: DetailCnav;
	agircArrco: DetailAgircArrco;
	/** Pension mensuelle brute totale, en euros de l'année de référence. */
	mensuelleBrute: number;
}
