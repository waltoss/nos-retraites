import type { Baremes } from "./baremes/types.ts";
import { buildCompte, type CompteCarriere } from "./compte.ts";
import { generateCarriere } from "./generateur/carriere.ts";
import {
	HYPOTHESES_TRANCHE_0,
	type Hypotheses,
} from "./generateur/hypotheses.ts";
import {
	computeCotisations,
	computePension,
	type ReglesScenario,
	reglesGeneration,
} from "./liquidation.ts";
import { createRng, graineIndividu } from "./rng.ts";
import { type Histogramme, histogramme, type Resume, resume } from "./stats.ts";
import type { Individu, Pension } from "./types.ts";

export interface Scenario {
	/** Nombre d'individus simulés. */
	taille: number;
	graine: number;
	/** Générations simulées, bornes incluses. */
	generations: readonly [debut: number, fin: number];
	regles?: ReglesScenario;
	hypotheses?: Hypotheses;
}

export const SCENARIO_REFERENCE: Scenario = {
	taille: 20000,
	graine: 2025,
	generations: [1955, 2003],
};

/** Population synthétique : dépend de la graine et des hypothèses, pas des règles du scénario. */
export function generatePopulation(scenario: Scenario, b: Baremes): Individu[] {
	const [debut, fin] = scenario.generations;
	const nbGenerations = fin - debut + 1;
	const h = scenario.hypotheses ?? HYPOTHESES_TRANCHE_0;
	const population: Individu[] = [];
	for (let id = 0; id < scenario.taille; id++) {
		const anneeNaissance = debut + (id % nbGenerations);
		const rng = createRng(graineIndividu(scenario.graine, id));
		population.push({
			id,
			poids: 1,
			carriere: generateCarriere(anneeNaissance, rng, h, b),
		});
	}
	return population;
}

/** Comptes de carrière de la population : indépendants des règles du scénario, à calculer une seule fois. */
export function buildComptes(
	population: Individu[],
	b: Baremes,
): CompteCarriere[] {
	return population.map((i) => buildCompte(i.carriere, b));
}

export interface Resultat {
	anneeReference: number;
	/** Cotisations vieillesse annuelles des individus en emploi l'année de référence. */
	cotisations: {
		valeurs: Float64Array;
		resume: Resume;
		histogramme: Histogramme;
	};
	/** Pensions mensuelles brutes des individus déjà partis l'année de référence. */
	pensions: { valeurs: Float64Array; resume: Resume; histogramme: Histogramme };
	effectifs: { cotisants: number; retraites: number; autres: number };
	/** Part des individus de 60 à 69 ans déjà partis à la retraite l'année de référence. */
	partRetraitesSexagenaires: number;
	/** Âge moyen de départ des retraités, en années. */
	ageMoyenDepart: number;
	dureeMs: number;
}

export const MAX_COTISATION = 30000;
export const MAX_PENSION = 5000;
export const NB_CLASSES = 40;

/** Photographie de l'année de référence : qui cotise combien, qui perçoit combien. */
export function runSimulation(
	population: Individu[],
	b: Baremes,
	regles: ReglesScenario = {},
	comptes?: CompteCarriere[],
): Resultat {
	const debut = performance.now();
	const annee = b.anneeReference;
	const cotisations: number[] = [];
	const pensions: number[] = [];
	let autres = 0;
	let sommeAges = 0;
	let sexagenaires = 0;
	let sexagenairesRetraites = 0;

	for (let i = 0; i < population.length; i++) {
		const individu = population[i] as Individu;
		const c = individu.carriere;
		const age = annee - c.anneeNaissance;
		const g = reglesGeneration(c.anneeNaissance, b, regles);
		let pension: Pension | null = null;
		// Personne ne part avant l'âge légal : inutile de calculer la pension des plus jeunes.
		if (age * 4 >= g.ageLegal) {
			const p = computePension(c, b, {
				regles,
				compte: comptes?.[i] ?? buildCompte(c, b),
			});
			if (p.liquidation.annee <= annee) pension = p;
		}
		const sexagenaire = age >= 60 && age < 70;
		if (sexagenaire) sexagenaires++;
		if (pension) {
			if (sexagenaire) sexagenairesRetraites++;
			pensions.push(pension.mensuelleBrute);
			sommeAges += pension.liquidation.age / 4;
			continue;
		}
		const a =
			c.annees[
				age - (c.annees[0] ? c.annees[0].annee - c.anneeNaissance : age)
			];
		if (a && a.etat === "emploi" && a.salaireBrut > 0) {
			cotisations.push(computeCotisations(a.salaireBrut, b));
		} else {
			autres++;
		}
	}

	const vc = Float64Array.from(cotisations);
	const vp = Float64Array.from(pensions);
	return {
		anneeReference: annee,
		cotisations: {
			valeurs: vc,
			resume: resume(vc),
			histogramme: histogramme(vc, MAX_COTISATION, NB_CLASSES),
		},
		pensions: {
			valeurs: vp,
			resume: resume(vp),
			histogramme: histogramme(vp, MAX_PENSION, NB_CLASSES),
		},
		effectifs: { cotisants: vc.length, retraites: vp.length, autres },
		partRetraitesSexagenaires: sexagenaires
			? sexagenairesRetraites / sexagenaires
			: 0,
		ageMoyenDepart: vp.length ? sommeAges / vp.length : 0,
		dureeMs: performance.now() - debut,
	};
}
