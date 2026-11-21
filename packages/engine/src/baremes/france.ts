import data from "./france.data.json" with { type: "json" };
import { type Baremes, type SerieAnnuelle, valeur } from "./types.ts";

/**
 * Barèmes français, générés par scripts/build-baremes.ts à partir de data/baremes.
 *
 * Simplifications du calcul des points de retraite complémentaire avant 2019 :
 * - avant 1999, la caisse Arrco est supposée être l'UNIRS, dont les points sont convertis en points Arrco ;
 * - les taux sont les taux minimaux obligatoires (entreprises créées avant 1997 pour l'Arrco, avant 1981 pour l'Agirc) ;
 * - la garantie minimale de points des cadres n'est pas modélisée ;
 * - avant 1960, les points sont reconstitués au barème de 1960, à salaire égal en part du plafond.
 */
const a = data.agircArrco;
const serie = (s: Record<string, number>) => s as unknown as SerieAnnuelle;
const tranche = (salaire: number, bas: number, haut: number) =>
	Math.max(0, Math.min(salaire, haut) - bas);

/** Première année des séries de prix d'achat du point. */
const PREMIERE_ANNEE_POINTS = Math.min(
	...Object.keys(a.prixAchat.unirs).map(Number),
);

function pointsAnnee(
	annee: number,
	salaireBrut: number,
	pass: number,
	cadre: boolean,
): number {
	if (annee < PREMIERE_ANNEE_POINTS) {
		// Avant la première année connue, les droits sont reconstitués comme si le salaire,
		// à même distance du plafond, avait été perçu cette année-là.
		return pointsAnnee(
			PREMIERE_ANNEE_POINTS,
			(salaireBrut / pass) *
				valeur(serie(data.cnav.pass), PREMIERE_ANNEE_POINTS),
			valeur(serie(data.cnav.pass), PREMIERE_ANNEE_POINTS),
			cadre,
		);
	}
	if (annee >= 2019) {
		return (
			(tranche(salaireBrut, 0, pass) * a.tauxContractuel.tranche1 +
				tranche(salaireBrut, pass, 8 * pass) * a.tauxContractuel.tranche2) /
			valeur(serie(a.prixAchat.agircArrco), annee)
		);
	}
	// Points Arrco : prix d'achat Arrco depuis 1999, UNIRS converti avant.
	const prixArrco =
		annee >= 1999
			? valeur(serie(a.prixAchat.arrco), annee)
			: valeur(serie(a.prixAchat.unirs), annee) / a.conversion.unirs;
	let cotisationsArrco =
		tranche(salaireBrut, 0, pass) *
		valeur(serie(a.tauxContractuel.arrcoTranche1), annee);
	let pointsAgirc = 0;
	if (cadre) {
		const cotisationsAgirc =
			tranche(salaireBrut, pass, 4 * pass) *
				valeur(serie(a.tauxContractuel.agircTrancheB), annee) +
			(annee >= 1991
				? tranche(salaireBrut, 4 * pass, 8 * pass) *
					valeur(serie(a.tauxContractuel.agircTrancheC), annee)
				: 0);
		pointsAgirc =
			(cotisationsAgirc / valeur(serie(a.prixAchat.agirc), annee)) *
			a.conversion.agirc;
	} else {
		cotisationsArrco +=
			tranche(salaireBrut, pass, 3 * pass) *
			valeur(serie(a.tauxContractuel.arrcoTranche2), annee);
	}
	return cotisationsArrco / prixArrco + pointsAgirc;
}

export const BAREMES_FRANCE: Baremes = {
	anneeReference: data.anneeReference,
	cnav: {
		pass: serie(data.cnav.pass),
		smicHoraire: serie(data.cnav.smicHoraire),
		coefficientsRevalorisation: serie(data.cnav.coefficientsRevalorisation),
		parGeneration: data.cnav
			.parGeneration as unknown as Baremes["cnav"]["parGeneration"],
		nbMeilleuresAnnees: data.cnav.nbMeilleuresAnnees,
		tauxPlein: data.cnav.tauxPlein,
		decoteParTrimestre: data.cnav.decoteParTrimestre,
		decoteTrimestresMax: data.cnav.decoteTrimestresMax,
		surcoteParTrimestre: data.cnav.surcoteParTrimestre,
		mdaParEnfant: data.cnav.mdaParEnfant,
		majorationTroisEnfants: data.cnav.majorationTroisEnfants,
		// service-public.gouv.fr, fiches F31249 et F1761 (voir data/baremes/cnav.json, periodesAssimilees).
		joursParTrimestreAssimile: { chomage: 50, maladie: 60 },
		heuresSmicParTrimestre: (annee) => (annee >= 2014 ? 150 : 200),
		minimumContributif: data.cnav.minimumContributif,
		tauxCotisation: data.cnav.tauxCotisation,
	},
	agircArrco: {
		pointsAnnee,
		valeurDeServiceDuPoint: a.valeurDeServiceDuPoint,
		cotisation: {
			tauxTranche1: a.tauxContractuel.tranche1,
			tauxTranche2: a.tauxContractuel.tranche2,
			plafondTranche2EnPass: 8,
			tauxAppel: a.tauxAppel,
			cegTranche1: a.cegTranche1,
			cegTranche2: a.cegTranche2,
			cet: a.cet,
		},
		coefficientAnticipation: (n) =>
			a.coefficientsAnticipation[
				Math.max(
					0,
					Math.min(a.coefficientsAnticipation.length - 1, Math.round(n)),
				)
			] as number,
		majorationTroisEnfants: a.majorationTroisEnfants,
	},
};
