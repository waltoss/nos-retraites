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
	releveDuChamp,
} from "./ponderation.ts";
import {
	baremesPour,
	ecreter,
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
	comptes: CompteCarriere[];
	/** Pension effective : celle du droit en vigueur pour ceux qui sont partis avant l'année d'effet. */
	pensions: Pension[];
	/** Les mêmes pensions rangées pour la projection, calculées une fois (voir `rangerPensions`). */
	montants: Montants;
	/** Les pensions des autres régimes simulés, hors du champ. */
	montantsAutres: Montants;
	/** 1 pour qui a travaillé ou perçoit une pension hors du champ : les autres n'ont rien à y compter. */
	horsChamp: Uint8Array;
	/**
	 * 1 pour qui relève du champ, parce qu'il a un compte sous une de ses affiliations. Les autres
	 * (un fonctionnaire jamais salarié, vu du privé) n'y sont ni cotisants ni retraités.
	 */
	releve: Uint8Array;
	avantReforme: Uint8Array;
	/**
	 * Part de la pension de chacun laissée par l'écrêtement du scénario, pour ceux qui sont partis
	 * avant l'année d'effet : elle vaut à partir de cette année. Les autres la portent déjà dans leur pension.
	 */
	ecretes: Float64Array;
	/** Individus simulés par génération et par sexe : le dénominateur des poids. */
	simules: Map<string, number>;
	/** Cellule de chacun dans le champ : sexe, génération et ce que le champ y ajoute. */
	cellules: string[];
	/** Vingtième de pension de chacun dans sa génération et son sexe, avec le droit en vigueur. */
	vingtiemes: Uint8Array;
}

/**
 * Pensions annuelles de chacun, rangées selon ce qu'elles deviennent après le départ : celles qui
 * ne suivent que la revalorisation, sommées ; celles des régimes dont la valeur de service ou les
 * pensions en cours bougent, une colonne par régime ; et la part des régimes de base.
 */
type Colonnes = {
	stables: Float64Array;
	bases: Float64Array;
	/** Par régime mouvant : sa place dans le modèle et la pension de chacun. */
	mouvants: { rang: number; regime: Regime; pensions: Float64Array }[];
};
type Montants = Colonnes & {
	/**
	 * Pensions des régimes qui liquident après le départ de l'affiliation principale, et l'année
	 * où elles commencent (0 : aucune).
	 */
	differes: Colonnes;
	depuis: Int32Array;
	/** Année et âge, en trimestres, de la première pension versée par ces régimes. */
	debut: Int32Array;
	ageDebut: Int32Array;
};

function rangerPensions(
	pensions: Pension[],
	modele: Modele,
	retenu: (regime: Regime) => boolean,
): Montants {
	const n = pensions.length;
	const colonnes = (): Colonnes => ({
		stables: new Float64Array(n),
		bases: new Float64Array(n),
		mouvants: [],
	});
	const tout = colonnes();
	const differes = colonnes();
	const depuis = new Int32Array(n);
	const ageDiffere = new Int32Array(n);
	const tot = new Uint8Array(n);
	modele.regimes.forEach((regime, rang) => {
		if (!retenu(regime)) return;
		const mouvant = regime.service || regime.pensionsEnCours;
		const colonne = (c: Colonnes) => {
			if (!mouvant) return c.stables;
			const pensions = new Float64Array(n);
			c.mouvants.push({ rang, regime, pensions });
			return pensions;
		};
		const maintenant = colonne(tout);
		const plusTard = colonne(differes);
		for (let k = 0; k < n; k++) {
			const p = pensions[k] as Pension;
			const detail = p.parRegime[regime.id];
			if (!detail) continue;
			const differe =
				detail.liquidation !== undefined &&
				detail.liquidation.annee > p.liquidation.annee;
			if (differe) {
				depuis[k] = detail.liquidation?.annee ?? 0;
				ageDiffere[k] = detail.liquidation?.age ?? 0;
			} else if (detail.pensionAnnuelle > 0) tot[k] = 1;
			((differe ? plusTard : maintenant)[k] as number) +=
				detail.pensionAnnuelle;
			if (regime.etage === "base")
				((differe ? differes : tout).bases[k] as number) +=
					detail.pensionAnnuelle;
		}
	});
	const debut = new Int32Array(n);
	const ageDebut = new Int32Array(n);
	for (let k = 0; k < n; k++) {
		const p = pensions[k] as Pension;
		const attend = !tot[k] && (depuis[k] as number) > 0;
		debut[k] = attend ? (depuis[k] as number) : p.liquidation.annee;
		ageDebut[k] = attend ? (ageDiffere[k] as number) : p.liquidation.age;
	}
	return { ...tout, differes, depuis, debut, ageDebut };
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
	const ecretes = new Float64Array(n).fill(1);
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
			// Jugé sur la pension à la liquidation, comme le seuil de la revalorisation.
			if (r.ecretement && p0.mensuelleBrute > 0)
				ecretes[k] =
					ecreter(p0.mensuelleBrute, r.ecretement) / p0.mensuelleBrute;
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
			// Sur la pension entière, tous régimes simulés : c'est elle qui dit le niveau de vie.
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
		reglesDe,
		baremesDe,
		options,
		modele,
		pensions,
		comptes,
		...ranger(pensions, comptes, options.champ, modele),
		avantReforme,
		ecretes,
		simules,
		cellules: population.map(cle),
		vingtiemes,
	};
}

/** Ce qui, dans un scénario préparé, dépend du champ regardé : pensions rangées et individus concernés. */
function ranger(
	pensions: Pension[],
	comptes: CompteCarriere[],
	champ: Champ,
	modele: Modele,
) {
	const n = pensions.length;
	const duChamp = (r: Regime) => !champ.regimes || champ.regimes.includes(r.id);
	const aPart = champ.aPart ?? [];
	// Hors du champ : qui a un compte sous une affiliation que le champ ne retient pas.
	const horsChamp = new Uint8Array(n);
	const releve = new Uint8Array(n).fill(1);
	const retenues = champ.affiliations;
	if (retenues)
		for (let k = 0; k < n; k++) {
			const compte = comptes[k] as CompteCarriere;
			const principale = retenues.includes(compte.affiliation);
			if (
				!principale ||
				compte.autres?.some((c) => !retenues.includes(c.affiliation))
			)
				horsChamp[k] = 1;
			if (!releveDuChamp(champ, compte)) releve[k] = 0;
		}
	return {
		montants: rangerPensions(pensions, modele, duChamp),
		montantsAutres: rangerPensions(
			pensions,
			modele,
			(r) => !duChamp(r) && !aPart.includes(r.id),
		),
		horsChamp,
		releve,
	};
}

/**
 * Le même scénario préparé, regardé dans un autre champ : mêmes individus, mêmes pensions, mêmes
 * poids si les deux champs pèsent de la même façon ; seuls changent les régimes et les années comptés.
 */
export function rechamper(prep: Preparation, champ: Champ): Preparation {
	return {
		...prep,
		options: { ...prep.options, champ },
		...ranger(prep.pensions, prep.comptes, champ, prep.modele),
		cellules: prep.population.map(cleDe(champ)),
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

/**
 * Ce que le scénario fait d'une pension après le départ, tous régimes confondus : la
 * revalorisation et, pour une pension liquidée avant l'année d'effet, l'écrêtement depuis cette année.
 */
function suite(prep: Preparation, k: number, annee: number): number {
	const i = indexation(prep, k, annee);
	return prep.avantReforme[k] && annee >= prep.options.anneeEffet
		? i * (prep.ecretes[k] as number)
		: i;
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
	const somme = (c: Colonnes) => {
		let total = c.stables[k] as number;
		for (const m of c.mouvants) {
			const pension = m.pensions[k] as number;
			if (pension === 0) continue;
			const point = enCours
				? (m.regime.pensionsEnCours?.(prep.reglesDe[k] as ReglesScenario) ?? 1)
				: 1;
			total += pension * point * (services[m.rang] as number);
		}
		return total;
	};
	const differee = montants.depuis[k] as number;
	const total =
		somme(montants) +
		(differee > 0 && annee >= differee ? somme(montants.differes) : 0);
	// Les pensions liquidées suivent les prix, plus ou moins l'écart choisi par le scénario.
	return suite(prep, k, annee) * total;
}

/** Part des régimes de base dans les pensions d'un jeu de régimes, une année donnée. */
function bases(montants: Montants, k: number, annee: number): number {
	const differee = montants.depuis[k] as number;
	return (
		(montants.bases[k] as number) +
		(differee > 0 && annee >= differee
			? (montants.differes.bases[k] as number)
			: 0)
	);
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
	if (annee < (prep.montants.debut[k] as number)) return null;
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
	// La survie déplace du poids des petites pensions vers les grandes sans changer le total d'un âge :
	// par cellule, la somme des parts et la somme des parts pesées par la chance de survie.
	const survie = options.survie;
	const sommes = new Map<string, number>();
	const survies = new Map<string, number>();
	const n = prep.population.length;
	/** Part du champ et chance de survie de chacun cette année-là, pour ceux que la survie concerne. */
	const parts = new Float64Array(n);
	const chances = new Float64Array(n);
	if (survie)
		for (let k = 0; k < n; k++) {
			const c = (prep.population[k] as Individu).carriere;
			const age = annee - c.anneeNaissance;
			if (age < 60 || age > ageMax) continue;
			const part = options.champ.part(age, c.sexe, annee, c);
			const chance = survie(c.sexe, prep.vingtiemes[k] as number, age);
			parts[k] = part;
			chances[k] = chance;
			const cellule = prep.cellules[k] as string;
			sommes.set(cellule, (sommes.get(cellule) ?? 0) + part);
			survies.set(cellule, (survies.get(cellule) ?? 0) + part * chance);
		}
	return {
		poids(k: number): number {
			const c = (prep.population[k] as Individu).carriere;
			const age = annee - c.anneeNaissance;
			if (age < ageMin || age > ageMax) return 0;
			const reels =
				(c.sexe === "F" ? pyramide.femmes : pyramide.hommes)[
					Math.min(age, pyramide.femmes.length - 1)
				] ?? 0;
			const cellule = prep.cellules[k] as string;
			const simules = prep.simules.get(cellule) ?? 1;
			if (survie && age >= 60) {
				const pesees = survies.get(cellule) ?? 0;
				return pesees > 0
					? (reels *
							(parts[k] as number) *
							(chances[k] as number) *
							(sommes.get(cellule) ?? 0)) /
							(simules * pesees)
					: 0;
			}
			return (reels * options.champ.part(age, c.sexe, annee, c)) / simules;
		},
		/** Part des régimes de base dans la pension annuelle versée cette année-là. */
		pensionBase(k: number): number {
			return suite(prep, k, annee) * bases(prep.montants, k, annee);
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
				!options.champ.aPart?.includes(a.affiliation) &&
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
				? suite(prep, k, annee) * bases(prep.montantsAutres, k, annee)
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
			if (!prep.releve[k]) continue;
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
				if (prep.montants.debut[k] === annee) {
					ligne.departs += poids;
					ligne.ages += (poids * (prep.montants.ageDebut[k] as number)) / 4;
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
	// Chacun pèse ce que sa cellule pèse dans sa génération à 65 ans : une population qui mêle
	// salariés et fonctionnaires ne les simule pas en proportion de leur nombre réel.
	const cle = cleDe(options.champ);
	const parGeneration = new Map<
		number,
		{ n: number; age: number; pension: number }
	>();
	for (let k = 0; k < n; k++) {
		if (!prep.releve[k]) continue;
		const individu = population[k] as Individu;
		const c = individu.carriere;
		const g = c.anneeNaissance;
		const w =
			options.champ.part(65, c.sexe, g + 65, c) /
			(prep.simules.get(cle(individu)) ?? 1);
		const p = prep.pensions[k] as Pension;
		let x = parGeneration.get(g);
		if (!x) {
			x = { n: 0, age: 0, pension: 0 };
			parGeneration.set(g, x);
		}
		x.n += w;
		x.age += (w * (prep.montants.ageDebut[k] as number)) / 4;
		x.pension += w * pensionDuChamp(options.champ, p);
	}
	const generations = [...parGeneration.entries()]
		.sort(([x], [y]) => x - y)
		.map(([generation, x]) => ({
			generation,
			ageMoyenDepart: x.n ? x.age / x.n : 0,
			pensionMoyenne: x.n ? x.pension / x.n : 0,
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
		if (!prep.releve[k]) continue;
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
			const ageDepart = prep.montants.ageDebut[k] as number;
			ages[c.sexe] += (ageDepart / 4) * w;
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
				ageDepart >= g.ageTauxPleinAutomatique &&
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
