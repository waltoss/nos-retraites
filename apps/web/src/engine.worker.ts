/// <reference lib="webworker" />
import {
	type AnneeSysteme,
	BAREMES_FRANCE as B,
	buildComptes,
	type Carriere,
	CHAMP_PRIVE,
	CHAMP_PUBLIC,
	type CompteCarriere,
	compareScenarios,
	computePensions,
	computeSysteme,
	type EcartDecile,
	type Facteurs,
	generatePopulation,
	generatePopulationPublique,
	type Individu,
	moisParEtat,
	type Pension,
	type Preparation,
	type Projection,
	photographier,
	poidsDeLAnnee,
	prepareProjection,
	projeter,
	pyramidesProjetees,
	type Resultat,
	reglesUniverselles,
	SCENARIO_REFERENCE,
	SURVIE_SELON_PENSION,
	valeur,
} from "@nos-retraites/engine";
import type { ScenarioMoteur } from "./leviers";

export type ResultatLeger = Omit<
	Resultat,
	"cotisations" | "pensions" | "pensionParIndividu" | "poidsParIndividu"
> & {
	cotisations: Omit<Resultat["cotisations"], "valeurs">;
	pensions: Omit<Resultat["pensions"], "valeurs">;
	/** L'équation du système entier, tous régimes, l'année photographiée. */
	systeme: AnneeSysteme;
	fonctionPublique: FaitsFonctionPublique;
	/**
	 * Écart de solde du système entier face à la loi actuelle, cumulé jusqu'à la fin
	 * de la projection, en euros de l'année de référence et sans intérêts.
	 */
	cumulEquilibre: number;
};

/** Les fonctionnaires civils de l'État, des collectivités et des hôpitaux, l'année photographiée. */
export interface FaitsFonctionPublique {
	cotisants: number;
	retraites: number;
	/** Pensions versées dans l'année, en euros. */
	pensions: number;
	/** Pension mensuelle moyenne des retraités. */
	pensionMoyenne: number;
	ageMoyenDepart: number;
	/**
	 * Première pension mensuelle de ceux qui partent autour de cette année-là (cinq années groupées),
	 * selon que leurs primes pèsent moins ou plus que le seuil, en part du traitement.
	 */
	nouveaux: { peuDePrimes: number; beaucoupDePrimes: number };
}

/** Part du traitement à partir de laquelle un fonctionnaire a « beaucoup de primes ». */
export const SEUIL_PRIMES = 0.3;

export type TrancheAge = "seniors" | "actifs" | "jeunes";

export interface FiltrePortraits {
	sexe: "F" | "H" | "tous";
	niveau: "tous" | "bas" | "milieu" | "haut" | "touches";
	ages: TrancheAge;
}

export interface ResumePortrait {
	id: number;
	sexe: "F" | "H";
	anneeNaissance: number;
	enfants: number;
	cadre: boolean;
	reference: { mensuelle: number; age: number };
	scenario: { mensuelle: number; age: number };
	/** Nombre de personnes réelles que cet individu représente. */
	poids: number;
	/** Personnes réelles dont ce portrait tient lieu dans la liste affichée ; null si le tirage n'est pas représentatif. */
	represente: number | null;
	/** Salaire moyen à temps plein sur la carrière, en part du plafond. */
	niveauSalaire: number;
	anneesEmploi: number;
}

export interface DetailPortrait {
	id: number;
	reference: { carriere: Carriere; compte: CompteCarriere; pension: Pension };
	scenario: { carriere: Carriere; compte: CompteCarriere; pension: Pension };
}

/** Ce que l'utilisateur dit de lui : rien d'autre ne sert à trouver les carrières qui lui ressemblent. */
export interface ProfilMoi {
	anneeNaissance: number;
	sexe: "F" | "H";
	/** Salaire brut mensuel de l'année de référence, ramené à un temps plein. */
	salaireMensuel: number;
}

/** Premier quartile, médiane et troisième quartile. */
export type Fourchette = [bas: number, mediane: number, haut: number];

export interface ResultatMoi {
	/** Carrières simulées retenues. */
	effectif: number;
	/** Bornes des salaires mensuels et des années de naissance retenus. */
	salaires: [min: number, max: number];
	generations: [min: number, max: number];
	reference: { age: Fourchette; pension: Fourchette };
	scenario: { age: Fourchette; pension: Fourchette };
	/** Écart moyen, personne par personne, entre le scénario et la loi actuelle ; l'âge en trimestres entiers. */
	ecart: { age: number; pension: number };
}

export type Requete =
	| { type: "init"; taille: number }
	| { type: "run"; id: number; scenario: ScenarioMoteur; annee: number }
	| {
			type: "decisions";
			id: number;
			scenarios: ScenarioMoteur[];
			annee: number;
	  }
	| {
			type: "portraits";
			id: number;
			scenario: ScenarioMoteur;
			filtre: FiltrePortraits;
			nombre: number;
	  }
	| {
			type: "portrait";
			id: number;
			scenario: ScenarioMoteur;
			individu: number;
	  }
	| { type: "projection"; id: number; scenario: ScenarioMoteur }
	| { type: "moi"; id: number; scenario: ScenarioMoteur; profil: ProfilMoi };

export type Reponse =
	| { type: "ready" }
	| {
			type: "result";
			id: number;
			reference: ResultatLeger;
			courant: ResultatLeger;
			ecarts: EcartDecile[];
	  }
	| {
			type: "decisions";
			id: number;
			reference: ResultatLeger;
			resultats: ResultatLeger[];
	  }
	| {
			type: "portraits";
			id: number;
			portraits: ResumePortrait[];
			/** Personnes réelles représentées par l'ensemble où les portraits sont tirés. */
			total: number;
	  }
	| { type: "portrait"; id: number; detail: DetailPortrait }
	| { type: "moi"; id: number; resultat: ResultatMoi | null }
	| {
			type: "projection";
			id: number;
			reference: Projection;
			courant: Projection;
			systeme: { reference: AnneeSysteme[]; courant: AnneeSysteme[] };
			anneeEffet: number;
	  };

/** Première année d'application d'une réforme votée après l'élection de 2027. */
export const ANNEE_EFFET = 2028;
const FIN_PROJECTION = 2070;

interface Monde {
	population: Individu[];
	comptes: CompteCarriere[];
}

/** Un scénario prêt à être regardé : sa population, ses pensions, ses trajectoires. */
interface Scene {
	scenario: ScenarioMoteur;
	monde: Monde;
	preparation: Preparation;
	projection: Projection | null;
	/** Les fonctionnaires du même scénario, préparés à la demande. */
	fonctionPublique: { preparation: Preparation; projection: Projection } | null;
	systeme: AnneeSysteme[] | null;
}

let taille = SCENARIO_REFERENCE.taille;
const mondes = new Map<string, Monde>();
const scenes = new Map<string, Scene>();
let pensionsReference: Pension[] | null = null;
const DROIT: ScenarioMoteur = { regles: {}, facteurs: {}, demographie: {} };

/** Une population par jeu de facteurs ; ils ne changent les carrières qu'à partir de l'année d'effet. */
function monde(facteurs: Facteurs): Monde {
	const cle = JSON.stringify(facteurs);
	let m = mondes.get(cle);
	if (!m) {
		const population = generatePopulation(
			{ ...SCENARIO_REFERENCE, taille, facteurs, anneeEffet: ANNEE_EFFET },
			B,
		);
		m = { population, comptes: buildComptes(population, B) };
		if (mondes.size >= 4) {
			const ancienne = [...mondes.keys()].find((k) => k !== "{}");
			if (ancienne) mondes.delete(ancienne);
		}
		mondes.set(cle, m);
	}
	return m;
}

function scene(s: ScenarioMoteur): Scene {
	const cle = JSON.stringify(s);
	let sc = scenes.get(cle);
	if (!sc) {
		const base = monde({});
		if (!pensionsReference)
			pensionsReference = computePensions(base.population, B, {}, base.comptes);
		const sansFacteur = Object.keys(s.facteurs).length === 0;
		const m = sansFacteur ? base : monde(s.facteurs);
		sc = {
			scenario: s,
			monde: m,
			preparation: prepareProjection(m.population, B, s.regles, {
				debut: B.anneeReference,
				fin: FIN_PROJECTION,
				pyramides: pyramidesProjetees(s.demographie),
				champ: CHAMP_PRIVE,
				survie: SURVIE_SELON_PENSION,
				anneeEffet: ANNEE_EFFET,
				comptes: m.comptes,
				// Avant la réforme les carrières sont les mêmes : les pensions déjà liquidées aussi.
				pensionsReference: sansFacteur ? pensionsReference : undefined,
			}),
			projection: null,
			fonctionPublique: null,
			systeme: null,
		};
		if (scenes.size >= 4) {
			const ancienne = [...scenes.keys()].find(
				(k) => k !== JSON.stringify(DROIT),
			);
			if (ancienne) scenes.delete(ancienne);
		}
		scenes.set(cle, sc);
	}
	return sc;
}

function trajectoires(sc: Scene): Projection {
	if (!sc.projection) sc.projection = projeter(sc.preparation);
	return sc.projection;
}

let mondePublic: (Monde & { pensions: Pension[] }) | null = null;

/** Les fonctionnaires dans un scénario : même population pour tous, les facteurs d'emploi ne les touchent pas. */
function fonctionPublique(sc: Scene) {
	if (!sc.fonctionPublique) {
		if (!mondePublic) {
			const population = generatePopulationPublique(B);
			const comptes = buildComptes(population, B);
			mondePublic = {
				population,
				comptes,
				pensions: computePensions(population, B, {}, comptes),
			};
		}
		const preparation = prepareProjection(
			mondePublic.population,
			B,
			sc.scenario.regles,
			{
				debut: B.anneeReference,
				fin: FIN_PROJECTION,
				pyramides: pyramidesProjetees(sc.scenario.demographie),
				champ: CHAMP_PUBLIC,
				anneeEffet: ANNEE_EFFET,
				comptes: mondePublic.comptes,
				pensionsReference: mondePublic.pensions,
			},
		);
		sc.fonctionPublique = { preparation, projection: projeter(preparation) };
	}
	return sc.fonctionPublique;
}

/** Le scénario étendu au système entier, année par année. */
function systeme(sc: Scene): AnneeSysteme[] {
	if (!sc.systeme) {
		// Les autres régimes ne suivent que les règles communes à tous : on projette aussi
		// le scénario sans ses règles propres au privé, quand il en a.
		const communes = reglesUniverselles(sc.scenario.regles);
		const universel =
			Object.keys(communes).length === Object.keys(sc.scenario.regles).length
				? sc
				: scene({ ...sc.scenario, regles: communes });
		sc.systeme = computeSysteme(
			trajectoires(scene(DROIT)),
			trajectoires(sc),
			undefined,
			trajectoires(universel),
			{
				reference: fonctionPublique(scene(DROIT)).projection,
				scenario: fonctionPublique(sc).projection,
			},
		);
	}
	return sc.systeme;
}

function cumulEquilibre(sc: Scene): number {
	const reference = systeme(scene(DROIT));
	return systeme(sc).reduce(
		(t, a, i) => t + a.solde - (reference[i]?.solde ?? a.solde),
		0,
	);
}

function faitsFonctionPublique(
	sc: Scene,
	annee: number,
): FaitsFonctionPublique {
	const { preparation, projection } = fonctionPublique(sc);
	const a = projection.annees.find((x) => x.annee === annee);
	const poids = poidsDeLAnnee(preparation, annee);
	const groupes = { peu: { n: 0, s: 0 }, beaucoup: { n: 0, s: 0 } };
	preparation.population.forEach((individu, k) => {
		const p = preparation.pensions[k] as Pension;
		if (Math.abs(p.liquidation.annee - annee) > 2) return;
		const c = individu.carriere;
		const derniere =
			c.annees[p.liquidation.annee - 1 - (c.annees[0]?.annee ?? 0)];
		if (!derniere || derniere.primes === undefined) return;
		const part = derniere.primes / (derniere.salaireBrut - derniere.primes);
		const g = part >= SEUIL_PRIMES ? groupes.beaucoup : groupes.peu;
		g.n += poids[k] as number;
		g.s += (poids[k] as number) * p.mensuelleBrute;
	});
	return {
		cotisants: a?.cotisants ?? 0,
		retraites: a?.retraites ?? 0,
		pensions: a?.pensions ?? 0,
		pensionMoyenne: a?.pensionMoyenne ?? 0,
		ageMoyenDepart: a?.ageMoyenDepart ?? 0,
		nouveaux: {
			peuDePrimes: groupes.peu.n ? groupes.peu.s / groupes.peu.n : 0,
			beaucoupDePrimes: groupes.beaucoup.n
				? groupes.beaucoup.s / groupes.beaucoup.n
				: 0,
		},
	};
}

function leger(r: Resultat, sc: Scene): ResultatLeger {
	const {
		pensionParIndividu: _p,
		poidsParIndividu: _w,
		cotisations,
		pensions,
		...reste
	} = r;
	return {
		...reste,
		cotisations: {
			resume: cotisations.resume,
			histogramme: cotisations.histogramme,
		},
		pensions: { resume: pensions.resume, histogramme: pensions.histogramme },
		fonctionPublique: faitsFonctionPublique(sc, r.anneeReference),
		systeme: systeme(sc).find(
			(a) => a.annee === r.anneeReference,
		) as AnneeSysteme,
		cumulEquilibre: cumulEquilibre(sc),
	};
}

/** Niveau de salaire et durée d'emploi d'une carrière avant le départ, pour l'habillage des portraits. */
function profil(
	c: Carriere,
	anneeDepart: number,
): { niveauSalaire: number; anneesEmploi: number } {
	let mois = 0;
	let somme = 0;
	for (const a of c.annees) {
		if (a.annee >= anneeDepart) break;
		const m = moisParEtat(a).emploi;
		if (m === 0 || a.salaireBrut <= 0) continue;
		mois += m;
		// Salaire ramené à un temps plein sur l'année, en part du plafond de l'époque.
		somme +=
			(a.salaireBrut / (a.quotite ?? 1) / valeur(B.cnav.pass, a.annee)) * 12;
	}
	return { niveauSalaire: mois ? somme / mois : 0, anneesEmploi: mois / 12 };
}

const TRANCHES: Record<TrancheAge, [min: number, max: number]> = {
	seniors: [60, 96],
	actifs: [40, 59],
	jeunes: [20, 39],
};

function portraits(
	s: ScenarioMoteur,
	filtre: FiltrePortraits,
	nombre: number,
): { portraits: ResumePortrait[]; total: number } {
	const reference = scene(DROIT);
	const courant = scene(s);
	const [ageMin, ageMax] = TRANCHES[filtre.ages];
	const tous: ResumePortrait[] = [];
	for (let i = 0; i < reference.monde.population.length; i++) {
		const individu = reference.monde.population[i] as Individu;
		const c = individu.carriere;
		const age = B.anneeReference - c.anneeNaissance;
		if (age < ageMin || age > ageMax || individu.poids === 0) continue;
		if (filtre.sexe !== "tous" && c.sexe !== filtre.sexe) continue;
		const r = reference.preparation.pensions[i] as Pension;
		const p = courant.preparation.pensions[i] as Pension;
		tous.push({
			id: i,
			sexe: c.sexe,
			anneeNaissance: c.anneeNaissance,
			enfants: c.enfants.length,
			cadre: c.cadre,
			reference: { mensuelle: r.mensuelleBrute, age: r.liquidation.age },
			scenario: { mensuelle: p.mensuelleBrute, age: p.liquidation.age },
			poids: individu.poids,
			represente: null,
			...profil(c, r.liquidation.annee),
		});
	}
	tous.sort((x, y) => x.reference.mensuelle - y.reference.mensuelle);
	const poids = (liste: ResumePortrait[]) =>
		liste.reduce((t, p) => t + p.poids, 0);
	/** Tranche de la liste triée, entre deux parts du poids total. */
	const tranche = (de: number, a: number) => {
		const total = poids(tous);
		let cumul = 0;
		return tous.filter((p) => {
			const milieu = (cumul + p.poids / 2) / total;
			cumul += p.poids;
			return milieu >= de && milieu < a;
		});
	};
	let choisis = tous;
	if (filtre.niveau === "bas") choisis = tranche(0, 1 / 3);
	else if (filtre.niveau === "milieu") choisis = tranche(1 / 3, 2 / 3);
	else if (filtre.niveau === "haut") choisis = tranche(2 / 3, 1.01);
	else if (filtre.niveau === "touches") {
		const effet = (p: ResumePortrait) =>
			Math.abs(p.scenario.mensuelle - p.reference.mensuelle) /
				Math.max(1, p.reference.mensuelle) +
			Math.abs(p.scenario.age - p.reference.age) / 40;
		choisis = [...tous]
			.sort((x, y) => effet(y) - effet(x))
			.slice(0, Math.max(nombre, Math.floor(tous.length / 10)));
	}
	// Tirage représentatif : un portrait au milieu de chaque part égale du poids total.
	const total = poids(choisis);
	const pris: ResumePortrait[] = [];
	let cumul = 0;
	let k = 0;
	for (const p of choisis) {
		cumul += p.poids;
		while (k < nombre && cumul >= ((k + 0.5) / nombre) * total) {
			if (pris[pris.length - 1] !== p) pris.push(p);
			k++;
		}
	}
	const part = filtre.niveau === "touches" ? null : total / pris.length;
	return {
		portraits: pris.map((p) => ({ ...p, represente: part })),
		total,
	};
}

function detail(sc: Scene, i: number) {
	return {
		carriere: (sc.monde.population[i] as Individu).carriere,
		compte: sc.monde.comptes[i] as CompteCarriere,
		pension: sc.preparation.pensions[i] as Pension,
	};
}

const quartiles = (valeurs: number[]): Fourchette => {
	const tri = [...valeurs].sort((x, y) => x - y);
	const q = (p: number) => tri[Math.round(p * (tri.length - 1))] ?? 0;
	return [q(0.25), q(0.5), q(0.75)];
};
const MIN_RESSEMBLANTS = 40;

/** Les carrières simulées qui ressemblent à l'utilisateur, et ce qu'elles deviennent dans le scénario. */
function moi(s: ScenarioMoteur, profil: ProfilMoi): ResultatMoi | null {
	const reference = scene(DROIT);
	const courant = scene(s);
	const candidats: { i: number; salaire: number; distance: number }[] = [];
	reference.monde.population.forEach((individu, i) => {
		const c = individu.carriere;
		if (c.sexe !== profil.sexe) return;
		if (Math.abs(c.anneeNaissance - profil.anneeNaissance) > 2) return;
		const a = c.annees[B.anneeReference - (c.annees[0]?.annee ?? 0)];
		if (!a || a.salaireBrut <= 0) return;
		const mois = moisParEtat(a).emploi;
		if (mois < 6) return;
		const salaire = a.salaireBrut / (a.quotite ?? 1) / mois;
		candidats.push({
			i,
			salaire,
			distance: Math.abs(Math.log(salaire / profil.salaireMensuel)),
		});
	});
	if (candidats.length < MIN_RESSEMBLANTS) return null;
	candidats.sort((x, y) => x.distance - y.distance);
	// À 10 % près du salaire indiqué, ou les plus proches s'ils sont trop peu nombreux.
	const proches = candidats.filter((c) => c.distance < Math.log(1.1));
	const retenus =
		proches.length >= MIN_RESSEMBLANTS
			? proches
			: candidats.slice(0, MIN_RESSEMBLANTS);
	const lire = (sc: Scene) => {
		const pensions = retenus.map(
			(c) => sc.preparation.pensions[c.i] as Pension,
		);
		return {
			age: quartiles(pensions.map((p) => p.liquidation.age)),
			pension: quartiles(pensions.map((p) => p.mensuelleBrute)),
		};
	};
	const ecarts = retenus.map((c) => {
		const r = reference.preparation.pensions[c.i] as Pension;
		const p = courant.preparation.pensions[c.i] as Pension;
		return {
			age: p.liquidation.age - r.liquidation.age,
			pension: p.mensuelleBrute - r.mensuelleBrute,
		};
	});
	const generations = retenus.map(
		(c) =>
			(reference.monde.population[c.i] as Individu).carriere.anneeNaissance,
	);
	const salaires = retenus.map((c) => c.salaire);
	return {
		effectif: retenus.length,
		salaires: [Math.min(...salaires), Math.max(...salaires)],
		generations: [Math.min(...generations), Math.max(...generations)],
		reference: lire(reference),
		scenario: lire(courant),
		ecart: {
			age: Math.round(ecarts.reduce((t, e) => t + e.age, 0) / ecarts.length),
			pension: ecarts.reduce((t, e) => t + e.pension, 0) / ecarts.length,
		},
	};
}

const envoyer = (r: Reponse) => self.postMessage(r);

self.onmessage = (e: MessageEvent<Requete>) => {
	const m = e.data;
	switch (m.type) {
		case "init":
			taille = m.taille;
			mondes.clear();
			scenes.clear();
			pensionsReference = null;
			scene(DROIT);
			envoyer({ type: "ready" });
			break;
		case "run": {
			const sc = scene(m.scenario);
			const reference = photographier(scene(DROIT).preparation, m.annee);
			const courant = photographier(sc.preparation, m.annee);
			envoyer({
				type: "result",
				id: m.id,
				reference: leger(reference, scene(DROIT)),
				courant: leger(courant, sc),
				ecarts: compareScenarios(
					reference.pensionParIndividu,
					courant.pensionParIndividu,
					reference.poidsParIndividu,
				),
			});
			break;
		}
		case "decisions":
			envoyer({
				type: "decisions",
				id: m.id,
				reference: leger(
					photographier(scene(DROIT).preparation, m.annee),
					scene(DROIT),
				),
				resultats: m.scenarios.map((s) => {
					const sc = scene(s);
					return leger(photographier(sc.preparation, m.annee), sc);
				}),
			});
			break;
		case "portraits":
			envoyer({
				type: "portraits",
				id: m.id,
				...portraits(m.scenario, m.filtre, m.nombre),
			});
			break;
		case "projection":
			envoyer({
				type: "projection",
				id: m.id,
				reference: trajectoires(scene(DROIT)),
				courant: trajectoires(scene(m.scenario)),
				systeme: {
					reference: systeme(scene(DROIT)),
					courant: systeme(scene(m.scenario)),
				},
				anneeEffet: ANNEE_EFFET,
			});
			break;
		case "moi":
			envoyer({ type: "moi", id: m.id, resultat: moi(m.scenario, m.profil) });
			break;
		case "portrait":
			envoyer({
				type: "portrait",
				id: m.id,
				detail: {
					id: m.individu,
					reference: detail(scene(DROIT), m.individu),
					scenario: detail(scene(m.scenario), m.individu),
				},
			});
			break;
	}
};
