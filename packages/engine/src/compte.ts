import { type Baremes, valeur } from "./baremes/types.ts";
import type { AgeTrimestres, Carriere } from "./types.ts";

/** Droits acquis année par année, calculés une fois par carrière. */
export interface CompteCarriere {
	ageDebut: number;
	trimestresCotises: Float64Array;
	trimestresAssimiles: Float64Array;
	/** Salaire plafonné au PASS puis revalorisé vers l'année de référence. */
	salairesRevalorises: Float64Array;
	points: Float64Array;
}

export function buildCompte(carriere: Carriere, b: Baremes): CompteCarriere {
	const n = carriere.annees.length;
	const compte: CompteCarriere = {
		ageDebut: n > 0 ? (carriere.annees[0]?.annee ?? 0) - carriere.anneeNaissance : 0,
		trimestresCotises: new Float64Array(n),
		trimestresAssimiles: new Float64Array(n),
		salairesRevalorises: new Float64Array(n),
		points: new Float64Array(n),
	};
	const aa = b.agircArrco;
	let derniersPoints = 0;
	for (let i = 0; i < n; i++) {
		const a = carriere.annees[i];
		if (!a) continue;
		const pass = valeur(b.cnav.pass, a.annee);
		if (a.etat === "emploi" && a.salaireBrut > 0) {
			const seuil =
				b.cnav.heuresSmicParTrimestre(a.annee) *
				valeur(b.cnav.smicHoraire, a.annee);
			const cotises = Math.min(4, Math.floor(a.salaireBrut / seuil));
			compte.trimestresCotises[i] = cotises;
			if (cotises > 0) {
				compte.salairesRevalorises[i] =
					Math.min(a.salaireBrut, pass) *
					valeur(b.cnav.coefficientsRevalorisation, a.annee);
			}
			const tranche1 = Math.min(a.salaireBrut, pass);
			const plafond2 = aa.plafondTranche2(a.annee, carriere.cadre) * pass;
			const tranche2 = Math.max(0, Math.min(a.salaireBrut, plafond2) - pass);
			derniersPoints =
				(tranche1 * valeur(aa.tauxTranche1, a.annee) +
					tranche2 * valeur(aa.tauxTranche2, a.annee)) /
				valeur(aa.prixAchatDuPoint, a.annee);
			compte.points[i] = derniersPoints;
		} else if (a.etat === "chomage" || a.etat === "maladieMaternite") {
			// Période assimilée : 4 trimestres validés, points attribués sur la base du dernier salaire.
			compte.trimestresAssimiles[i] = 4;
			compte.points[i] = derniersPoints;
		}
	}
	return compte;
}

export interface Cumul {
	trimestresCotises: number;
	trimestresAssimiles: number;
	points: number;
}

/** Droits cumulés jusqu'à un âge donné ; l'année en cours compte au prorata des trimestres écoulés. */
export function cumulJusqua(compte: CompteCarriere, age: AgeTrimestres): Cumul {
	const anneesPleines = Math.floor(age / 4) - compte.ageDebut;
	const fraction = (age % 4) / 4;
	let cotises = 0;
	let assimiles = 0;
	let points = 0;
	const n = compte.points.length;
	for (let i = 0; i < n && i < anneesPleines; i++) {
		cotises += compte.trimestresCotises[i] as number;
		assimiles += compte.trimestresAssimiles[i] as number;
		points += compte.points[i] as number;
	}
	if (fraction > 0 && anneesPleines >= 0 && anneesPleines < n) {
		const max = age % 4;
		cotises += Math.min(max, compte.trimestresCotises[anneesPleines] as number);
		assimiles += Math.min(max, compte.trimestresAssimiles[anneesPleines] as number);
		points += (compte.points[anneesPleines] as number) * fraction;
	}
	return { trimestresCotises: cotises, trimestresAssimiles: assimiles, points };
}
