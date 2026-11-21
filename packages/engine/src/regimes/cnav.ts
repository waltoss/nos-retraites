import type { BaremeCnav, BaremeGeneration } from "../baremes/types.ts";
import type { CompteCarriere, Cumul } from "../compte.ts";
import type { AgeTrimestres, Carriere, DetailCnav } from "../types.ts";

/** Trimestres de majoration de durée d'assurance pour enfants, attribués à la mère. */
export function trimestresMda(
	carriere: Carriere,
	b: BaremeCnav,
	anneeLiquidation: number,
): number {
	if (carriere.sexe !== "F") return 0;
	return (
		carriere.enfants.filter((n) => n < anneeLiquidation).length * b.mdaParEnfant
	);
}

/** Trimestres qui manquent pour le taux plein : le plus favorable entre la durée et l'âge. */
export function trimestresManquants(
	dureeValidee: number,
	age: AgeTrimestres,
	g: BaremeGeneration,
): number {
	const parDuree = g.dureeRequise - dureeValidee;
	const parAge = g.ageTauxPleinAutomatique - age;
	return Math.max(0, Math.min(parDuree, parAge));
}

/** Salaire annuel moyen : moyenne des meilleures années plafonnées et revalorisées, avant l'âge de départ. */
export function salaireAnnuelMoyen(
	compte: CompteCarriere,
	age: AgeTrimestres,
	nbMeilleuresAnnees: number,
): number {
	const anneesPleines = Math.max(
		0,
		Math.min(compte.points.length, Math.floor(age / 4) - compte.ageDebut),
	);
	const salaires: number[] = [];
	for (let i = 0; i < anneesPleines; i++) {
		const s = compte.salairesRevalorises[i] as number;
		if (s > 0) salaires.push(s);
	}
	if (salaires.length === 0) return 0;
	salaires.sort((x, y) => y - x);
	const retenus = salaires.slice(0, nbMeilleuresAnnees);
	return retenus.reduce((t, s) => t + s, 0) / retenus.length;
}

export function computeCnav(
	carriere: Carriere,
	compte: CompteCarriere,
	cumul: Cumul,
	age: AgeTrimestres,
	g: BaremeGeneration,
	b: BaremeCnav,
): DetailCnav {
	const anneeLiquidation = carriere.anneeNaissance + Math.floor(age / 4);
	const mda = trimestresMda(carriere, b, anneeLiquidation);
	// Durée au régime général, qui fixe la proratisation, et durée tous régimes, qui fixe le taux.
	const auRegime = cumul.trimestresCotises + cumul.trimestresAssimiles + mda;
	const valides = auRegime + cumul.trimestresAutresRegimes;
	const manquants = Math.min(
		b.decoteTrimestresMax,
		trimestresManquants(valides, age, g),
	);
	const taux = b.tauxPlein - b.decoteParTrimestre * manquants;
	const surcote = Math.max(
		0,
		Math.min(valides - g.dureeRequise, age - g.ageLegal),
	);
	const proratisation = Math.min(
		1,
		auRegime / (g.dureeProratisation ?? g.dureeRequise),
	);
	const sam = salaireAnnuelMoyen(
		compte,
		age,
		g.nbMeilleuresAnnees ?? b.nbMeilleuresAnnees,
	);

	let pension = sam * taux * proratisation;
	let minimumApplique = false;
	const mico = b.minimumContributif;
	if (mico && manquants === 0 && pension > 0) {
		const plancher =
			(cumul.trimestresCotises + cumul.trimestresAutresRegimes >=
			mico.trimestresCotisesPourMajoration
				? mico.annuelMajore
				: mico.annuel) *
			(b.indiceMinimumContributif?.(anneeLiquidation) ?? 1) *
			proratisation;
		if (plancher > pension) {
			pension = plancher;
			minimumApplique = true;
		}
	}
	pension *= 1 + b.surcoteParTrimestre * surcote;
	const majoration =
		carriere.enfants.length >= 3 ? b.majorationTroisEnfants : 0;
	pension *= 1 + majoration;

	return {
		salaireAnnuelMoyen: sam,
		trimestresValides: valides,
		trimestresCotises: cumul.trimestresCotises,
		trimestresAutresRegimes: cumul.trimestresAutresRegimes,
		trimestresMda: mda,
		dureeRequise: g.dureeRequise,
		tauxLiquidation: taux,
		trimestresDecote: manquants,
		trimestresSurcote: surcote,
		proratisation,
		majorationEnfants: majoration,
		minimumContributifApplique: minimumApplique,
		pensionAnnuelle: pension,
	};
}
