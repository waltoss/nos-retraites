import {
	type BaremeGeneration,
	type Baremes,
	baremeGeneration,
	valeur,
} from "./baremes/types.ts";
import { buildCompte, type CompteCarriere, cumulJusqua } from "./compte.ts";
import { computeAgircArrco } from "./regimes/agircArrco.ts";
import {
	computeCnav,
	trimestresManquants,
	trimestresMda,
} from "./regimes/cnav.ts";
import type { AgeTrimestres, Carriere, Pension } from "./types.ts";

/** Règles d'un scénario. Tout champ absent garde la valeur du droit en vigueur. */
export interface ReglesScenario {
	/** Âge légal imposé à toutes les générations, en trimestres. */
	ageLegal?: AgeTrimestres;
	/** Durée requise imposée à toutes les générations, en trimestres. */
	dureeRequise?: number;
	/** Nombre de meilleures années retenues pour le salaire annuel moyen. */
	nbMeilleuresAnnees?: number;
	/** Taux plein du régime général (0,5 = 50 %). */
	tauxPlein?: number;
	/** Points de taux perdus par trimestre manquant. */
	decoteParTrimestre?: number;
	/** Majoration de pension par trimestre de surcote. */
	surcoteParTrimestre?: number;
	/** Multiplicateur de la valeur de service du point de retraite complémentaire. */
	valeurDuPoint?: number;
	/** Multiplicateur du minimum contributif (0 le supprime). */
	minimumContributif?: number;
	/** Trimestres accordés à la mère par enfant. */
	mdaParEnfant?: number;
	/** Majoration de pension pour trois enfants, dans les deux régimes. */
	majorationTroisEnfants?: number;
	/** Points ajoutés au taux de cotisation vieillesse plafonné (0,01 = 1 point). */
	cotisationBase?: number;
	/** Taux d'appel des cotisations de retraite complémentaire (1,27 = 127 %). */
	tauxAppel?: number;
}

/** Barèmes d'un scénario : le droit en vigueur, modifié par les règles du scénario. */
export function appliquerRegles(b: Baremes, r: ReglesScenario = {}): Baremes {
	const m = b.cnav.minimumContributif;
	const k = r.minimumContributif;
	return {
		...b,
		cnav: {
			...b.cnav,
			nbMeilleuresAnnees: r.nbMeilleuresAnnees ?? b.cnav.nbMeilleuresAnnees,
			tauxPlein: r.tauxPlein ?? b.cnav.tauxPlein,
			decoteParTrimestre: r.decoteParTrimestre ?? b.cnav.decoteParTrimestre,
			surcoteParTrimestre: r.surcoteParTrimestre ?? b.cnav.surcoteParTrimestre,
			mdaParEnfant: r.mdaParEnfant ?? b.cnav.mdaParEnfant,
			majorationTroisEnfants:
				r.majorationTroisEnfants ?? b.cnav.majorationTroisEnfants,
			minimumContributif:
				m && k !== undefined
					? k === 0
						? null
						: { ...m, annuel: m.annuel * k, annuelMajore: m.annuelMajore * k }
					: m,
			tauxCotisation: {
				...b.cnav.tauxCotisation,
				plafonne: b.cnav.tauxCotisation.plafonne + (r.cotisationBase ?? 0),
			},
		},
		agircArrco: {
			...b.agircArrco,
			valeurDeServiceDuPoint:
				b.agircArrco.valeurDeServiceDuPoint * (r.valeurDuPoint ?? 1),
			majorationTroisEnfants:
				r.majorationTroisEnfants ?? b.agircArrco.majorationTroisEnfants,
			cotisation: {
				...b.agircArrco.cotisation,
				tauxAppel: r.tauxAppel ?? b.agircArrco.cotisation.tauxAppel,
			},
		},
	};
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
		nbMeilleuresAnnees: regles.nbMeilleuresAnnees ?? g.nbMeilleuresAnnees,
		dureeProratisation: regles.dureeRequise ?? g.dureeProratisation,
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

/**
 * Calcule la pension d'une carrière, en euros de l'année de référence des barèmes.
 * Les barèmes doivent déjà porter les règles du scénario (voir appliquerRegles).
 */
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
export function computeCotisations(salaireBrut: number, b: Baremes): number {
	const pass = valeur(b.cnav.pass, b.anneeReference);
	const c = b.agircArrco.cotisation;
	const tranche1 = Math.min(salaireBrut, pass);
	const tranche2 = Math.max(
		0,
		Math.min(salaireBrut, c.plafondTranche2EnPass * pass) - pass,
	);
	const base =
		tranche1 * b.cnav.tauxCotisation.plafonne +
		salaireBrut * b.cnav.tauxCotisation.deplafonne;
	const complementaire =
		tranche1 * (c.tauxTranche1 * c.tauxAppel + c.cegTranche1) +
		tranche2 * (c.tauxTranche2 * c.tauxAppel + c.cegTranche2) +
		(tranche2 > 0 ? (tranche1 + tranche2) * c.cet : 0);
	return base + complementaire;
}
