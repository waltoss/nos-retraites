/**
 * Construit la pondération de la population simulée (packages/engine/src/population/france.data.json)
 * à partir de data/references/population.json.
 *
 * Poids d'un individu = population réelle de son âge et de son sexe (Insee) × part du champ « privé »,
 * partagée entre les individus simulés du même âge et du même sexe.
 *
 * La part du champ est réglée pour que le modèle retrouve :
 * - avant 58 ans, les cotisants de l'Agirc-Arrco par sexe et âge ;
 * - à partir de 68 ans, les retraités de droit direct de l'Agirc-Arrco par sexe et âge ;
 * - entre les deux, une interpolation linéaire.
 * Les effectifs par âge de fin 2024 sont appliqués tels quels aux mêmes âges en 2026.
 *
 * La population est une : les fonctionnaires passés par le privé (seconde série d'individus, pesés
 * par scripts/build-population-publique.ts) apportent leurs propres cotisants et retraités du
 * privé. Pour ne compter personne deux fois, les individus du privé de même sexe, de même âge et
 * de même durée au privé pèsent d'autant moins (`resteParDuree`) ; quand une tranche de durée n'y
 * suffit pas, le surplus est pris sur la tranche suivante, puis sur tous.
 *
 * À relancer après tout changement des hypothèses du générateur, et après build-population-publique.
 */
import reference from "../data/references/population.json" with {
	type: "json",
};
import projections from "../data/references/projections.json" with {
	type: "json",
};
import {
	BAREMES_FRANCE as B,
	buildComptes,
	CHAMP_PRIVE,
	CHAMP_PUBLIC,
	type Champ,
	computePensions,
	cotisationsAnnee,
	departDuChamp,
	estSalarie,
	GENERATIONS_PONDEREES,
	generatePopulation,
	generatePopulationPublique,
	type Individu,
	type Pension,
	ponderer,
	runSimulation,
	SCENARIO_PUBLIC,
	SCENARIO_REFERENCE,
	trancheDeDuree,
} from "../packages/engine/src/index.ts";

const ANNEE = B.anneeReference;
const [premiere, derniere] = GENERATIONS_PONDEREES;
const AGE_MIN = ANNEE - derniere;
const AGE_MAX = ANNEE - premiere;
const AGE_FIN_COTISANTS = 57;
const AGE_DEBUT_RETRAITES = 68;
const SEXES = ["femmes", "hommes"] as const;
type Cle = (typeof SEXES)[number];
type Table = Record<string, number>;

/** Somme des âges d'une table à partir d'un âge, clés regroupées comprises (« 70ouPlus », « plusDe95 »). */
function lire(table: Table, age: number, dernier: boolean): number {
	if (!dernier) return table[String(age)] ?? 0;
	let total = 0;
	for (const [cle, n] of Object.entries(table)) {
		const a = Number.parseInt(cle, 10);
		if (Number.isNaN(a) ? /plus/i.test(cle) : a >= age) total += n;
	}
	return total;
}

/**
 * L'Insee compte l'âge révolu au 1er janvier ; le moteur compte l'âge atteint dans l'année.
 * Une personne d'âge A pour le moteur a donc l'âge A - 1 dans la pyramide.
 */
const DECALAGE_AGE = 1;
const estimee = reference.pyramideDesAges.france;
const decaler = (table: Table): Table =>
	Object.fromEntries(
		Object.entries(table).map(([cle, n]) => {
			const a = Number.parseInt(cle, 10);
			return [/plus/i.test(cle) ? cle : String(a + DECALAGE_AGE), n];
		}),
	);
const pyramide = {
	femmes: decaler(estimee.femmes as Table),
	hommes: decaler(estimee.hommes as Table),
};
const cotisants = reference.agircArrco.cotisants.parSexeEtAge;
const retraites = reference.agircArrco.retraitesDroitDirect.parSexeEtAge;

// Taux du modèle par sexe et âge, sur un grand échantillon non pondéré.
const population = generatePopulation(
	{ ...SCENARIO_REFERENCE, taille: 120000, ponderation: undefined },
	B,
);
const r = runSimulation(population, B, {}, buildComptes(population, B));
/**
 * Tranches de durée au privé, en années de salarié avant 62 ans : d'abord ceux qui ont aussi des
 * années dans un régime non simulé, puis les autres. La dernière colonne : qui a été indépendant.
 */
const BORNES = [5, 10, 15, 20, 30];
const DUREES = BORNES.length + 1;
const NB = 2 * DUREES;
const tranche = (i: Individu) => {
	const t = trancheDeDuree(i.carriere, BORNES);
	return t < 0 ? NB : t;
};
/** Durée seule : un fonctionnaire est rapproché d'un individu du privé de même durée, quel qu'il soit. */
const duree = (i: Individu) => tranche(i) % DUREES;
/** Ordre de retrait pour une durée : ceux qui ont des années ailleurs, puis les autres, puis la durée suivante. */
const ORDRE = Array.from({ length: NB }, (_, k) =>
	k % 2 === 0 ? k / 2 : DUREES + (k - 1) / 2,
);
const table = () => ({
	n: new Float64Array(AGE_MAX + 3),
	c: Array.from({ length: NB + 1 }, () => new Float64Array(AGE_MAX + 3)),
	r: Array.from({ length: NB + 1 }, () => new Float64Array(AGE_MAX + 3)),
});
const cotise = (i: Individu) =>
	i.carriere.annees.some(
		(a) => a.annee === ANNEE && estSalarie(a) && a.salaireBrut > 0,
	);
const compte = { femmes: table(), hommes: table() };
population.forEach((i, k) => {
	const c = i.carriere;
	const age = ANNEE - c.anneeNaissance;
	const g = compte[c.sexe === "F" ? "femmes" : "hommes"];
	(g.n[age] as number)++;
	if (!Number.isNaN(r.pensionParIndividu[k] as number))
		(g.r[tranche(i)] as Float64Array)[age]++;
	else if (cotise(i)) (g.c[tranche(i)] as Float64Array)[age]++;
});

const reels = (sexe: Cle, age: number) =>
	lire(pyramide[sexe] as Table, age, age === AGE_MAX);
const pyramideDuMoteur = {
	annee: ANNEE,
	femmes: Array.from({ length: AGE_MAX + 1 }, (_, age) =>
		age < AGE_MIN ? 0 : reels("femmes", age),
	),
	hommes: Array.from({ length: AGE_MAX + 1 }, (_, age) =>
		age < AGE_MIN ? 0 : reels("hommes", age),
	),
};

// Les fonctionnaires : ce qu'ils apportent de cotisants et de retraités de l'Agirc-Arrco, en personnes réelles.
const publique = ponderer(
	generatePopulationPublique(B, undefined, {
		taille: 120000,
		graine: SCENARIO_PUBLIC.graine,
		generations: GENERATIONS_PONDEREES,
	}),
	pyramideDuMoteur,
	CHAMP_PUBLIC,
);
const pensionsPubliques = computePensions(
	publique,
	B,
	{},
	buildComptes(publique, B),
);
const apport = { femmes: table(), hommes: table() };
publique.forEach((i, k) => {
	const c = i.carriere;
	const age = ANNEE - c.anneeNaissance;
	const g = apport[c.sexe === "F" ? "femmes" : "hommes"];
	const p = pensionsPubliques[k] as Pension;
	if (p.liquidation.annee <= ANNEE) {
		if (
			(p.parRegime.agircArrco?.pensionAnnuelle ?? 0) > 0 &&
			departDuChamp(CHAMP_PRIVE, p).annee <= ANNEE
		)
			(g.r[duree(i)] as Float64Array)[age] += i.poids;
	} else if (cotise(i)) (g.c[duree(i)] as Float64Array)[age] += i.poids;
});

/** Somme sur cinq âges autour d'un âge. */
const autour = (v: Float64Array, age: number) => {
	let x = 0;
	for (let a = Math.max(0, age - 2); a <= age + 2; a++) x += v[a] ?? 0;
	return x;
};

type Reglage = { part: number; reste: number[] };
/**
 * Part du privé et reste par tranche de durée à un âge, pour retrouver une cible de cotisants ou de
 * retraités une fois comptés ceux que les fonctionnaires apportent.
 */
function regler(
	sexe: Cle,
	age: number,
	quoi: "c" | "r",
	cible: number,
): Reglage {
	const n = autour(compte[sexe].n, age);
	const taux = compte[sexe][quoi].map((v) => (n ? autour(v, age) / n : 0));
	const tous = taux.reduce((t, x) => t + x, 0);
	const population = reels(sexe, age);
	const reste = new Array<number>(NB).fill(1);
	if (tous === 0 || population === 0) return { part: 0, reste };
	const sansFonctionnaires = cible / population / tous;
	let surplus = 0;
	let apportes = 0;
	for (const d of ORDRE) {
		// Ce que les fonctionnaires de cette durée apportent se retire d'abord chez ceux qui ont des années ailleurs.
		const apporte =
			d < DUREES ? autour(apport[sexe][quoi][d] as Float64Array, age) / 5 : 0;
		apportes += apporte;
		const jumeaux = population * sansFonctionnaires * (taux[d] as number);
		const aRetirer = apporte + surplus;
		if (jumeaux <= 0) {
			surplus = aRetirer;
			continue;
		}
		reste[d] = Math.max(0, 1 - aRetirer / jumeaux);
		surplus = Math.max(0, aRetirer - jumeaux);
	}
	const conserves =
		(taux[NB] as number) +
		reste.reduce((t, x, d) => t + x * (taux[d] as number), 0);
	return {
		part: conserves
			? Math.max(0, cible - apportes) / population / conserves
			: 0,
		reste,
	};
}

const sortie = {
	annee: ANNEE,
	ageMin: AGE_MIN,
	sources: {
		pyramide: {
			source: reference.pyramideDesAges.mentionSource,
			url: reference.pyramideDesAges.pageSource,
			date: reference.meta.dateConsultation,
		},
		cotisants: {
			source: reference.agircArrco.cotisants.champ,
			date: reference.meta.dateConsultation,
		},
		retraites: {
			source: reference.agircArrco.retraitesDroitDirect.definition,
			url: reference.agircArrco.retraitesDroitDirect.pageSource,
			date: reference.meta.dateConsultation,
		},
	},
	/** Indice 0 = âge minimal simulé ; le dernier âge regroupe les plus âgés. */
	femmes: [] as number[],
	hommes: [] as number[],
	partPrive: { femmes: [] as number[], hommes: [] as number[] },
	/**
	 * Ce qu'il reste du poids d'un individu du privé, par âge puis par tranche de durée au privé,
	 * une fois retirés ceux que les fonctionnaires passés par le privé représentent déjà.
	 */
	resteParDuree: {
		bornes: BORNES,
		femmes: [] as number[][],
		hommes: [] as number[][],
	},
};

let surplusTotal = 0;
for (const sexe of SEXES) {
	const reglage = (age: number): Reglage => {
		const dernier = age === AGE_MAX;
		if (age <= AGE_FIN_COTISANTS)
			return regler(sexe, age, "c", lire(cotisants[sexe] as Table, age, false));
		if (age >= AGE_DEBUT_RETRAITES)
			return regler(
				sexe,
				age,
				"r",
				lire((retraites[sexe] as { parAge: Table }).parAge, age, dernier),
			);
		const t =
			(age - AGE_FIN_COTISANTS) / (AGE_DEBUT_RETRAITES - AGE_FIN_COTISANTS);
		const x = reglage(AGE_FIN_COTISANTS);
		const y = reglage(AGE_DEBUT_RETRAITES);
		return {
			part: x.part * (1 - t) + y.part * t,
			reste: x.reste.map((v, d) => v * (1 - t) + (y.reste[d] as number) * t),
		};
	};
	for (let age = AGE_MIN; age <= AGE_MAX; age++) {
		const x = reglage(age);
		sortie[sexe].push(reels(sexe, age));
		// Jamais plus que la population réelle : avant 24 ans le modèle manque d'emplois jeunes (apprentis, étudiants).
		sortie.partPrive[sexe].push(Number(Math.min(1, x.part).toFixed(4)));
		sortie.resteParDuree[sexe].push(x.reste.map((v) => Number(v.toFixed(3))));
		if (x.reste[NB - 1] === 0) surplusTotal++;
	}
}
console.log(
	`âges où toutes les tranches de durée sont épuisées (surplus pris sur tous) : ${surplusTotal} sur ${2 * (AGE_MAX - AGE_MIN + 1)}`,
);

await Bun.write(
	new URL(
		"../packages/engine/src/population/france.data.json",
		import.meta.url,
	),
	`${JSON.stringify(sortie, null, "\t")}\n`,
);
// Pyramides projetées : même convention d'âge, même regroupement des plus âgés.
// Le scénario central, plus l'écart au central des variantes de fécondité et de solde migratoire.
const scenarios = projections.populationProjetee.scenarios;
const FIN = 2070;
type Tables = { anneeDebut: number; femmes: number[][]; hommes: number[][] };
function pyramidesDe(population: Tables) {
	const annees: Record<string, { femmes: number[]; hommes: number[] }> = {};
	for (let annee = ANNEE; annee <= FIN; annee++) {
		const k = annee - population.anneeDebut;
		const ligne = (table: number[][]) => {
			const insee = table[k] as number[];
			const v: number[] = [];
			for (let age = AGE_MIN; age <= AGE_MAX; age++) {
				const a = age - DECALAGE_AGE;
				v.push(
					age === AGE_MAX
						? insee.slice(a).reduce((t, x) => t + x, 0)
						: (insee[a] as number),
				);
			}
			return v;
		};
		annees[annee] = {
			femmes: ligne(population.femmes),
			hommes: ligne(population.hommes),
		};
	}
	return annees;
}
const centrale = pyramidesDe(scenarios.central.population as Tables);
/** Écart au scénario central, pour interpoler entre les variantes. */
function ecarts(population: Tables) {
	const variante = pyramidesDe(population);
	return Object.fromEntries(
		Object.entries(variante).map(([annee, p]) => [
			annee,
			{
				femmes: p.femmes.map(
					(n, i) => n - (centrale[annee]?.femmes[i] as number),
				),
				hommes: p.hommes.map(
					(n, i) => n - (centrale[annee]?.hommes[i] as number),
				),
			},
		]),
	);
}
/** Premier nombre d'un libellé de l'Insee : « 1,70 à partir de 2030 », « +230 000 par an ». */
const nombre = (libelle: string) => {
	const m = libelle
		.replace(/[\u202f\u00a0 ](?=\d{3})/g, "")
		.match(/\d+(?:,\d+)?/);
	if (!m) throw new Error(`Pas de nombre dans « ${libelle} »`);
	return Number(m[0].replace(",", "."));
};
const niveaux = {
	fecondite: {
		bas: nombre(scenarios.feconditeBasse.hypotheses.fecondite.libelleInsee),
		central: nombre(scenarios.central.hypotheses.fecondite.libelleInsee),
		haut: nombre(scenarios.feconditeHaute.hypotheses.fecondite.libelleInsee),
	},
	soldeMigratoire: {
		bas: nombre(
			scenarios.soldeMigratoireBas.hypotheses.soldeMigratoire.libelleInsee,
		),
		central: nombre(scenarios.central.hypotheses.soldeMigratoire.libelleInsee),
		haut: nombre(
			scenarios.soldeMigratoireHaut.hypotheses.soldeMigratoire.libelleInsee,
		),
	},
};
console.log("niveaux des variantes Insee :", JSON.stringify(niveaux));
await Bun.write(
	new URL(
		"../packages/engine/src/population/projection.data.json",
		import.meta.url,
	),
	`${JSON.stringify({
		ageMin: AGE_MIN,
		source: projections.populationProjetee.source,
		url: projections.populationProjetee.url,
		date: projections.populationProjetee.date,
		scenario: "central",
		niveaux,
		annees: centrale,
		ecarts: {
			feconditeBasse: ecarts(scenarios.feconditeBasse.population as Tables),
			feconditeHaute: ecarts(scenarios.feconditeHaute.population as Tables),
			soldeMigratoireBas: ecarts(
				scenarios.soldeMigratoireBas.population as Tables,
			),
			soldeMigratoireHaut: ecarts(
				scenarios.soldeMigratoireHaut.population as Tables,
			),
		},
	})}\n`,
);

// Recoupement : totaux pondérés de la population entière face aux chiffres publiés.
const indice = (age: number) => Math.max(0, Math.min(AGE_MAX, age) - AGE_MIN);
const champ: Champ = {
	...CHAMP_PRIVE,
	part: (age, sexe, annee, carriere) => {
		if (carriere?.fonctionPublique)
			return CHAMP_PUBLIC.part(age, sexe, annee, carriere);
		const cle = sexe === "F" ? "femmes" : "hommes";
		const t = carriere ? trancheDeDuree(carriere, BORNES) : -1;
		return (
			(sortie.partPrive[cle][indice(age)] ?? 0) *
			(t < 0 ? 1 : (sortie.resteParDuree[cle][indice(age)]?.[t] ?? 1))
		);
	},
};
const ponderee = [
	...ponderer(population, pyramideDuMoteur, champ),
	...publique,
];
const pensions = [
	...computePensions(population, B, {}, buildComptes(population, B)),
	...pensionsPubliques,
];
const t = {
	effectifs: { cotisants: 0, retraites: 0 },
	masses: { cotisations: 0 },
};
ponderee.forEach((i, k) => {
	const p = pensions[k] as Pension;
	if (p.liquidation.annee <= ANNEE) {
		if (
			(p.parRegime.agircArrco?.pensionAnnuelle ?? 0) > 0 &&
			departDuChamp(CHAMP_PRIVE, p).annee <= ANNEE
		)
			t.effectifs.retraites += i.poids;
		return;
	}
	const a = i.carriere.annees.find((x) => x.annee === ANNEE);
	if (!a || !estSalarie(a) || a.salaireBrut <= 0) return;
	const c = cotisationsAnnee(a, B);
	t.effectifs.cotisants += i.poids;
	t.masses.cotisations += i.poids * (c.base + c.complementaire);
});
const masse = (f: (p: Pension) => number) =>
	ponderee.reduce((total, individu, k) => {
		const p = pensions[k] as Pension;
		return departDuChamp(CHAMP_PRIVE, p).annee <= ANNEE
			? total + individu.poids * f(p)
			: total;
	}, 0);
// Les montants publiés sont de fin 2024 : ramenés en euros de l'année de référence avec les prix du COR.
const prix = projections.hypothesesEconomiquesCOR.prix.indice as {
	anneeDebut: number;
	valeurs: number[];
};
const enEuros =
	(prix.valeurs[ANNEE - prix.anneeDebut] as number) /
	(prix.valeurs[2024 - prix.anneeDebut] as number);
const rg = reference.regimeGeneral.retraitesDroitDirect.totaux.ensemble;
const aa = reference.agircArrco.retraitesDroitDirect.totaux.ensemble;
const m = reference.massesFinancieres;
const recoupement = [
	{
		nom: "Cotisants",
		unite: "millions",
		modele: t.effectifs.cotisants / 1e6,
		cible: reference.agircArrco.cotisants.totaux.ensemble / 1e6,
		source: "Agirc-Arrco, cotisants présents fin 2024",
	},
	{
		nom: "Retraités",
		unite: "millions",
		modele: t.effectifs.retraites / 1e6,
		cible: aa.effectifs / 1e6,
		source: "Drees, retraités de droit direct de l'Agirc-Arrco fin 2024",
	},
	{
		nom: "Cotisations versées",
		unite: "milliards",
		modele: t.masses.cotisations / 1e9,
		cible:
			m.regimeGeneral.cotisationsRecuesMdEUR +
			m.agircArrco.cotisationsMdEUR["2025"],
		source:
			"Cotisations 2025 du régime général (indépendants compris) et de l'Agirc-Arrco",
	},
	{
		nom: "Pensions complémentaires versées",
		unite: "milliards",
		modele: masse((p) => p.parRegime.agircArrco?.pensionAnnuelle ?? 0) / 1e9,
		cible:
			(aa.effectifs * aa.avantagePrincipalDroitDirectMoyenM1 * 12 * enEuros) /
			1e9,
		source:
			"Drees, effectifs × pension moyenne de droit direct de l'Agirc-Arrco fin 2024, en euros de 2026",
	},
	{
		nom: "Pensions de base versées",
		unite: "milliards",
		modele: masse((p) => p.parRegime.cnav?.pensionAnnuelle ?? 0) / 1e9,
		cible:
			(rg.effectifs * rg.avantagePrincipalDroitDirectMoyenM1 * 12 * enEuros) /
			1e9,
		source:
			"Drees, effectifs × pension moyenne de droit direct du régime général fin 2024, en euros de 2026, anciens indépendants compris",
	},
].map((l) => ({
	...l,
	modele: Number(l.modele.toPrecision(4)),
	cible: Number(l.cible.toPrecision(4)),
}));
await Bun.write(
	new URL("../apps/web/src/recoupement.json", import.meta.url),
	`${JSON.stringify(recoupement, null, "\t")}\n`,
);
for (const l of recoupement)
	console.log(
		`${l.nom.padEnd(22)} modèle ${l.modele}  publié ${l.cible} ${l.unite}`,
	);
const resume = (v: number[]) =>
	[0, 12, 22, 32, 42, 52, 62, 72]
		.map((k) => `${AGE_MIN + k}:${v[k]}`)
		.join(" ");

console.log("part du privé, femmes :", resume(sortie.partPrive.femmes));
console.log("part du privé, hommes :", resume(sortie.partPrive.hommes));
