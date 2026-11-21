/** Paramètres légaux normalisés, tels que le moteur les consomme. Les valeurs viennent de data/baremes. */

export type SerieAnnuelle = Readonly<Record<number, number>>;

export interface BaremeGeneration {
	/** Âge légal d'ouverture des droits, en trimestres. */
	ageLegal: number;
	/** Durée d'assurance requise pour le taux plein, en trimestres. */
	dureeRequise: number;
	/** Âge du taux plein automatique, en trimestres. */
	ageTauxPleinAutomatique: number;
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
	/** Prix d'achat du point (salaire de référence), en euros. */
	prixAchatDuPoint: SerieAnnuelle;
	/** Valeur de service du point pour l'année de référence, en euros. */
	valeurDeServiceDuPoint: number;
	/** Taux contractuel (d'acquisition) sur la tranche 1, jusqu'à 1 PASS. */
	tauxTranche1: SerieAnnuelle;
	/** Taux contractuel sur la tranche 2, au-delà de 1 PASS. */
	tauxTranche2: SerieAnnuelle;
	/** Limite haute de la tranche 2, en nombre de PASS. */
	plafondTranche2(annee: number, cadre: boolean): number;
	/** Taux d'appel de l'année de référence (1,27 = 127 %). */
	tauxAppel: number;
	/** Contributions sans points (CEG + CET) sur les tranches 1 et 2, année de référence. */
	contributions: { tranche1: number; tranche2: number };
	/** Coefficient d'anticipation selon le nombre de trimestres manquants (0 à 20). */
	coefficientAnticipation(trimestresManquants: number): number;
	majorationTroisEnfants: number;
}

export interface Baremes {
	anneeReference: number;
	cnav: BaremeCnav;
	agircArrco: BaremeAgircArrco;
}

/** Lit une série annuelle ; hors plage, renvoie la valeur de l'année connue la plus proche. */
export function valeur(serie: SerieAnnuelle, annee: number): number {
	const v = serie[annee];
	if (v !== undefined) return v;
	let proche = Number.NaN;
	let ecart = Number.POSITIVE_INFINITY;
	for (const k in serie) {
		const d = Math.abs(Number(k) - annee);
		if (d < ecart) {
			ecart = d;
			proche = serie[k] as number;
		}
	}
	if (Number.isNaN(proche)) throw new Error("Série annuelle vide");
	return proche;
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
