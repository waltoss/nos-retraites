import type { Baremes } from "./baremes/types.ts";
import { buildCompte, type CompteCarriere } from "./compte.ts";
import { generateCarriere } from "./generateur/carriere.ts";
import {
	appliquerFacteurs,
	type Facteurs,
	HYPOTHESES,
	type Hypotheses,
} from "./generateur/hypotheses.ts";
import {
	appliquerRegles,
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
	facteurs?: Facteurs;
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
	const h = appliquerFacteurs(
		scenario.hypotheses ?? HYPOTHESES,
		scenario.facteurs,
	);
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

export interface GroupeSexe {
	effectif: number;
	pensionMoyenne: number;
	pensionMediane: number;
	ageMoyenDepart: number;
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
	/** Sommes annuelles sur l'échantillon, en euros. */
	masses: { cotisations: number; pensions: number };
	parSexe: { F: GroupeSexe; H: GroupeSexe };
	/** Parts parmi les retraités. */
	parts: {
		minimumContributif: number;
		decote: number;
		surcote: number;
		/** Départs à l'âge du taux plein automatique, faute de durée suffisante. */
		tauxPleinParAge: number;
	};
	/** Part des individus de 60 à 69 ans déjà partis à la retraite l'année de référence. */
	partRetraitesSexagenaires: number;
	/** Âge moyen de départ des retraités, en années. */
	ageMoyenDepart: number;
	/** Pension mensuelle de chaque individu, dans l'ordre de la population ; NaN s'il n'est pas retraité. */
	pensionParIndividu: Float64Array;
	dureeMs: number;
}

export const MAX_COTISATION = 30000;
export const MAX_PENSION = 5000;
export const NB_CLASSES = 40;

/**
 * Photographie de l'année de référence : qui cotise combien, qui perçoit combien.
 * Les règles du scénario sont appliquées ici ; passer les barèmes du droit en vigueur.
 */
export function runSimulation(
	population: Individu[],
	b: Baremes,
	regles: ReglesScenario = {},
	comptes?: CompteCarriere[],
): Resultat {
	const debut = performance.now();
	const be = appliquerRegles(b, regles);
	const annee = b.anneeReference;
	const cotisations: number[] = [];
	const pensions: number[] = [];
	const parSexe = { F: [] as number[], H: [] as number[] };
	const ages = { F: 0, H: 0 };
	const pensionParIndividu = new Float64Array(population.length).fill(
		Number.NaN,
	);
	let autres = 0;
	let sexagenaires = 0;
	let sexagenairesRetraites = 0;
	let minimum = 0;
	let decote = 0;
	let surcote = 0;
	let parAge = 0;

	for (let i = 0; i < population.length; i++) {
		const individu = population[i] as Individu;
		const c = individu.carriere;
		const age = annee - c.anneeNaissance;
		const g = reglesGeneration(c.anneeNaissance, b, regles);
		let pension: Pension | null = null;
		// Personne ne part avant l'âge légal : inutile de calculer la pension des plus jeunes.
		if (age * 4 >= g.ageLegal) {
			const p = computePension(c, be, {
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
			pensionParIndividu[i] = pension.mensuelleBrute;
			parSexe[c.sexe].push(pension.mensuelleBrute);
			ages[c.sexe] += pension.liquidation.age / 4;
			if (pension.cnav.minimumContributifApplique) minimum++;
			if (pension.cnav.trimestresDecote > 0) decote++;
			if (pension.cnav.trimestresSurcote > 0) surcote++;
			if (
				pension.liquidation.age >= g.ageTauxPleinAutomatique &&
				pension.cnav.trimestresValides < g.dureeRequise
			)
				parAge++;
			continue;
		}
		const a =
			c.annees[
				age - (c.annees[0] ? c.annees[0].annee - c.anneeNaissance : age)
			];
		if (a && a.etat === "emploi" && a.salaireBrut > 0) {
			cotisations.push(computeCotisations(a.salaireBrut, be));
		} else {
			autres++;
		}
	}

	const vc = Float64Array.from(cotisations);
	const vp = Float64Array.from(pensions);
	const n = Math.max(1, vp.length);
	const groupe = (sexe: "F" | "H"): GroupeSexe => {
		const v = parSexe[sexe];
		const r = resume(v);
		return {
			effectif: v.length,
			pensionMoyenne: r.moyenne,
			pensionMediane: r.mediane,
			ageMoyenDepart: v.length ? ages[sexe] / v.length : 0,
		};
	};
	const resumeCotisations = resume(vc);
	const resumePensions = resume(vp);
	return {
		anneeReference: annee,
		cotisations: {
			valeurs: vc,
			resume: resumeCotisations,
			histogramme: histogramme(vc, MAX_COTISATION, NB_CLASSES),
		},
		pensions: {
			valeurs: vp,
			resume: resumePensions,
			histogramme: histogramme(vp, MAX_PENSION, NB_CLASSES),
		},
		effectifs: { cotisants: vc.length, retraites: vp.length, autres },
		masses: {
			cotisations: resumeCotisations.moyenne * vc.length,
			pensions: resumePensions.moyenne * vp.length * 12,
		},
		parSexe: { F: groupe("F"), H: groupe("H") },
		parts: {
			minimumContributif: minimum / n,
			decote: decote / n,
			surcote: surcote / n,
			tauxPleinParAge: parAge / n,
		},
		partRetraitesSexagenaires: sexagenaires
			? sexagenairesRetraites / sexagenaires
			: 0,
		ageMoyenDepart: vp.length ? (ages.F + ages.H) / vp.length : 0,
		pensionParIndividu,
		dureeMs: performance.now() - debut,
	};
}

/** Écart de pension entre deux scénarios, par dixième de la pension de référence. */
export interface EcartDecile {
	/** Pension moyenne du dixième dans le scénario de référence. */
	reference: number;
	/** Pension moyenne des mêmes individus dans le scénario, parmi ceux qui sont encore retraités. */
	scenario: number;
	/** Part du dixième qui n'est plus à la retraite dans le scénario. */
	partSortie: number;
}

export function compareScenarios(
	reference: Float64Array,
	scenario: Float64Array,
): EcartDecile[] {
	const retraites: number[] = [];
	for (let i = 0; i < reference.length; i++) {
		if (!Number.isNaN(reference[i] as number)) retraites.push(i);
	}
	retraites.sort((x, y) => (reference[x] as number) - (reference[y] as number));
	const deciles: EcartDecile[] = [];
	for (let d = 0; d < 10; d++) {
		const debut = Math.floor((d * retraites.length) / 10);
		const fin = Math.floor(((d + 1) * retraites.length) / 10);
		let sommeReference = 0;
		let sommeScenario = 0;
		let restes = 0;
		for (let k = debut; k < fin; k++) {
			const i = retraites[k] as number;
			sommeReference += reference[i] as number;
			const p = scenario[i] as number;
			if (!Number.isNaN(p)) {
				sommeScenario += p;
				restes++;
			}
		}
		const taille = Math.max(1, fin - debut);
		deciles.push({
			reference: sommeReference / taille,
			scenario: restes ? sommeScenario / restes : 0,
			partSortie: 1 - restes / taille,
		});
	}
	return deciles;
}
