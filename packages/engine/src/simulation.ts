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
import { type Champ, type Pyramide, ponderer } from "./ponderation.ts";
import { CHAMP_PRIVE, PYRAMIDE_FRANCE } from "./population/france.ts";
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
	/** Sans pondération, chaque individu compte pour une personne. */
	ponderation?: { pyramide: Pyramide; champ: Champ };
}

/** De 96 ans à 18 ans l'année de référence. */
export const GENERATIONS_REFERENCE = [1930, 2008] as const;

export const SCENARIO_REFERENCE: Scenario = {
	taille: 20000,
	graine: 2025,
	generations: GENERATIONS_REFERENCE,
	ponderation: { pyramide: PYRAMIDE_FRANCE, champ: CHAMP_PRIVE },
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
	return scenario.ponderation
		? ponderer(
				population,
				scenario.ponderation.pyramide,
				scenario.ponderation.champ,
			)
		: population;
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
	/** Personnes représentées : sommes des poids. */
	effectifs: { cotisants: number; retraites: number; autres: number };
	/** Sommes annuelles pondérées, en euros. */
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
	const poidsCotisations: number[] = [];
	const pensions: number[] = [];
	const poidsPensions: number[] = [];
	const parSexe = {
		F: { valeurs: [] as number[], poids: [] as number[] },
		H: { valeurs: [] as number[], poids: [] as number[] },
	};
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
		const w = individu.poids;
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
		if (sexagenaire) sexagenaires += w;
		if (pension) {
			if (sexagenaire) sexagenairesRetraites += w;
			pensions.push(pension.mensuelleBrute);
			poidsPensions.push(w);
			pensionParIndividu[i] = pension.mensuelleBrute;
			parSexe[c.sexe].valeurs.push(pension.mensuelleBrute);
			parSexe[c.sexe].poids.push(w);
			ages[c.sexe] += (pension.liquidation.age / 4) * w;
			if (pension.cnav.minimumContributifApplique) minimum += w;
			if (pension.cnav.trimestresDecote > 0) decote += w;
			if (pension.cnav.trimestresSurcote > 0) surcote += w;
			if (
				pension.liquidation.age >= g.ageTauxPleinAutomatique &&
				pension.cnav.trimestresValides < g.dureeRequise
			)
				parAge += w;
			continue;
		}
		const a =
			c.annees[
				age - (c.annees[0] ? c.annees[0].annee - c.anneeNaissance : age)
			];
		if (a && a.etat === "emploi" && a.salaireBrut > 0) {
			cotisations.push(computeCotisations(a.salaireBrut, be));
			poidsCotisations.push(w);
		} else {
			autres += w;
		}
	}

	const vc = Float64Array.from(cotisations);
	const vp = Float64Array.from(pensions);
	const resumeCotisations = resume(vc, poidsCotisations);
	const resumePensions = resume(vp, poidsPensions);
	const n = Math.max(1e-9, resumePensions.effectif);
	const groupe = (sexe: "F" | "H"): GroupeSexe => {
		const v = parSexe[sexe];
		const r = resume(v.valeurs, v.poids);
		return {
			effectif: r.effectif,
			pensionMoyenne: r.moyenne,
			pensionMediane: r.mediane,
			ageMoyenDepart: r.effectif ? ages[sexe] / r.effectif : 0,
		};
	};
	return {
		anneeReference: annee,
		cotisations: {
			valeurs: vc,
			resume: resumeCotisations,
			histogramme: histogramme(
				vc,
				MAX_COTISATION,
				NB_CLASSES,
				poidsCotisations,
			),
		},
		pensions: {
			valeurs: vp,
			resume: resumePensions,
			histogramme: histogramme(vp, MAX_PENSION, NB_CLASSES, poidsPensions),
		},
		effectifs: {
			cotisants: resumeCotisations.effectif,
			retraites: resumePensions.effectif,
			autres,
		},
		masses: {
			cotisations: resumeCotisations.moyenne * resumeCotisations.effectif,
			pensions: resumePensions.moyenne * resumePensions.effectif * 12,
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
		ageMoyenDepart: resumePensions.effectif
			? (ages.F + ages.H) / resumePensions.effectif
			: 0,
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
	poids?: ArrayLike<number>,
): EcartDecile[] {
	const retraites: number[] = [];
	let total = 0;
	const w = (i: number) => (poids ? (poids[i] as number) : 1);
	for (let i = 0; i < reference.length; i++) {
		if (!Number.isNaN(reference[i] as number)) {
			retraites.push(i);
			total += w(i);
		}
	}
	retraites.sort((x, y) => (reference[x] as number) - (reference[y] as number));
	const deciles: EcartDecile[] = [];
	let k = 0;
	let cumul = 0;
	for (let d = 0; d < 10; d++) {
		const seuil = ((d + 1) * total) / 10;
		let poidsDixieme = 0;
		let sommeReference = 0;
		let sommeScenario = 0;
		let restes = 0;
		while (
			k < retraites.length &&
			(d === 9 || cumul + w(retraites[k] as number) / 2 < seuil)
		) {
			const i = retraites[k] as number;
			const wi = w(i);
			cumul += wi;
			poidsDixieme += wi;
			sommeReference += (reference[i] as number) * wi;
			const p = scenario[i] as number;
			if (!Number.isNaN(p)) {
				sommeScenario += p * wi;
				restes += wi;
			}
			k++;
		}
		const taille = Math.max(1e-9, poidsDixieme);
		deciles.push({
			reference: sommeReference / taille,
			scenario: restes ? sommeScenario / restes : 0,
			partSortie: poidsDixieme ? 1 - restes / poidsDixieme : 0,
		});
	}
	return deciles;
}
