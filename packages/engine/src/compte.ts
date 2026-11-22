import type { AffiliationId, AgeTrimestres, Carriere } from "./types.ts";

/**
 * Droits acquis année par année au titre d'une affiliation, calculés une fois par carrière.
 * Le compte d'une carrière est celui de son affiliation principale ; les comptes de ses autres
 * affiliations y sont attachés.
 */
export type CompteCarriere = {
	/** Affiliation dont ce compte porte les droits. */
	affiliation: AffiliationId;
	/** Comptes des autres affiliations de la carrière ; absent quand elle n'en a qu'une. */
	autres?: CompteCarriere[];
	ageDebut: number;
	trimestresCotises: Float64Array;
	trimestresAssimiles: Float64Array;
	/** Trimestres validés par le travail sous une autre affiliation. */
	trimestresAutresRegimes: Uint8Array;
	/**
	 * Trimestres cotisés ou réputés cotisés pour la retraite anticipée pour carrière longue :
	 * les trimestres cotisés, la maternité, et une part plafonnée du chômage, de la maladie et de l'AVPF.
	 */
	trimestresReputes: Uint8Array;
	/** Salaire plafonné au PASS puis revalorisé vers l'année de référence. */
	salairesRevalorises: Float64Array;
	/**
	 * Régime aligné : vrai quand l'individu n'a jamais cotisé au régime général, qui ne porte alors
	 * ni ses périodes assimilées ni ses trimestres pour enfants.
	 */
	sansRegimeGeneral?: boolean;
	/** Fonctionnaire : primes de chaque année, revalorisées comme les traitements. */
	primesRevalorisees?: Float64Array;
	points: Float64Array;
};

/** Compte vide d'une carrière pour une affiliation : une case par année, à remplir. */
export function ouvrirCompte(
	affiliation: AffiliationId,
	carriere: Carriere,
): CompteCarriere {
	const n = carriere.annees.length;
	return {
		affiliation,
		ageDebut:
			n > 0 ? (carriere.annees[0]?.annee ?? 0) - carriere.anneeNaissance : 0,
		trimestresCotises: new Float64Array(n),
		trimestresAssimiles: new Float64Array(n),
		trimestresAutresRegimes: new Uint8Array(n),
		trimestresReputes: new Uint8Array(n),
		salairesRevalorises: new Float64Array(n),
		points: new Float64Array(n),
	};
}

/** Trimestres cotisés avant la fin de l'année civile d'un âge donné : la condition de début d'une carrière longue. */
export function trimestresCotisesAvant(
	compte: CompteCarriere,
	age: number,
): number {
	let total = 0;
	const n = Math.min(compte.points.length, age - compte.ageDebut + 1);
	for (let i = 0; i < n; i++)
		total +=
			(compte.trimestresCotises[i] as number) +
			(compte.trimestresAutresRegimes[i] as number);
	return total;
}

export type Cumul = {
	trimestresAutresRegimes: number;
	trimestresReputes: number;
	trimestresCotises: number;
	trimestresAssimiles: number;
	points: number;
};

/** Droits cumulés jusqu'à un âge donné ; l'année en cours compte au prorata des trimestres écoulés. */
export function cumulJusqua(compte: CompteCarriere, age: AgeTrimestres): Cumul {
	const anneesPleines = Math.floor(age / 4) - compte.ageDebut;
	const fraction = (age % 4) / 4;
	let cotises = 0;
	let assimiles = 0;
	let points = 0;
	let reputes = 0;
	let autres = 0;
	const n = compte.points.length;
	for (let i = 0; i < n && i < anneesPleines; i++) {
		reputes += compte.trimestresReputes[i] as number;
		autres += compte.trimestresAutresRegimes[i] as number;
		cotises += compte.trimestresCotises[i] as number;
		assimiles += compte.trimestresAssimiles[i] as number;
		points += compte.points[i] as number;
	}
	if (fraction > 0 && anneesPleines >= 0 && anneesPleines < n) {
		const max = age % 4;
		cotises += Math.min(max, compte.trimestresCotises[anneesPleines] as number);
		reputes += Math.min(max, compte.trimestresReputes[anneesPleines] as number);
		autres += Math.min(
			max,
			compte.trimestresAutresRegimes[anneesPleines] as number,
		);
		assimiles += Math.min(
			max,
			compte.trimestresAssimiles[anneesPleines] as number,
		);
		points += (compte.points[anneesPleines] as number) * fraction;
	}
	return {
		trimestresAutresRegimes: autres,
		trimestresReputes: reputes,
		trimestresCotises: cotises,
		trimestresAssimiles: assimiles,
		points,
	};
}
