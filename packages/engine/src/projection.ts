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
import { cotisationsFonctionPublique } from "./regimes/fonctionPublique.ts";
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
	/**
	 * Mortalité selon le niveau de pension : à âge égal, les pensions élevées pèsent plus
	 * et les basses moins, sans changer le nombre total de personnes de cet âge.
	 */
	survie?: (sexe: "F" | "H", vingtieme: number, age: number) => number;
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
	/** Nombre de départs dans l'année. */
	departs: number;
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
	/** Vingtième de pension de chacun dans sa génération et son sexe, avec le droit en vigueur. */
	vingtiemes: Uint8Array;
}

const cleDe = (champ: Champ) => (individu: Individu) =>
	`${individu.carriere.sexe}${individu.carriere.anneeNaissance}${champ.cellule?.(individu.carriere) ?? ""}`;

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
	const cle = cleDe(options.champ);
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
	// Rang de pension dans la génération, avec le droit en vigueur : il ne dépend pas du scénario.
	const vingtiemes = new Uint8Array(n);
	if (options.survie) {
		const cellules = new Map<string, number[]>();
		for (let k = 0; k < n; k++) {
			const c = cle(population[k] as Individu);
			const v = cellules.get(c) ?? [];
			v.push(k);
			cellules.set(c, v);
		}
		for (const membres of cellules.values()) {
			membres.sort(
				(x, y) =>
					(reference[x] as Pension).mensuelleBrute -
					(reference[y] as Pension).mensuelleBrute,
			);
			membres.forEach((k, rang) => {
				vingtiemes[k] = Math.floor((rang * 20) / membres.length);
			});
		}
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
		vingtiemes,
	};
}

/** Valeur de service du point complémentaire une année donnée, base 1 l'année de référence. */
const valeurDeService = (b: Baremes, annee: number) =>
	b.agircArrco.indiceValeurDeService
		? valeur(b.agircArrco.indiceValeurDeService, annee)
		: 1;

/**
 * Ce que la revalorisation du scénario a fait d'une pension, une année donnée : 1 quand elle a
 * suivi les prix. L'écart aux prix court de l'année d'effet, ou de l'année qui suit le départ,
 * jusqu'à la fin de sa durée ; les pensions sous le seuil suivent les prix.
 */
export function indexation(
	prep: Preparation,
	k: number,
	annee: number,
): number {
	const { regles, options } = prep;
	const ecart = regles.revalorisationReelle ?? 0;
	if (ecart === 0) return 1;
	const p = prep.pensions[k] as Pension;
	if (p.mensuelleBrute < (regles.revalorisationSeuil ?? 0)) return 1;
	const debut = Math.max(options.anneeEffet, p.liquidation.annee + 1);
	const fin =
		regles.revalorisationDuree === undefined
			? annee
			: Math.min(annee, options.anneeEffet + regles.revalorisationDuree - 1);
	return (1 + ecart) ** Math.max(0, fin - debut + 1);
}

/**
 * Pension annuelle versée à un individu une année donnée, en euros de l'année de référence,
 * ou null s'il n'est pas encore parti.
 */
export function pensionVersee(
	prep: Preparation,
	k: number,
	annee: number,
	service: number = valeurDeService(prep.b, annee),
): number | null {
	const p = prep.pensions[k] as Pension;
	if (annee < p.liquidation.annee) return null;
	// La valeur du point vaut pour toutes les pensions complémentaires en cours.
	const point =
		prep.avantReforme[k] && annee >= prep.options.anneeEffet
			? (prep.regles.valeurDuPoint ?? 1)
			: 1;
	// Les pensions liquidées suivent les prix, plus ou moins l'écart choisi par le scénario.
	return (
		indexation(prep, k, annee) *
		(p.cnav.pensionAnnuelle +
			p.agircArrco.pensionAnnuelle * point * service +
			(p.fonctionPublique?.pensionAnnuelle ?? 0))
	);
}

/** Ce qu'il faut savoir d'un individu une année donnée : son poids et, s'il est retraité, sa pension. */
function lecteur(prep: Preparation, annee: number) {
	const { options, b } = prep;
	const cle = cleDe(options.champ);
	const fp = b.fonctionPublique;
	const anneesConnues = Object.keys(options.pyramides).map(Number);
	const pyramide = options.pyramides[
		Math.max(
			Math.min(...anneesConnues),
			Math.min(Math.max(...anneesConnues), annee),
		)
	] as Pyramide;
	const ageMin = options.ageMin ?? 18;
	const ageMax = options.ageMax ?? 96;
	const service = valeurDeService(b, annee);
	// Somme des chances de survie de chaque génération : les poids d'un âge gardent le même total.
	const survie = options.survie;
	const survies = new Map<string, number>();
	const chance = (k: number, age: number) => {
		const c = (prep.population[k] as Individu).carriere;
		return survie ? survie(c.sexe, prep.vingtiemes[k] as number, age) : 1;
	};
	if (survie)
		for (let k = 0; k < prep.population.length; k++) {
			const individu = prep.population[k] as Individu;
			const age = annee - individu.carriere.anneeNaissance;
			if (age < 60 || age > ageMax) continue;
			survies.set(
				cle(individu),
				(survies.get(cle(individu)) ?? 0) + chance(k, age),
			);
		}
	return {
		poids(k: number): number {
			const individu = prep.population[k] as Individu;
			const c = individu.carriere;
			const age = annee - c.anneeNaissance;
			if (age < ageMin || age > ageMax) return 0;
			if (survie && age >= 60) {
				const reels = (c.sexe === "F" ? pyramide.femmes : pyramide.hommes)[
					Math.min(age, pyramide.femmes.length - 1)
				];
				return (
					((reels ?? 0) *
						options.champ.part(age, c.sexe, annee, c) *
						chance(k, age)) /
					(survies.get(cle(individu)) ?? 1)
				);
			}
			const reels = (c.sexe === "F" ? pyramide.femmes : pyramide.hommes)[
				Math.min(age, pyramide.femmes.length - 1)
			];
			return (
				((reels ?? 0) * options.champ.part(age, c.sexe, annee, c)) /
				(prep.simules.get(cle(individu)) ?? 1)
			);
		},
		/** Part du régime de base dans la pension annuelle versée cette année-là. */
		pensionBase(k: number): number {
			const p = prep.pensions[k] as Pension;
			return indexation(prep, k, annee) * p.cnav.pensionAnnuelle;
		},
		/** Pension annuelle versée cette année-là, ou null si l'individu n'est pas encore parti. */
		pensionAnnuelle(k: number): number | null {
			return pensionVersee(prep, k, annee, service);
		},
		/** Salaire de l'année, 0 hors emploi. */
		salaire(k: number): number {
			const c = (prep.population[k] as Individu).carriere;
			const premiere = c.annees[0]?.annee ?? annee + 1;
			return c.annees[annee - premiere]?.salaireBrut ?? 0;
		},
		/** Cotisations de l'année ; pour un fonctionnaire, celles de son régime sur son traitement. */
		cotisation(
			salaire: number,
			k: number,
		): { base: number; complementaire: number } {
			const c = (prep.population[k] as Individu).carriere;
			if (c.fonctionPublique && fp) {
				const premiere = c.annees[0]?.annee ?? annee + 1;
				const primes = c.annees[annee - premiere]?.primes ?? 0;
				return {
					base: cotisationsFonctionPublique(
						salaire - primes,
						c.fonctionPublique.regime,
						fp,
					),
					complementaire: 0,
				};
			}
			return detailCotisations(
				salaire,
				annee >= options.anneeEffet ? prep.be : b,
				annee,
			);
		},
	};
}

/** Poids de chaque individu une année donnée : le nombre de personnes réelles qu'il représente alors. */
export function poidsDeLAnnee(prep: Preparation, annee: number): Float64Array {
	const lit = lecteur(prep, annee);
	const poids = new Float64Array(prep.population.length);
	for (let k = 0; k < poids.length; k++) poids[k] = lit.poids(k);
	return poids;
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
				const cotisation = lit.cotisation(salaire, k);
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
			departs: ligne.departs,
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
				p.cnav.trimestresValides < p.cnav.dureeRequise
			)
				parAge += w;
			continue;
		}
		const salaire = lit.salaire(k);
		if (salaire > 0) {
			const cotisation = lit.cotisation(salaire, k);
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
