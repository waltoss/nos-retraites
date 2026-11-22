/** Vocabulaire : voir CONTEXT.md à la racine. */

export type Sexe = "F" | "H";

export type Etat =
	| "emploi"
	| "chomage"
	| "maladieMaternite"
	| "inactivite"
	| "retraite";

/**
 * Affiliation : le statut sous lequel une année est travaillée, qui ouvre des droits dans un ou
 * plusieurs régimes (`prive` : régime général et Agirc-Arrco). `autre` : un régime que le modèle
 * ne simule pas, dont l'année ne compte que pour la durée tous régimes.
 */
export type AffiliationId =
	| "prive"
	| "sre"
	| "cnracl"
	| "militaire"
	| "artisan"
	| "commercant"
	| "autre"
	| (string & {});

/** Les deux métiers d'indépendant que le modèle simule : même régime, histoires différentes. */
export type MetierIndependant = "artisan" | "commercant";

/** Vrai pour une année d'artisan ou de commerçant. */
export function estIndependant(a: { affiliation: AffiliationId }): boolean {
	return a.affiliation === "artisan" || a.affiliation === "commercant";
}

/** Régime : la caisse qui verse une pension et à laquelle une politique peut s'adresser. */
export type RegimeId =
	| "cnav"
	| "agircArrco"
	| "sre"
	| "cnracl"
	| "militaire"
	| "ssi"
	| "rci"
	| (string & {});

/** Une année de carrière. L'individu est supposé né un 1er janvier : l'année civile et l'âge coïncident. */
export type AnneeCarriere = {
	annee: number;
	/** Affiliation de l'année : elle vaut aussi pour les mois hors emploi, validés par le même régime. */
	affiliation: AffiliationId;
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
	 * Année de fonctionnaire : primes de l'année, comprises dans le salaire brut. Le reste du salaire
	 * est le traitement, seule base de la pension de la fonction publique.
	 */
	primes?: number;
	/** Année d'apprentissage ou d'alternance, avant l'entrée dans la vie active : un petit salaire, des droits entiers. */
	alternance?: boolean;
	/** Année validée au titre de l'AVPF : 4 trimestres et un salaire au SMIC portés au compte. */
	avpf?: boolean;
};

/**
 * Profil : les penchants d'un individu, tirés une fois entre 0 et 1 et identiques dans tous les
 * scénarios. Ce ne sont pas des comportements : une décision compare un penchant à un seuil que
 * les hypothèses et les politiques déplacent (voir `decisions.ts`).
 */
export type Profil = {
	/** Santé : sous la part des inaptes, taux plein dès l'âge légal faute d'emploi et de durée. */
	sante: number;
	/** Attachement au travail : bas, départ avec une décote ; haut, poursuite après le taux plein. */
	attachementTravail: number;
	/** Ampleur de ce choix : trimestres de décote acceptés, ou durée de la poursuite d'activité. */
	ampleur: number;
};

/** Profil de départ tiré d'un seul nombre entre 0 et 1 : trois penchants indépendants. */
export function profilDepuis(u: number): Profil {
	return {
		sante: u % 1,
		attachementTravail: (u * 7919) % 1,
		ampleur: (u * 104729) % 1,
	};
}

export type Carriere = {
	anneeNaissance: number;
	sexe: Sexe;
	/** Années de naissance des enfants. */
	enfants: number[];
	cadre: boolean;
	/** Années successives, de l'entrée dans la vie active jusqu'à la fin de l'horizon simulé. */
	annees: AnneeCarriere[];
	/** Penchants de l'individu. Absent, il part dès le taux plein. */
	profil?: Profil;
	/**
	 * Ce qu'il faut savoir d'un fonctionnaire pour calculer sa pension. Le régime est celui de ses
	 * années de fonctionnaire (`affiliation`) ; il est répété ici pour classer la carrière entière.
	 */
	fonctionPublique?: StatutFonctionnaire;
};

export type RegimeFonctionPublique = "sre" | "cnracl" | "militaire";
export type CategorieFonctionnaire = "sedentaire" | "actif" | "superActif";

export type StatutFonctionnaire = {
	/** SRE pour les civils de l'État, CNRACL pour les collectivités et les hôpitaux, militaire pour les armées et la gendarmerie. */
	regime: RegimeFonctionPublique;
	categorie: CategorieFonctionnaire;
	/** Âge, en années, d'une mise à la retraite pour invalidité : la pension est versée dès cet âge, sans décote. */
	ageInvalidite?: number;
	/**
	 * Militaire : âge, en années, où il quitte l'armée avec une pension versée tout de suite.
	 * Cet âge dépend de ses années de services, pas de l'âge légal.
	 */
	ageRadiation?: number;
	/** Militaire : trimestres de bonification pour campagnes et services aériens ou sous-marins. */
	bonifications?: number;
};

export type Individu = {
	id: number;
	poids: number;
	carriere: Carriere;
};

/** Âge exprimé en trimestres entiers (4 × années + trimestres). */
export type AgeTrimestres = number;

export type Liquidation = {
	age: AgeTrimestres;
	/** Année civile du départ. */
	annee: number;
};

export type DetailCnav = {
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
};

export type DetailAgircArrco = {
	points: number;
	coefficientAnticipation: number;
	majorationEnfants: number;
	/** Pension annuelle brute, en euros de l'année de référence. */
	pensionAnnuelle: number;
};

export type DetailFonctionPublique = {
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
	/** Motif du départ quand ce n'est pas l'ancienneté. */
	motif?: "invalidite";
	/** Rente annuelle de la retraite additionnelle sur les primes ; nulle quand les points sont versés en capital. */
	rafp: number;
	/** Pension annuelle brute du régime, hors retraite additionnelle, en euros de l'année de référence. */
	pensionAnnuelle: number;
};

export type DetailRci = {
	points: number;
	/** Part de la pension servie quand la retraite de base n'est pas au taux plein. */
	coefficientAbattement: number;
	/** Vrai quand trop peu de points donnent un capital versé une fois au lieu d'une pension. */
	versementUnique: boolean;
	/** Pension annuelle brute, en euros de l'année de référence. */
	pensionAnnuelle: number;
};

/** Ce que tout régime dit de la pension qu'il verse. */
export type DetailRegime = {
	/** Pension annuelle brute versée par le régime, en euros de l'année de référence. */
	pensionAnnuelle: number;
};

/** Le détail propre à chaque régime connu ; un régime ajouté au modèle donne au moins un `DetailRegime`. */
export type DetailsConnus = {
	cnav: DetailCnav;
	agircArrco: DetailAgircArrco;
	sre: DetailFonctionPublique;
	cnracl: DetailFonctionPublique;
	militaire: DetailFonctionPublique;
	/** Retraite de base des indépendants, calculée comme celle du régime général. */
	ssi: DetailCnav;
	rci: DetailRci;
};

export type DetailsParRegime = Partial<DetailsConnus> &
	Record<string, DetailRegime | undefined>;

/**
 * Durée et taux tels que les voit l'affiliation principale, celle qui décide du départ :
 * ce qui se compare d'un régime à l'autre.
 */
export type Duree = {
	/** Durée d'assurance tous régimes, en trimestres. */
	trimestresValides: number;
	dureeRequise: number;
	trimestresDecote: number;
	trimestresSurcote: number;
	/** Vrai quand un minimum de pension a relevé la pension de base. */
	minimumApplique: boolean;
	/** Motif du départ quand ce n'est pas le cas général. */
	motif?: "carriereLongue" | "inaptitude" | "invalidite";
};

export type Pension = {
	liquidation: Liquidation;
	/** Affiliation qui a décidé du départ : celle où l'individu a le plus travaillé. */
	affiliation: AffiliationId;
	duree: Duree;
	/** Une pension par régime où l'individu a acquis des droits. */
	parRegime: DetailsParRegime;
	/** Pension mensuelle brute totale, en euros de l'année de référence. */
	mensuelleBrute: number;
};

/** Détail d'un régime dans une pension ; une erreur si l'individu n'y a acquis aucun droit. */
export function detail<K extends keyof DetailsConnus>(
	p: Pension,
	regime: K,
): DetailsConnus[K] {
	const d = p.parRegime[regime];
	if (!d) throw new Error(`Pas de pension du régime ${regime}`);
	return d as DetailsConnus[K];
}

/** Détail de la fonction publique, quel que soit le régime (État, collectivités et hôpitaux, militaires). */
export function detailFonctionPublique(
	p: Pension,
): DetailFonctionPublique | undefined {
	return p.parRegime.sre ?? p.parRegime.cnracl ?? p.parRegime.militaire;
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
