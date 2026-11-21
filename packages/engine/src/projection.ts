import { type Baremes, valeur } from "./baremes/types.ts";
import { buildCompte, type CompteCarriere } from "./compte.ts";
import {
	appliquerRegles,
	computePension,
	detailCotisations,
	type ReglesScenario,
	reglesGeneration,
} from "./liquidation.ts";
import type { Champ, Pyramide } from "./ponderation.ts";
import {
	type GroupeSexe,
	MAX_COTISATION,
	MAX_PENSION,
	NB_CLASSES,
	type Resultat,
} from "./simulation.ts";
import { histogramme, resume } from "./stats.ts";
import type { Individu, Pension } from "./types.ts";

/** Population réelle projetée, année par année. Une année absente reprend la dernière connue. */
export type PyramidesProjetees = Readonly<Record<number, Pyramide>>;

export interface OptionsProjection {
	debut: number;
	fin: number;
	pyramides: PyramidesProjetees;
	champ: Champ;
	/**
	 * Première année où les règles du scénario s'appliquent. Ceux qui sont partis avant gardent
	 * leur pension calculée avec le droit en vigueur ; personne ne part avant cette année
	 * au titre des nouvelles règles.
	 */
	anneeEffet: number;
	comptes?: CompteCarriere[];
	/** Pensions du droit en vigueur, si elles ont déjà été calculées. */
	pensionsReference?: Pension[];
	ageMin?: number;
	ageMax?: number;
}

export interface AnneeProjetee {
	annee: number;
	cotisants: number;
	retraites: number;
	/** Sommes annuelles, en euros de l'année de référence. */
	cotisations: number;
	pensions: number;
	/** Part du régime de base dans ces sommes : elle sert à étendre le scénario aux autres régimes. */
	cotisationsBase: number;
	pensionsBase: number;
	/** Pension mensuelle moyenne des retraités. */
	pensionMoyenne: number;
	/** Salaire brut annuel moyen des cotisants. */
	salaireMoyen: number;
	/** Âge moyen de ceux qui partent cette année-là. */
	ageMoyenDepart: number;
}

export interface GenerationProjetee {
	generation: number;
	ageMoyenDepart: number;
	/** Pension mensuelle moyenne à la liquidation, en euros de l'année de référence. */
	pensionMoyenne: number;
}

export interface Projection {
	annees: AnneeProjetee[];
	generations: GenerationProjetee[];
	dureeMs: number;
}

/** Pension de chaque individu avec les règles données, comme si elles avaient toujours existé. */
export function computePensions(
	population: Individu[],
	b: Baremes,
	regles: ReglesScenario = {},
	comptes?: CompteCarriere[],
): Pension[] {
	const be = appliquerRegles(b, regles);
	return population.map((i, k) =>
		computePension(i.carriere, be, {
			regles,
			compte: comptes?.[k] ?? buildCompte(i.carriere, b),
		}),
	);
}

/** Un scénario préparé : la pension effective de chacun, une fois pour toutes les années. */
export interface Preparation {
	population: Individu[];
	b: Baremes;
	/** Barèmes avec les règles du scénario. */
	be: Baremes;
	regles: ReglesScenario;
	options: OptionsProjection;
	/** Pension effective : celle du droit en vigueur pour ceux qui sont partis avant l'année d'effet. */
	pensions: Pension[];
	avantReforme: Uint8Array;
	/** Individus simulés par génération et par sexe : le dénominateur des poids. */
	simules: Map<string, number>;
}

const cle = (individu: Individu) =>
	`${individu.carriere.sexe}${individu.carriere.anneeNaissance}`;

/**
 * Prépare un scénario : calcule la pension de chacun avec les règles qui lui reviennent.
 * Ceux qui sont partis avant l'année d'effet gardent leur pension ; les autres relèvent des
 * nouvelles règles et ne peuvent pas partir avant cette année au titre de celles-ci.
 */
export function prepareProjection(
	population: Individu[],
	b: Baremes,
	reglesVisees: ReglesScenario,
	options: OptionsProjection,
): Preparation {
	const { anneeEffet } = options;
	const inchange = Object.keys(reglesVisees).length === 0;
	// L'âge légal et la durée requise montent en charge par génération depuis l'année d'effet.
	const regles: ReglesScenario = inchange
		? reglesVisees
		: { anneeEffet, ...reglesVisees };
	const be = appliquerRegles(b, regles);
	const comptes =
		options.comptes ?? population.map((i) => buildCompte(i.carriere, b));
	const reference =
		options.pensionsReference ?? computePensions(population, b, {}, comptes);
	const n = population.length;
	const pensions: Pension[] = new Array(n);
	const avantReforme = new Uint8Array(n);
	const simules = new Map<string, number>();
	for (let k = 0; k < n; k++) {
		const individu = population[k] as Individu;
		simules.set(cle(individu), (simules.get(cle(individu)) ?? 0) + 1);
		const p0 = reference[k] as Pension;
		let p = p0;
		if (p0.liquidation.annee < anneeEffet) {
			avantReforme[k] = 1;
		} else if (!inchange) {
			const c = individu.carriere;
			p = computePension(c, be, { regles, compte: comptes[k] });
			if (p.liquidation.annee < anneeEffet)
				p = computePension(c, be, {
					regles,
					compte: comptes[k],
					ageLiquidation: (anneeEffet - c.anneeNaissance) * 4,
				});
		}
		pensions[k] = p;
	}
	return {
		population,
		b,
		be,
		regles,
		options,
		pensions,
		avantReforme,
		simules,
	};
}

/** Ce qu'il faut savoir d'un individu une année donnée : son poids et, s'il est retraité, sa pension. */
function lecteur(prep: Preparation, annee: number) {
	const { options, b, regles } = prep;
	const anneesConnues = Object.keys(options.pyramides).map(Number);
	const pyramide = options.pyramides[
		Math.max(
			Math.min(...anneesConnues),
			Math.min(Math.max(...anneesConnues), annee),
		)
	] as Pyramide;
	const ageMin = options.ageMin ?? 18;
	const ageMax = options.ageMax ?? 96;
	const depuisEffet = Math.max(0, annee - options.anneeEffet + 1);
	const revalorisation = 1 + (regles.revalorisationReelle ?? 0);
	// La valeur du point vaut pour toutes les pensions complémentaires en cours.
	const service = b.agircArrco.indiceValeurDeService
		? valeur(b.agircArrco.indiceValeurDeService, annee)
		: 1;
	const point = regles.valeurDuPoint ?? 1;
	return {
		poids(k: number): number {
			const individu = prep.population[k] as Individu;
			const c = individu.carriere;
			const age = annee - c.anneeNaissance;
			if (age < ageMin || age > ageMax) return 0;
			const reels = (c.sexe === "F" ? pyramide.femmes : pyramide.hommes)[
				Math.min(age, pyramide.femmes.length - 1)
			];
			return (
				((reels ?? 0) * options.champ.part(age, c.sexe)) /
				(prep.simules.get(cle(individu)) ?? 1)
			);
		},
		/** Part du régime de base dans la pension annuelle versée cette année-là. */
		pensionBase(k: number): number {
			const p = prep.pensions[k] as Pension;
			const partiDepuis = annee - p.liquidation.annee;
			return (
				(revalorisation === 1
					? 1
					: revalorisation ** Math.min(depuisEffet, Math.max(0, partiDepuis))) *
				p.cnav.pensionAnnuelle
			);
		},
		/** Pension annuelle versée cette année-là, ou null si l'individu n'est pas encore parti. */
		pensionAnnuelle(k: number): number | null {
			const p = prep.pensions[k] as Pension;
			const partiDepuis = annee - p.liquidation.annee;
			if (partiDepuis < 0) return null;
			// Les pensions liquidées suivent les prix, plus ou moins l'écart choisi par le scénario.
			const indexation =
				revalorisation === 1
					? 1
					: revalorisation ** Math.min(depuisEffet, partiDepuis);
			const pointApplique =
				prep.avantReforme[k] && annee >= options.anneeEffet ? point : 1;
			return (
				indexation *
				(p.cnav.pensionAnnuelle +
					p.agircArrco.pensionAnnuelle * pointApplique * service)
			);
		},
		/** Salaire de l'année, 0 hors emploi. */
		salaire(k: number): number {
			const c = (prep.population[k] as Individu).carriere;
			const premiere = c.annees[0]?.annee ?? annee + 1;
			return c.annees[annee - premiere]?.salaireBrut ?? 0;
		},
		cotisation(salaire: number): { base: number; complementaire: number } {
			return detailCotisations(
				salaire,
				annee >= options.anneeEffet ? prep.be : b,
				annee,
			);
		},
	};
}

/** Trajectoires année par année et par génération d'un scénario préparé. */
export function projeter(prep: Preparation): Projection {
	const depart = performance.now();
	const { population, options } = prep;
	const n = population.length;
	const annees: AnneeProjetee[] = [];
	for (let annee = options.debut; annee <= options.fin; annee++) {
		const lit = lecteur(prep, annee);
		const ligne = {
			cotisants: 0,
			retraites: 0,
			cotisations: 0,
			pensions: 0,
			cotisationsBase: 0,
			pensionsBase: 0,
			salaires: 0,
			departs: 0,
			ages: 0,
		};
		for (let k = 0; k < n; k++) {
			const poids = lit.poids(k);
			if (poids === 0) continue;
			const pension = lit.pensionAnnuelle(k);
			if (pension !== null) {
				ligne.retraites += poids;
				ligne.pensions += poids * pension;
				ligne.pensionsBase += poids * lit.pensionBase(k);
				const p = prep.pensions[k] as Pension;
				if (p.liquidation.annee === annee) {
					ligne.departs += poids;
					ligne.ages += (poids * p.liquidation.age) / 4;
				}
				continue;
			}
			const salaire = lit.salaire(k);
			if (salaire > 0) {
				ligne.cotisants += poids;
				ligne.salaires += poids * salaire;
				const cotisation = lit.cotisation(salaire);
				ligne.cotisations +=
					poids * (cotisation.base + cotisation.complementaire);
				ligne.cotisationsBase += poids * cotisation.base;
			}
		}
		annees.push({
			annee,
			cotisants: ligne.cotisants,
			retraites: ligne.retraites,
			cotisations: ligne.cotisations,
			pensions: ligne.pensions,
			cotisationsBase: ligne.cotisationsBase,
			pensionsBase: ligne.pensionsBase,
			pensionMoyenne: ligne.retraites
				? ligne.pensions / ligne.retraites / 12
				: 0,
			salaireMoyen: ligne.cotisants ? ligne.salaires / ligne.cotisants : 0,
			ageMoyenDepart: ligne.departs ? ligne.ages / ligne.departs : 0,
		});
	}

	// Par génération : ce que la réforme change pour ceux qui partiront plus tard.
	const parGeneration = new Map<
		number,
		{ n: number; age: number; pension: number }
	>();
	for (let k = 0; k < n; k++) {
		const g = (population[k] as Individu).carriere.anneeNaissance;
		const p = prep.pensions[k] as Pension;
		let x = parGeneration.get(g);
		if (!x) {
			x = { n: 0, age: 0, pension: 0 };
			parGeneration.set(g, x);
		}
		x.n++;
		x.age += p.liquidation.age / 4;
		x.pension += p.mensuelleBrute;
	}
	const generations = [...parGeneration.entries()]
		.sort(([x], [y]) => x - y)
		.map(([generation, x]) => ({
			generation,
			ageMoyenDepart: x.age / x.n,
			pensionMoyenne: x.pension / x.n,
		}));
	return { annees, generations, dureeMs: performance.now() - depart };
}

/** Projette le système année par année : préparation puis trajectoires. */
export function runProjection(
	population: Individu[],
	b: Baremes,
	regles: ReglesScenario,
	options: OptionsProjection,
): Projection {
	return projeter(prepareProjection(population, b, regles, options));
}

/**
 * Photographie d'une année de la projection : qui cotise combien, qui perçoit combien,
 * avec les règles du scénario appliquées depuis l'année d'effet seulement.
 */
export function photographier(prep: Preparation, annee: number): Resultat {
	const depart = performance.now();
	const { population, b, regles } = prep;
	const lit = lecteur(prep, annee);
	const n = population.length;
	const cotisations: number[] = [];
	const poidsCotisations: number[] = [];
	const pensions: number[] = [];
	const poidsPensions: number[] = [];
	const parSexe = {
		F: { valeurs: [] as number[], poids: [] as number[] },
		H: { valeurs: [] as number[], poids: [] as number[] },
	};
	const ages = { F: 0, H: 0 };
	const pensionParIndividu = new Float64Array(n).fill(Number.NaN);
	const poidsParIndividu = new Float64Array(n);
	let autres = 0;
	let sexagenaires = 0;
	let sexagenairesRetraites = 0;
	let minimum = 0;
	let decote = 0;
	let surcote = 0;
	let parAge = 0;
	for (let k = 0; k < n; k++) {
		const w = lit.poids(k);
		if (w === 0) continue;
		poidsParIndividu[k] = w;
		const c = (population[k] as Individu).carriere;
		const age = annee - c.anneeNaissance;
		const sexagenaire = age >= 60 && age < 70;
		if (sexagenaire) sexagenaires += w;
		const annuelle = lit.pensionAnnuelle(k);
		if (annuelle !== null) {
			const p = prep.pensions[k] as Pension;
			const mensuelle = annuelle / 12;
			if (sexagenaire) sexagenairesRetraites += w;
			pensions.push(mensuelle);
			poidsPensions.push(w);
			pensionParIndividu[k] = mensuelle;
			parSexe[c.sexe].valeurs.push(mensuelle);
			parSexe[c.sexe].poids.push(w);
			ages[c.sexe] += (p.liquidation.age / 4) * w;
			if (p.cnav.minimumContributifApplique) minimum += w;
			if (p.cnav.trimestresDecote > 0) decote += w;
			if (p.cnav.trimestresSurcote > 0) surcote += w;
			const g = reglesGeneration(
				c.anneeNaissance,
				b,
				prep.avantReforme[k] ? {} : regles,
			);
			if (
				p.liquidation.age >= g.ageTauxPleinAutomatique &&
				p.cnav.trimestresValides < g.dureeRequise
			)
				parAge += w;
			continue;
		}
		const salaire = lit.salaire(k);
		if (salaire > 0) {
			const cotisation = lit.cotisation(salaire);
			cotisations.push(cotisation.base + cotisation.complementaire);
			poidsCotisations.push(w);
		} else autres += w;
	}
	const vc = Float64Array.from(cotisations);
	const vp = Float64Array.from(pensions);
	const resumeCotisations = resume(vc, poidsCotisations);
	const resumePensions = resume(vp, poidsPensions);
	const total = Math.max(1e-9, resumePensions.effectif);
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
			minimumContributif: minimum / total,
			decote: decote / total,
			surcote: surcote / total,
			tauxPleinParAge: parAge / total,
		},
		partRetraitesSexagenaires: sexagenaires
			? sexagenairesRetraites / sexagenaires
			: 0,
		ageMoyenDepart: resumePensions.effectif
			? (ages.F + ages.H) / resumePensions.effectif
			: 0,
		pensionParIndividu,
		poidsParIndividu,
		dureeMs: performance.now() - depart,
	};
}
