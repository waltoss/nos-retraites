import type { Baremes, Carriere, Etat, Sexe } from "../src/index.ts";

/** Barème fictif aux chiffres ronds, pour vérifier les formules à la main. */
export const BAREMES_FICTIFS: Baremes = {
	anneeReference: 2025,
	cnav: {
		pass: { 2000: 40000 },
		smicHoraire: { 2000: 10 },
		coefficientsRevalorisation: { 2000: 1 },
		parGeneration: {
			1960: { ageLegal: 62 * 4, dureeRequise: 168, ageTauxPleinAutomatique: 67 * 4 },
		},
		nbMeilleuresAnnees: 25,
		tauxPlein: 0.5,
		decoteParTrimestre: 0.00625,
		decoteTrimestresMax: 20,
		surcoteParTrimestre: 0.0125,
		mdaParEnfant: 8,
		majorationTroisEnfants: 0.1,
		heuresSmicParTrimestre: () => 150,
		minimumContributif: null,
		tauxCotisation: { plafonne: 0.15, deplafonne: 0.02 },
	},
	agircArrco: {
		prixAchatDuPoint: { 2000: 20 },
		valeurDeServiceDuPoint: 1.4,
		tauxTranche1: { 2000: 0.06 },
		tauxTranche2: { 2000: 0.16 },
		plafondTranche2: () => 8,
		tauxAppel: 1.25,
		contributions: { tranche1: 0.02, tranche2: 0.03 },
		coefficientAnticipation: (n) => 1 - 0.01 * n,
		majorationTroisEnfants: 0.1,
	},
};

/** Carrière continue en emploi entre deux âges inclus, au salaire constant. */
export function carriereContinue(
	ageDebut: number,
	ageFin: number,
	salaireBrut: number,
	options: { sexe?: Sexe; enfants?: number[]; anneeNaissance?: number; etat?: Etat } = {},
): Carriere {
	const anneeNaissance = options.anneeNaissance ?? 1960;
	const annees = [];
	for (let age = ageDebut; age <= ageFin; age++) {
		annees.push({ annee: anneeNaissance + age, etat: options.etat ?? ("emploi" as Etat), salaireBrut });
	}
	return { anneeNaissance, sexe: options.sexe ?? "H", enfants: options.enfants ?? [], cadre: false, annees };
}
