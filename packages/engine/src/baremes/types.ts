/** Paramètres légaux normalisés, tels que le moteur les consomme. Les valeurs viennent de data/baremes. */

export type SerieAnnuelle = Readonly<Record<number, number>>;

export interface BaremeGeneration {
	/** Âge légal d'ouverture des droits, en trimestres. */
	ageLegal: number;
	/** Durée d'assurance requise pour le taux plein, en trimestres. */
	dureeRequise: number;
	/** Âge du taux plein automatique, en trimestres. */
	ageTauxPleinAutomatique: number;
	/** Nombre de meilleures années du salaire annuel moyen, quand il diffère de la règle générale. */
	nbMeilleuresAnnees?: number;
	/** Durée de référence de la proratisation, quand elle diffère de la durée requise. */
	dureeProratisation?: number;
}

export interface BaremeCnav {
	/** Plafond annuel de la Sécurité sociale, en euros. */
	pass: SerieAnnuelle;
	/** SMIC horaire brut, en euros. */
	smicHoraire: SerieAnnuelle;
	/** Coefficients de revalorisation des salaires portés au compte, vers l'année de référence. */
	coefficientsRevalorisation: SerieAnnuelle;
	parGeneration: Readonly<Record<number, BaremeGeneration>>;
	nbMeilleuresAnnees: number;
	tauxPlein: number;
	/** Points de taux perdus par trimestre manquant (0,625 point = 0.00625). */
	decoteParTrimestre: number;
	decoteTrimestresMax: number;
	/** Majoration de pension par trimestre de surcote. */
	surcoteParTrimestre: number;
	/** Trimestres de majoration de durée d'assurance par enfant, attribués à la mère. */
	mdaParEnfant: number;
	majorationTroisEnfants: number;
	/** Jours indemnisés qui valident un trimestre assimilé. */
	joursParTrimestreAssimile: { chomage: number; maladie: number };
	/** Heures de SMIC nécessaires pour valider un trimestre, selon l'année. */
	heuresSmicParTrimestre(annee: number): number;
	minimumContributif: {
		annuel: number;
		annuelMajore: number;
		trimestresCotisesPourMajoration: number;
		/** Plafond annuel de la pension totale, tous régimes, au-delà duquel le minimum est écrêté. */
		plafondTousRegimesAnnuel: number | null;
	} | null;
	/** Taux de cotisation vieillesse (salarié + employeur) de l'année de référence. */
	tauxCotisation: { plafonne: number; deplafonne: number };
}

export interface BaremeAgircArrco {
	/**
	 * Points acquis sur une année de salaire, exprimés en points Agirc-Arrco
	 * (les points Arrco et Agirc d'avant 2019 sont convertis).
	 */
	pointsAnnee(
		annee: number,
		salaireBrut: number,
		pass: number,
		cadre: boolean,
	): number;
	/** Valeur de service du point pour l'année de référence, en euros. */
	valeurDeServiceDuPoint: number;
	/** Paramètres de cotisation de l'année de référence. */
	cotisation: {
		/** Taux contractuel sur la tranche 1, jusqu'à 1 PASS. */
		tauxTranche1: number;
		/** Taux contractuel sur la tranche 2, au-delà de 1 PASS. */
		tauxTranche2: number;
		plafondTranche2EnPass: number;
		/** Taux d'appel (1,27 = 127 %). */
		tauxAppel: number;
		/** Contribution d'équilibre général, sans points. */
		cegTranche1: number;
		cegTranche2: number;
		/** Contribution d'équilibre technique, due sur tout le salaire dès qu'il dépasse 1 PASS. */
		cet: number;
	};
	/** Coefficient d'anticipation selon le nombre de trimestres manquants (0 à 20). */
	coefficientAnticipation(trimestresManquants: number): number;
	majorationTroisEnfants: number;
}

export interface Baremes {
	anneeReference: number;
	cnav: BaremeCnav;
	agircArrco: BaremeAgircArrco;
}

const BORNES = new WeakMap<object, { min: number; max: number }>();

/** Lit une série annuelle ; hors plage, renvoie la valeur de l'année connue la plus proche. */
export function valeur(serie: SerieAnnuelle, annee: number): number {
	const v = serie[annee];
	if (v !== undefined) return v;
	let bornes = BORNES.get(serie);
	if (!bornes) {
		const annees = Object.keys(serie).map(Number);
		if (annees.length === 0) throw new Error("Série annuelle vide");
		bornes = { min: Math.min(...annees), max: Math.max(...annees) };
		BORNES.set(serie, bornes);
	}
	if (annee >= bornes.max) return serie[bornes.max] as number;
	if (annee <= bornes.min) return serie[bornes.min] as number;
	// Trou à l'intérieur de la série : on prend l'année connue précédente.
	for (let a = annee - 1; a >= bornes.min; a--) {
		const precedente = serie[a];
		if (precedente !== undefined) return precedente;
	}
	return serie[bornes.min] as number;
}

export function baremeGeneration(
	b: BaremeCnav,
	anneeNaissance: number,
): BaremeGeneration {
	const g = b.parGeneration[anneeNaissance];
	if (g) return g;
	const annees = Object.keys(b.parGeneration).map(Number);
	if (annees.length === 0) throw new Error("Barème par génération vide");
	const borne =
		anneeNaissance < Math.min(...annees)
			? Math.min(...annees)
			: Math.max(...annees);
	return b.parGeneration[borne] as BaremeGeneration;
}
