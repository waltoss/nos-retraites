import {
	type BaremeGeneration,
	type Baremes,
	baremeGeneration,
	valeur,
} from "./baremes/types.ts";
import { type CompteCarriere, buildCompte, cumulJusqua } from "./compte.ts";
import { computeAgircArrco } from "./regimes/agircArrco.ts";
import { computeCnav, trimestresManquants, trimestresMda } from "./regimes/cnav.ts";
import type { AgeTrimestres, Carriere, Pension } from "./types.ts";

/** Règles d'un scénario qui remplacent le barème de la génération. */
export interface ReglesScenario {
	/** Âge légal imposé à toutes les générations, en trimestres. */
	ageLegal?: AgeTrimestres;
	/** Durée requise imposée à toutes les générations, en trimestres. */
	dureeRequise?: number;
}

export function reglesGeneration(
	anneeNaissance: number,
	b: Baremes,
	regles: ReglesScenario = {},
): BaremeGeneration {
	const g = baremeGeneration(b.cnav, anneeNaissance);
	const ageLegal = regles.ageLegal ?? g.ageLegal;
	return {
		ageLegal,
		dureeRequise: regles.dureeRequise ?? g.dureeRequise,
		ageTauxPleinAutomatique: Math.max(g.ageTauxPleinAutomatique, ageLegal),
	};
}

/**
 * Comportement de départ par défaut : l'individu part dès qu'il a le taux plein,
 * par la durée ou par l'âge, et jamais avant l'âge légal.
 */
export function decideLiquidation(
	carriere: Carriere,
	compte: CompteCarriere,
	g: BaremeGeneration,
	b: Baremes,
): AgeTrimestres {
	for (let age = g.ageLegal; age < g.ageTauxPleinAutomatique; age++) {
		const cumul = cumulJusqua(compte, age);
		const annee = carriere.anneeNaissance + Math.floor(age / 4);
		const valides =
			cumul.trimestresCotises +
			cumul.trimestresAssimiles +
			trimestresMda(carriere, b.cnav, annee);
		if (trimestresManquants(valides, age, g) === 0) return age;
	}
	return g.ageTauxPleinAutomatique;
}

export interface OptionsPension {
	regles?: ReglesScenario;
	/** Âge de départ imposé ; sinon le comportement par défaut s'applique. */
	ageLiquidation?: AgeTrimestres;
	compte?: CompteCarriere;
}

/** Calcule la pension d'une carrière, en euros de l'année de référence des barèmes. */
export function computePension(
	carriere: Carriere,
	b: Baremes,
	options: OptionsPension = {},
): Pension {
	const compte = options.compte ?? buildCompte(carriere, b);
	const g = reglesGeneration(carriere.anneeNaissance, b, options.regles);
	const age =
		options.ageLiquidation ?? decideLiquidation(carriere, compte, g, b);
	const cumul = cumulJusqua(compte, age);
	const cnav = computeCnav(carriere, compte, cumul, age, g, b.cnav);
	const agircArrco = computeAgircArrco(
		carriere,
		cumul,
		cnav.trimestresDecote,
		b.agircArrco,
	);

	// Écrêtement du minimum contributif quand la pension totale dépasse le plafond tous régimes.
	const plafond = b.cnav.minimumContributif?.plafondTousRegimesAnnuel;
	if (cnav.minimumContributifApplique && plafond) {
		const total = cnav.pensionAnnuelle + agircArrco.pensionAnnuelle;
		if (total > plafond) {
			const sansMinimum =
				cnav.salaireAnnuelMoyen *
				cnav.tauxLiquidation *
				cnav.proratisation *
				(1 + b.cnav.surcoteParTrimestre * cnav.trimestresSurcote) *
				(1 + cnav.majorationEnfants);
			cnav.pensionAnnuelle = Math.max(
				sansMinimum,
				cnav.pensionAnnuelle - (total - plafond),
			);
		}
	}

	return {
		liquidation: { age, annee: carriere.anneeNaissance + Math.floor(age / 4) },
		cnav,
		agircArrco,
		mensuelleBrute: (cnav.pensionAnnuelle + agircArrco.pensionAnnuelle) / 12,
	};
}

/** Cotisations vieillesse annuelles (salarié + employeur, base + complémentaire) aux taux de l'année de référence. */
export function computeCotisations(
	salaireBrut: number,
	cadre: boolean,
	b: Baremes,
): number {
	const annee = b.anneeReference;
	const pass = valeur(b.cnav.pass, annee);
	const aa = b.agircArrco;
	const tranche1 = Math.min(salaireBrut, pass);
	const tranche2 = Math.max(
		0,
		Math.min(salaireBrut, aa.plafondTranche2(annee, cadre) * pass) - pass,
	);
	const base =
		tranche1 * b.cnav.tauxCotisation.plafonne +
		salaireBrut * b.cnav.tauxCotisation.deplafonne;
	const complementaire =
		tranche1 *
			(valeur(aa.tauxTranche1, annee) * aa.tauxAppel + aa.contributions.tranche1) +
		tranche2 *
			(valeur(aa.tauxTranche2, annee) * aa.tauxAppel + aa.contributions.tranche2);
	return base + complementaire;
}
