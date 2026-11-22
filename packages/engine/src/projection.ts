import type { Modele, Regime } from "./affiliation.ts";
import type { Baremes } from "./baremes/types.ts";
import type { CompteCarriere } from "./compte.ts";
import {
	buildCompte,
	computePension,
	cotisationsAnnee,
} from "./liquidation.ts";
import { MODELE } from "./modele.ts";
import {
	anneeDuChamp,
	type Champ,
	dureeDuChamp,
	type Pyramide,
	pensionDuChamp,
} from "./ponderation.ts";
import {
	baremesPour,
	type ReglesScenario,
	reglesGeneration,
	reglesPour,
} from "./regles.ts";
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
	/** Affiliations, régimes et décisions ; absent, le modèle de la France. */
	modele?: Modele;
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
	/**
	 * Ce que les mêmes individus cotisent et perçoivent dans les autres régimes simulés, hors du
	 * champ : les années d'artisan ou de commerçant d'un salarié du privé, et les pensions qu'elles lui valent.
	 */
	autres: {
		cotisants: number;
		cotisations: number;
		cotisationsBase: number;
		pensions: number;
		pensionsBase: number;
	};
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
	modele: Modele = MODELE,
): Pension[] {
	return population.map((i, k) => {
		const compte = comptes?.[k] ?? buildCompte(i.carriere, b, modele);
		const r = reglesPour(regles, i.carriere.anneeNaissance, compte.affiliation);
		return computePension(i.carriere, baremesPour(b, r), {
			regles: r,
			compte,
			modele,
		});
	});
}

/** Un scénario préparé : la pension effective de chacun, une fois pour toutes les années. */
export interface Preparation {
	population: Individu[];
	b: Baremes;
	/** Barèmes avec les règles du scénario. */
	be: Baremes;
	regles: ReglesScenario;
	/** Règles et barèmes de chacun, quand le scénario en a de propres à une génération ou à une affiliation. */
	reglesDe: ReglesScenario[];
	baremesDe: Baremes[];
	options: OptionsProjection;
	modele: Modele;
	/** Pension effective : celle du droit en vigueur pour ceux qui sont partis avant l'année d'effet. */
	pensions: Pension[];
	/** Les mêmes pensions rangées pour la projection, calculées une fois (voir `rangerPensions`). */
	montants: Montants;
	/** Les pensions des autres régimes simulés, hors du champ. */
	montantsAutres: Montants;
	/** 1 pour qui a travaillé ou perçoit une pension hors du champ : les autres n'ont rien à y compter. */
	horsChamp: Uint8Array;
	avantReforme: Uint8Array;
	/** Individus simulés par génération et par sexe : le dénominateur des poids. */
	simules: Map<string, number>;
	/** Vingtième de pension de chacun dans sa génération et son sexe, avec le droit en vigueur. */
	vingtiemes: Uint8Array;
}

/**
 * Pensions annuelles de chacun, rangées selon ce qu'elles deviennent après le départ : celles qui
 * ne suivent que la revalorisation, sommées ; celles des régimes dont la valeur de service ou les
 * pensions en cours bougent, une colonne par régime ; et la part des régimes de base.
 */
type Montants = {
	stables: Float64Array;
	bases: Float64Array;
	/** Par régime mouvant : sa place dans le modèle et la pension de chacun. */
	mouvants: { rang: number; regime: Regime; pensions: Float64Array }[];
};

function rangerPensions(
	pensions: Pension[],
	modele: Modele,
	retenu: (regime: Regime) => boolean,
): Montants {
	const n = pensions.length;
	const stables = new Float64Array(n);
	const bases = new Float64Array(n);
	const mouvants: Montants["mouvants"] = [];
	modele.regimes.forEach((regime, rang) => {
		if (!retenu(regime)) return;
		const mouvant = regime.service || regime.pensionsEnCours;
		const colonne = mouvant ? new Float64Array(n) : stables;
		if (mouvant) mouvants.push({ rang, regime, pensions: colonne });
		for (let k = 0; k < n; k++) {
			const detail = (pensions[k] as Pension).parRegime[regime.id];
			if (!detail) continue;
			(colonne[k] as number) += detail.pensionAnnuelle;
			if (regime.etage === "base")
				(bases[k] as number) += detail.pensionAnnuelle;
		}
	});
	return { stables, bases, mouvants };
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
	const modele = options.modele ?? MODELE;
	// Une pension dont le régime n'est pas déclaré ne serait jamais versée.
	const declares = new Set(modele.regimes.map((r) => r.id));
	for (const a of Object.values(modele.affiliations))
		for (const id of a.regimes)
			if (!declares.has(id))
				throw new Error(
					`Régime absent du modèle : ${id} (affiliation ${a.id})`,
				);
	const cle = cleDe(options.champ);
	const inchange = Object.keys(reglesVisees).length === 0;
	// L'âge légal et la durée requise montent en charge par génération depuis l'année d'effet.
	const regles: ReglesScenario = inchange
		? reglesVisees
		: { anneeEffet, ...reglesVisees };
	const be = baremesPour(b, regles);
	const comptes =
		options.comptes ??
		population.map((i) => buildCompte(i.carriere, b, modele));
	const reference =
		options.pensionsReference ??
		computePensions(population, b, {}, comptes, modele);
	const n = population.length;
	const pensions: Pension[] = new Array(n);
	const reglesDe: ReglesScenario[] = new Array(n);
	const baremesDe: Baremes[] = new Array(n);
	const avantReforme = new Uint8Array(n);
	const simules = new Map<string, number>();
	for (let k = 0; k < n; k++) {
		const individu = population[k] as Individu;
		simules.set(cle(individu), (simules.get(cle(individu)) ?? 0) + 1);
		const p0 = reference[k] as Pension;
		const c = individu.carriere;
		const r = reglesPour(regles, c.anneeNaissance, p0.affiliation);
		const bek = r === regles ? be : baremesPour(b, r);
		reglesDe[k] = r;
		baremesDe[k] = bek;
		let p = p0;
		if (p0.liquidation.annee < anneeEffet) {
			avantReforme[k] = 1;
		} else if (!inchange) {
			p = computePension(c, bek, { regles: r, compte: comptes[k], modele });
			if (p.liquidation.annee < anneeEffet)
				p = computePension(c, bek, {
					regles: r,
					compte: comptes[k],
					modele,
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
					pensionDuChamp(options.champ, reference[x] as Pension) -
					pensionDuChamp(options.champ, reference[y] as Pension),
			);
			membres.forEach((k, rang) => {
				vingtiemes[k] = Math.floor((rang * 20) / membres.length);
			});
		}
	}
	const regimesDuChamp = options.champ.regimes;
	const duChamp = (r: Regime) =>
		!regimesDuChamp || regimesDuChamp.includes(r.id);
	// Hors du champ : qui a un compte sous une affiliation que le champ ne retient pas.
	const horsChamp = new Uint8Array(n);
	const retenues = options.champ.affiliations;
	if (retenues)
		for (let k = 0; k < n; k++) {
			const compte = comptes[k] as CompteCarriere;
			if (
				!retenues.includes(compte.affiliation) ||
				compte.autres?.some((c) => !retenues.includes(c.affiliation))
			)
				horsChamp[k] = 1;
		}
	return {
		population,
		b,
		be,
		regles,
		reglesDe,
		baremesDe,
		options,
		modele,
		pensions,
		montants: rangerPensions(pensions, modele, duChamp),
		montantsAutres: rangerPensions(pensions, modele, (r) => !duChamp(r)),
		horsChamp,
		avantReforme,
		simules,
		vingtiemes,
	};
}

/**
 * Valeur de service de chaque régime du modèle une année donnée, base 1 l'année de référence :
 * elle ne bouge que pour les régimes en points.
 */
export function servicesDeLAnnee(prep: Preparation, annee: number): number[] {
	return prep.modele.regimes.map((r) => r.service?.(prep.b, annee) ?? 1);
}

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
	const { options } = prep;
	const regles = prep.reglesDe[k] as ReglesScenario;
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

/** Pensions annuelles d'un jeu de régimes versées à un individu une année donnée. */
function verse(
	prep: Preparation,
	montants: Montants,
	k: number,
	annee: number,
	services: number[],
): number {
	// Ce que le scénario fait aux pensions déjà en cours, régime par régime.
	const enCours = prep.avantReforme[k] && annee >= prep.options.anneeEffet;
	let total = montants.stables[k] as number;
	for (const m of montants.mouvants) {
		const pension = m.pensions[k] as number;
		if (pension === 0) continue;
		const point = enCours
			? (m.regime.pensionsEnCours?.(prep.reglesDe[k] as ReglesScenario) ?? 1)
			: 1;
		total += pension * point * (services[m.rang] as number);
	}
	// Les pensions liquidées suivent les prix, plus ou moins l'écart choisi par le scénario.
	return indexation(prep, k, annee) * total;
}

/**
 * Pension annuelle versée à un individu une année donnée par les régimes du champ, en euros de
 * l'année de référence, ou null s'il n'est pas encore parti.
 */
export function pensionVersee(
	prep: Preparation,
	k: number,
	annee: number,
	services: number[] = servicesDeLAnnee(prep, annee),
): number | null {
	const p = prep.pensions[k] as Pension;
	if (annee < p.liquidation.annee) return null;
	return verse(prep, prep.montants, k, annee, services);
}

/** La même chose pour les autres régimes simulés, hors du champ ; 0 avant le départ. */
export function pensionVerseeHorsChamp(
	prep: Preparation,
	k: number,
	annee: number,
	services: number[] = servicesDeLAnnee(prep, annee),
): number {
	const p = prep.pensions[k] as Pension;
	if (annee < p.liquidation.annee) return 0;
	return verse(prep, prep.montantsAutres, k, annee, services);
}

/** Ce qu'il faut savoir d'un individu une année donnée : son poids et, s'il est retraité, sa pension. */
function lecteur(prep: Preparation, annee: number) {
	const { options, b, modele } = prep;
	const cle = cleDe(options.champ);
	const anneesConnues = Object.keys(options.pyramides).map(Number);
	const pyramide = options.pyramides[
		Math.max(
			Math.min(...anneesConnues),
			Math.min(Math.max(...anneesConnues), annee),
		)
	] as Pyramide;
	const ageMin = options.ageMin ?? 18;
	const ageMax = options.ageMax ?? 96;
	const services = servicesDeLAnnee(prep, annee);
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
		/** Part des régimes de base dans la pension annuelle versée cette année-là. */
		pensionBase(k: number): number {
			return indexation(prep, k, annee) * (prep.montants.bases[k] as number);
		},
		/** Pension annuelle versée cette année-là, ou null si l'individu n'est pas encore parti. */
		pensionAnnuelle(k: number): number | null {
			return pensionVersee(prep, k, annee, services);
		},
		/** Salaire de l'année dans le champ, 0 hors emploi ou sous une autre affiliation. */
		salaire(k: number): number {
			const c = (prep.population[k] as Individu).carriere;
			const premiere = c.annees[0]?.annee ?? annee + 1;
			const a = c.annees[annee - premiere];
			if (!a) return 0;
			// Presque tous n'ont que des années du champ : inutile d'y regarder de plus près.
			return !prep.horsChamp[k] || anneeDuChamp(options.champ, a)
				? a.salaireBrut
				: 0;
		},
		/** Vrai quand l'individu travaille cette année-là sous une affiliation simulée hors du champ. */
		travailleHorsChamp(k: number): boolean {
			if (!prep.horsChamp[k]) return false;
			const c = (prep.population[k] as Individu).carriere;
			const premiere = c.annees[0]?.annee ?? annee + 1;
			const a = c.annees[annee - premiere];
			return (
				a !== undefined &&
				a.salaireBrut > 0 &&
				!anneeDuChamp(options.champ, a) &&
				a.affiliation in modele.affiliations
			);
		},
		/** Pension annuelle versée cette année-là par les autres régimes simulés. */
		pensionHorsChamp(k: number): number {
			return prep.horsChamp[k]
				? pensionVerseeHorsChamp(prep, k, annee, services)
				: 0;
		},
		/** Part des régimes de base dans cette pension. */
		pensionBaseHorsChamp(k: number): number {
			return prep.horsChamp[k]
				? indexation(prep, k, annee) * (prep.montantsAutres.bases[k] as number)
				: 0;
		},
		/** Cotisations de l'année, selon l'affiliation de l'individu cette année-là. */
		cotisation(k: number): { base: number; complementaire: number } {
			const c = (prep.population[k] as Individu).carriere;
			const premiere = c.annees[0]?.annee ?? annee + 1;
			const a = c.annees[annee - premiere];
			if (!a) return { base: 0, complementaire: 0 };
			return cotisationsAnnee(
				a,
				annee >= options.anneeEffet ? (prep.baremesDe[k] as Baremes) : b,
				annee,
				modele,
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
		const autres = {
			cotisants: 0,
			cotisations: 0,
			cotisationsBase: 0,
			pensions: 0,
			pensionsBase: 0,
		};
		for (let k = 0; k < n; k++) {
			const poids = lit.poids(k);
			if (poids === 0) continue;
			const pension = lit.pensionAnnuelle(k);
			if (pension !== null) {
				ligne.retraites += poids;
				ligne.pensions += poids * pension;
				ligne.pensionsBase += poids * lit.pensionBase(k);
				if (prep.horsChamp[k]) {
					autres.pensions += poids * lit.pensionHorsChamp(k);
					autres.pensionsBase += poids * lit.pensionBaseHorsChamp(k);
				}
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
				const cotisation = lit.cotisation(k);
				ligne.cotisations +=
					poids * (cotisation.base + cotisation.complementaire);
				ligne.cotisationsBase += poids * cotisation.base;
			} else if (lit.travailleHorsChamp(k)) {
				const cotisation = lit.cotisation(k);
				autres.cotisants += poids;
				autres.cotisations +=
					poids * (cotisation.base + cotisation.complementaire);
				autres.cotisationsBase += poids * cotisation.base;
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
			autres,
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
		x.pension += pensionDuChamp(options.champ, p);
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
	const { population, b } = prep;
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
			const duree = dureeDuChamp(prep.options.champ, p);
			if (duree.minimumApplique) minimum += w;
			if (duree.trimestresDecote > 0) decote += w;
			if (duree.trimestresSurcote > 0) surcote += w;
			const g = reglesGeneration(
				c.anneeNaissance,
				b,
				prep.avantReforme[k] ? {} : (prep.reglesDe[k] as ReglesScenario),
			);
			if (
				p.liquidation.age >= g.ageTauxPleinAutomatique &&
				duree.trimestresValides < duree.dureeRequise
			)
				parAge += w;
			continue;
		}
		const salaire = lit.salaire(k);
		if (salaire > 0) {
			const cotisation = lit.cotisation(k);
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
