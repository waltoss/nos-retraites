/// <reference lib="webworker" />
import {
	type AnneeSysteme,
	ajouterRessources,
	appliquerCapitalisation,
	BAREMES_FRANCE as B,
	buildComptes,
	type Carriere,
	CHAMP_PRIVE,
	CHAMP_PUBLIC,
	type CompteCarriere,
	compareScenarios,
	computePensions,
	computeSysteme,
	detailFonctionPublique,
	type EcartDecile,
	estIndependant,
	estSalarie,
	type Facteurs,
	generatePopulation,
	generatePopulationPublique,
	type Individu,
	moisParEtat,
	type Pension,
	type Preparation,
	type Projection,
	type ProjectionCapitalisation,
	pensionVersee,
	photographier,
	poidsDeLAnnee,
	prepareProjection,
	projeter,
	projeterCapitalisation,
	pyramidesProjetees,
	type RegimeFonctionPublique,
	type Resultat,
	reglesUniverselles,
	SCENARIO_REFERENCE,
	type StatutFonctionnaire,
	SURVIE_SELON_PENSION,
	valeur,
} from "@nos-retraites/engine";
import { ANNEE_EFFET, type ScenarioMoteur } from "./leviers";
import { regimesVerseurs } from "./regimes";

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

/** Laquelle des deux populations simulées on regarde. */
export type ChampSimule = "prive" | "public";

export interface FiltrePortraits {
	/** Absent, les salariés du privé. */
	champ?: ChampSimule;
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
	/** Régimes qui lui versent une pension ou un capital, avec la loi actuelle. */
	regimes: string[];
	/** Pour un fonctionnaire : son régime, sa catégorie et le poids de ses primes dans son traitement. */
	fonctionPublique?: StatutFonctionnaire & { partPrimes: number };
}

export interface DetailPortrait {
	id: number;
	champ: ChampSimule;
	reference: { carriere: Carriere; compte: CompteCarriere; pension: Pension };
	scenario: { carriere: Carriere; compte: CompteCarriere; pension: Pension };
}

/** Ce que l'utilisateur dit de lui : rien d'autre ne sert à trouver les carrières qui lui ressemblent. */
export interface ProfilMoi {
	anneeNaissance: number;
	sexe: "F" | "H";
	/** Salaire brut mensuel de l'année de référence, ramené à un temps plein ; primes comprises pour un fonctionnaire. */
	salaireMensuel: number;
	/** Présent pour un fonctionnaire : son régime. */
	regime?: RegimeFonctionPublique;
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
	/** Ce que la pension devient après le départ, en euros constants. */
	suite: { reference: SuitePension; scenario: SuitePension };
}

/** Pension mensuelle du milieu à chaque âge, de l'âge de départ du milieu à 80 ans. */
export interface SuitePension {
	ageDebut: number;
	pensions: number[];
}
const AGE_FIN_SUITE = 80;

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
			champ?: ChampSimule;
	  }
	| { type: "projection"; id: number; scenario: ScenarioMoteur }
	| { type: "exemples"; id: number; scenario: ScenarioMoteur }
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
	| { type: "exemples"; id: number; exemples: Exemple[] }
	| { type: "moi"; id: number; resultat: ResultatMoi | null }
	| {
			type: "projection";
			id: number;
			reference: Projection;
			courant: Projection;
			systeme: { reference: AnneeSysteme[]; courant: AnneeSysteme[] };
			/** L'étage par capitalisation du scénario, s'il en a un. */
			capitalisation: ProjectionCapitalisation | null;
			anneeEffet: number;
	  };

export { ANNEE_EFFET };
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
	/** Projections de la capitalisation déjà calculées, par réglage. */
	capitalisations: Map<string, ProjectionCapitalisation>;
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

/**
 * Ce qui change les carrières et les pensions. Les ressources nouvelles et la capitalisation
 * s'ajoutent après coup : les régler ne recalcule pas la population.
 */
const coeur = (s: ScenarioMoteur): ScenarioMoteur => ({
	regles: s.regles,
	facteurs: s.facteurs,
	demographie: s.demographie,
});

function scene(complet: ScenarioMoteur): Scene {
	const s = coeur(complet);
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
			capitalisations: new Map(),
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

/** L'étage par capitalisation d'un scénario, projeté sur les salariés du privé. */
function capitalisation(s: ScenarioMoteur): ProjectionCapitalisation | null {
	const c = s.capitalisation;
	if (!c || c.taux <= 0) return null;
	const sc = scene(s);
	const cle = JSON.stringify(c);
	let p = sc.capitalisations.get(cle);
	if (!p) {
		p = projeterCapitalisation(sc.preparation, c);
		if (sc.capitalisations.size >= 4) sc.capitalisations.clear();
		sc.capitalisations.set(cle, p);
	}
	return p;
}

/** Le système entier d'un scénario complet : ses règles, puis ses ressources nouvelles et sa capitalisation. */
function systemeDe(s: ScenarioMoteur): AnneeSysteme[] {
	let annees = ajouterRessources(systeme(scene(s)), s.ressources);
	const p = capitalisation(s);
	if (p && s.capitalisation)
		annees = appliquerCapitalisation(annees, p, s.capitalisation);
	return annees;
}

function cumulEquilibre(s: ScenarioMoteur): number {
	const reference = systeme(scene(DROIT));
	return systemeDe(s).reduce(
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
	// Âge de départ des civils partis pour ancienneté : les militaires et les invalides partent
	// bien plus tôt, pour d'autres raisons que l'âge légal.
	const ages = { n: 0, s: 0 };
	preparation.population.forEach((individu, k) => {
		const p = preparation.pensions[k] as Pension;
		if (Math.abs(p.liquidation.annee - annee) > 2) return;
		const c = individu.carriere;
		if (
			c.fonctionPublique?.regime === "militaire" ||
			detailFonctionPublique(p)?.motif === "invalidite" ||
			p.mensuelleBrute === 0
		)
			return;
		ages.n += poids[k] as number;
		ages.s += ((poids[k] as number) * p.liquidation.age) / 4;
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
		ageMoyenDepart: ages.n ? ages.s / ages.n : 0,
		nouveaux: {
			peuDePrimes: groupes.peu.n ? groupes.peu.s / groupes.peu.n : 0,
			beaucoupDePrimes: groupes.beaucoup.n
				? groupes.beaucoup.s / groupes.beaucoup.n
				: 0,
		},
	};
}

function leger(r: Resultat, s: ScenarioMoteur): ResultatLeger {
	const sc = scene(s);
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
		systeme: systemeDe(s).find(
			(a) => a.annee === r.anneeReference,
		) as AnneeSysteme,
		cumulEquilibre: cumulEquilibre(s),
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
		// Les années d'artisan ou de commerçant ne sont pas des années de salaire.
		if (m === 0 || a.salaireBrut <= 0 || estIndependant(a)) continue;
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

/** La population d'un champ dans un scénario : ses carrières, ses pensions, ses poids l'année de référence. */
function vue(sc: Scene, champ: ChampSimule = "prive") {
	if (champ === "public") {
		const f = fonctionPublique(sc);
		const m = mondePublic as Monde;
		return {
			population: m.population,
			comptes: m.comptes,
			pensions: f.preparation.pensions,
			poids: poidsDeLAnnee(
				f.preparation,
				B.anneeReference,
			) as ArrayLike<number>,
		};
	}
	return {
		population: sc.monde.population,
		comptes: sc.monde.comptes,
		pensions: sc.preparation.pensions,
		poids: sc.monde.population.map((i) => i.poids) as ArrayLike<number>,
	};
}

/** Part des primes dans le traitement, la dernière année en poste avant le départ. */
function partPrimes(c: Carriere, anneeDepart: number): number {
	for (let k = c.annees.length - 1; k >= 0; k--) {
		const a = c.annees[k];
		if (a && a.annee < anneeDepart && a.primes !== undefined)
			return a.primes / Math.max(1, a.salaireBrut - a.primes);
	}
	return 0;
}

function portraits(
	s: ScenarioMoteur,
	filtre: FiltrePortraits,
	nombre: number,
): { portraits: ResumePortrait[]; total: number } {
	const reference = vue(scene(DROIT), filtre.champ);
	const courant = vue(scene(s), filtre.champ);
	const [ageMin, ageMax] = TRANCHES[filtre.ages];
	const tous: ResumePortrait[] = [];
	for (let i = 0; i < reference.population.length; i++) {
		const individu = reference.population[i] as Individu;
		const c = individu.carriere;
		const age = B.anneeReference - c.anneeNaissance;
		const poids = reference.poids[i] as number;
		if (age < ageMin || age > ageMax || poids === 0) continue;
		if (filtre.sexe !== "tous" && c.sexe !== filtre.sexe) continue;
		const r = reference.pensions[i] as Pension;
		const p = courant.pensions[i] as Pension;
		// Un fonctionnaire qui n'a pas encore pris son poste n'a rien à montrer.
		if (c.fonctionPublique && r.mensuelleBrute === 0) continue;
		tous.push({
			id: i,
			sexe: c.sexe,
			anneeNaissance: c.anneeNaissance,
			enfants: c.enfants.length,
			cadre: c.cadre,
			reference: { mensuelle: r.mensuelleBrute, age: r.liquidation.age },
			scenario: { mensuelle: p.mensuelleBrute, age: p.liquidation.age },
			poids,
			represente: null,
			...profil(c, r.liquidation.annee),
			regimes: regimesVerseurs(r),
			...(c.fonctionPublique
				? {
						fonctionPublique: {
							...c.fonctionPublique,
							partPrimes: partPrimes(c, r.liquidation.annee),
						},
					}
				: {}),
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

/** Une vie choisie pour montrer le calcul pas à pas : son portrait et tout son détail. */
export interface Exemple {
	resume: ResumePortrait;
	detail: DetailPortrait;
}

/**
 * Deux vies du privé pour montrer le calcul : une carrière de salarié sans autre régime, et une
 * carrière passée en partie comme artisan ou commerçant. Chacune est la plus proche de la pension
 * médiane de ses semblables, parmi les générations qui viennent de partir.
 */
function exemples(s: ScenarioMoteur): Exemple[] {
	const reference = vue(scene(DROIT));
	const courant = vue(scene(s));
	// Par type de carrière, les candidats et leurs années peu lisibles : sans emploi ou hors du modèle.
	const groupes: { i: number; creux: number }[][] = [[], []];
	reference.population.forEach((individu, i) => {
		const c = individu.carriere;
		const p = reference.pensions[i] as Pension;
		if (c.anneeNaissance < 1958 || c.anneeNaissance > 1962) return;
		if ((reference.poids[i] as number) === 0) return;
		let prive = 0;
		let independant = 0;
		let creux = 0;
		for (const a of c.annees) {
			if (a.annee >= p.liquidation.annee) break;
			if (moisParEtat(a).emploi === 0) creux++;
			else if (estIndependant(a)) independant++;
			else if (estSalarie(a)) prive++;
			else creux++;
		}
		if (p.parRegime.rci?.versementUnique) return;
		if (independant === 0 && prive >= 38) groupes[0]?.push({ i, creux });
		else if (independant >= 10 && prive >= 10) groupes[1]?.push({ i, creux });
	});
	const choisis: Exemple[] = [];
	for (const candidats of groupes) {
		// Une vie lisible : le moins de creux qui laisse assez de candidats.
		let groupe: number[] = [];
		for (const seuil of [4, 8, 12, 20, 99]) {
			groupe = candidats.filter((c) => c.creux <= seuil).map((c) => c.i);
			if (groupe.length >= 5) break;
		}
		const tri = [...groupe].sort(
			(x, y) =>
				(reference.pensions[x] as Pension).mensuelleBrute -
				(reference.pensions[y] as Pension).mensuelleBrute,
		);
		const i = tri[Math.floor(tri.length / 2)];
		if (i === undefined) continue;
		const c = (reference.population[i] as Individu).carriere;
		const r = reference.pensions[i] as Pension;
		const p = courant.pensions[i] as Pension;
		choisis.push({
			resume: {
				id: i,
				sexe: c.sexe,
				anneeNaissance: c.anneeNaissance,
				enfants: c.enfants.length,
				cadre: c.cadre,
				reference: { mensuelle: r.mensuelleBrute, age: r.liquidation.age },
				scenario: { mensuelle: p.mensuelleBrute, age: p.liquidation.age },
				poids: reference.poids[i] as number,
				represente: null,
				...profil(c, r.liquidation.annee),
				regimes: regimesVerseurs(r),
			},
			detail: {
				id: i,
				champ: "prive",
				reference: detail(scene(DROIT), i),
				scenario: detail(scene(s), i),
			},
		});
	}
	const fonctionnaire = exempleFonctionnaire(s);
	if (fonctionnaire) choisis.push(fonctionnaire);
	return choisis;
}

/**
 * Un fonctionnaire de l'État pour montrer le calcul : sédentaire, sans invalidité, au moins trente
 * ans de services, le plus proche de la pension médiane de ses semblables.
 */
function exempleFonctionnaire(s: ScenarioMoteur): Exemple | null {
	const reference = vue(scene(DROIT), "public");
	const courant = vue(scene(s), "public");
	const candidats: number[] = [];
	reference.population.forEach((individu, i) => {
		const c = individu.carriere;
		const f = c.fonctionPublique;
		const p = reference.pensions[i] as Pension;
		if (!f || f.regime !== "sre" || f.categorie !== "sedentaire") return;
		if (f.ageInvalidite !== undefined) return;
		if (c.anneeNaissance < 1958 || c.anneeNaissance > 1962) return;
		if ((reference.poids[i] as number) === 0) return;
		if ((detailFonctionPublique(p)?.services ?? 0) < 120) return;
		candidats.push(i);
	});
	candidats.sort(
		(x, y) =>
			(reference.pensions[x] as Pension).mensuelleBrute -
			(reference.pensions[y] as Pension).mensuelleBrute,
	);
	const i = candidats[Math.floor(candidats.length / 2)];
	if (i === undefined) return null;
	const c = (reference.population[i] as Individu).carriere;
	const r = reference.pensions[i] as Pension;
	const p = courant.pensions[i] as Pension;
	return {
		resume: {
			id: i,
			sexe: c.sexe,
			anneeNaissance: c.anneeNaissance,
			enfants: c.enfants.length,
			cadre: c.cadre,
			reference: { mensuelle: r.mensuelleBrute, age: r.liquidation.age },
			scenario: { mensuelle: p.mensuelleBrute, age: p.liquidation.age },
			poids: reference.poids[i] as number,
			represente: null,
			...profil(c, r.liquidation.annee),
			regimes: regimesVerseurs(r),
			...(c.fonctionPublique
				? {
						fonctionPublique: {
							...c.fonctionPublique,
							partPrimes: partPrimes(c, r.liquidation.annee),
						},
					}
				: {}),
		},
		detail: {
			id: i,
			champ: "public",
			reference: detail(scene(DROIT), i, "public"),
			scenario: detail(scene(s), i, "public"),
		},
	};
}

function detail(sc: Scene, i: number, champ?: ChampSimule) {
	const v = vue(sc, champ);
	return {
		carriere: (v.population[i] as Individu).carriere,
		compte: v.comptes[i] as CompteCarriere,
		pension: v.pensions[i] as Pension,
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
	const champ: ChampSimule = profil.regime ? "public" : "prive";
	const reference = vue(scene(DROIT), champ);
	const courant = vue(scene(s), champ);
	const preparationDe = (sc: Scene) =>
		champ === "public" ? fonctionPublique(sc).preparation : sc.preparation;
	// Les fonctionnaires simulés sont moins nombreux : on élargit un peu la génération.
	const ecartMax = profil.regime ? 3 : 2;
	const minimum = profil.regime ? 25 : MIN_RESSEMBLANTS;
	const candidats: { i: number; salaire: number; distance: number }[] = [];
	reference.population.forEach((individu, i) => {
		const c = individu.carriere;
		if (c.sexe !== profil.sexe) return;
		if (profil.regime && c.fonctionPublique?.regime !== profil.regime) return;
		if (Math.abs(c.anneeNaissance - profil.anneeNaissance) > ecartMax) return;
		const a = c.annees[B.anneeReference - (c.annees[0]?.annee ?? 0)];
		if (!a || a.salaireBrut <= 0 || estIndependant(a)) return;
		const mois = moisParEtat(a).emploi;
		if (mois < 6) return;
		const salaire = a.salaireBrut / (a.quotite ?? 1) / mois;
		candidats.push({
			i,
			salaire,
			distance: Math.abs(Math.log(salaire / profil.salaireMensuel)),
		});
	});
	if (candidats.length < minimum) return null;
	candidats.sort((x, y) => x.distance - y.distance);
	// À 10 % près du salaire indiqué, ou les plus proches s'ils sont trop peu nombreux.
	const proches = candidats.filter((c) => c.distance < Math.log(1.1));
	const retenus =
		proches.length >= minimum ? proches : candidats.slice(0, minimum);
	const lire = (sc: { pensions: Pension[] }) => {
		const pensions = retenus.map((c) => sc.pensions[c.i] as Pension);
		return {
			age: quartiles(pensions.map((p) => p.liquidation.age)),
			pension: quartiles(pensions.map((p) => p.mensuelleBrute)),
		};
	};
	const ecarts = retenus.map((c) => {
		const r = reference.pensions[c.i] as Pension;
		const p = courant.pensions[c.i] as Pension;
		return {
			age: p.liquidation.age - r.liquidation.age,
			pension: p.mensuelleBrute - r.mensuelleBrute,
		};
	});
	// La pension de chacun à un âge donné : sa première pension, puis ce que la revalorisation
	// et la valeur du point en font. Qui n'est pas encore parti compte pour sa première pension.
	const suite = (prep: Preparation, ageDepart: number): SuitePension => {
		const ageDebut = Math.min(AGE_FIN_SUITE, Math.ceil(ageDepart / 4));
		const pensions: number[] = [];
		for (let age = ageDebut; age <= AGE_FIN_SUITE; age++)
			pensions.push(
				quartiles(
					retenus.map((c) => {
						const p = prep.pensions[c.i] as Pension;
						const naissance = (prep.population[c.i] as Individu).carriere
							.anneeNaissance;
						const depart = pensionVersee(prep, c.i, p.liquidation.annee);
						const versee = pensionVersee(prep, c.i, naissance + age);
						return depart && versee !== null
							? (p.mensuelleBrute * versee) / depart
							: p.mensuelleBrute;
					}),
				)[1],
			);
		return { ageDebut, pensions };
	};
	const lus = { reference: lire(reference), scenario: lire(courant) };
	const generations = retenus.map(
		(c) => (reference.population[c.i] as Individu).carriere.anneeNaissance,
	);
	const salaires = retenus.map((c) => c.salaire);
	return {
		effectif: retenus.length,
		salaires: [Math.min(...salaires), Math.max(...salaires)],
		generations: [Math.min(...generations), Math.max(...generations)],
		...lus,
		suite: {
			reference: suite(preparationDe(scene(DROIT)), lus.reference.age[1]),
			scenario: suite(preparationDe(scene(s)), lus.scenario.age[1]),
		},
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
				reference: leger(reference, DROIT),
				courant: leger(courant, m.scenario),
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
					DROIT,
				),
				resultats: m.scenarios.map((s) =>
					leger(photographier(scene(s).preparation, m.annee), s),
				),
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
					courant: systemeDe(m.scenario),
				},
				capitalisation: capitalisation(m.scenario),
				anneeEffet: ANNEE_EFFET,
			});
			break;
		case "exemples":
			envoyer({ type: "exemples", id: m.id, exemples: exemples(m.scenario) });
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
					champ: m.champ ?? "prive",
					reference: detail(scene(DROIT), m.individu, m.champ),
					scenario: detail(scene(m.scenario), m.individu, m.champ),
				},
			});
			break;
	}
};
