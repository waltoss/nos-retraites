import type { Baremes } from "./types.ts";

/** Barème fictif aux chiffres ronds, pour vérifier les formules à la main. */
export const BAREMES_FICTIFS: Baremes = {
	anneeReference: 2025,
	cnav: {
		pass: { 2000: 40000 },
		smicHoraire: { 2000: 10 },
		coefficientsRevalorisation: { 2000: 1 },
		parGeneration: {
			1960: {
				ageLegal: 62 * 4,
				dureeRequise: 168,
				ageTauxPleinAutomatique: 67 * 4,
			},
		},
		nbMeilleuresAnnees: 25,
		tauxPlein: 0.5,
		decoteParTrimestre: 0.00625,
		decoteTrimestresMax: 20,
		surcoteParTrimestre: 0.0125,
		mdaParEnfant: 8,
		majorationTroisEnfants: 0.1,
		joursParTrimestreAssimile: { chomage: 50, maladie: 60 },
		heuresSmicParTrimestre: () => 150,
		minimumContributif: null,
		tauxCotisation: { plafonne: 0.15, deplafonne: 0.02 },
	},
	agircArrco: {
		pointsAnnee: (_annee, salaire, pass) =>
			(Math.min(salaire, pass) * 0.06 +
				Math.max(0, Math.min(salaire, 8 * pass) - pass) * 0.16) /
			20,
		valeurDeServiceDuPoint: 1.4,
		cotisation: {
			tauxTranche1: 0.06,
			tauxTranche2: 0.16,
			plafondTranche2EnPass: 8,
			tauxAppel: 1.25,
			cegTranche1: 0.02,
			cegTranche2: 0.03,
			cet: 0.004,
		},
		coefficientAnticipation: (n) => 1 - 0.01 * n,
		majorationTroisEnfants: 0.1,
	},
};
