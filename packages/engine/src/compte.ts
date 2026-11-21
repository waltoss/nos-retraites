import { type Baremes, valeur } from "./baremes/types.ts";
import type { AgeTrimestres, Carriere } from "./types.ts";

/**
 * Heures annuelles du salaire forfaitaire de l'AVPF (169 heures par mois).
 * Source : barèmes IPP, « Assurance vieillesse des parents au foyer »,
 * https://www.ipp.eu/baremes-ipp/prestations-sociales/prestations_sociales.solidarite_insertion.minimum_vieillesse.avpf/table
 * (consulté le 2026-11-21). Simplification : SMIC de l'année et non du 1er juillet précédent.
 */
const HEURES_AVPF = 169 * 12;

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
		ageDebut:
			n > 0 ? (carriere.annees[0]?.annee ?? 0) - carriere.anneeNaissance : 0,
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
			derniersPoints = aa.pointsAnnee(
				a.annee,
				a.salaireBrut,
				pass,
				carriere.cadre,
			);
			compte.points[i] = derniersPoints;
		} else if (a.avpf) {
			// AVPF : la Caf cotise sur un salaire forfaitaire de 169 heures de SMIC par mois. Pas de points.
			compte.trimestresAssimiles[i] = 4;
			compte.salairesRevalorises[i] =
				Math.min(HEURES_AVPF * valeur(b.cnav.smicHoraire, a.annee), pass) *
				valeur(b.cnav.coefficientsRevalorisation, a.annee);
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
		assimiles += Math.min(
			max,
			compte.trimestresAssimiles[anneesPleines] as number,
		);
		points += (compte.points[anneesPleines] as number) * fraction;
	}
	return { trimestresCotises: cotises, trimestresAssimiles: assimiles, points };
}
