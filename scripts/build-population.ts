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
 * À relancer après tout changement des hypothèses du générateur.
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
	GENERATIONS_PONDEREES,
	generatePopulation,
	ponderer,
	runSimulation,
	SCENARIO_REFERENCE,
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
const compte = {
	femmes: {
		n: new Map<number, number>(),
		c: new Map<number, number>(),
		r: new Map<number, number>(),
	},
	hommes: {
		n: new Map<number, number>(),
		c: new Map<number, number>(),
		r: new Map<number, number>(),
	},
};
const plus = (m: Map<number, number>, k: number) =>
	m.set(k, (m.get(k) ?? 0) + 1);
population.forEach((i, k) => {
	const c = i.carriere;
	const age = ANNEE - c.anneeNaissance;
	const g = compte[c.sexe === "F" ? "femmes" : "hommes"];
	plus(g.n, age);
	if (!Number.isNaN(r.pensionParIndividu[k] as number)) plus(g.r, age);
	else if (c.annees.some((a) => a.annee === ANNEE && a.salaireBrut > 0))
		plus(g.c, age);
});
/** Taux lissé sur cinq âges. */
const taux = (sexe: Cle, quoi: "c" | "r", age: number) => {
	let n = 0;
	let x = 0;
	for (let a = age - 2; a <= age + 2; a++) {
		n += compte[sexe].n.get(a) ?? 0;
		x += compte[sexe][quoi].get(a) ?? 0;
	}
	return n ? x / n : 0;
};

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
};

for (const sexe of SEXES) {
	const part = (age: number): number => {
		const dernier = age === AGE_MAX;
		const reels = lire(pyramide[sexe] as Table, age, dernier);
		if (age <= AGE_FIN_COTISANTS)
			return (
				lire(cotisants[sexe] as Table, age, false) /
				reels /
				taux(sexe, "c", age)
			);
		if (age >= AGE_DEBUT_RETRAITES)
			return (
				lire((retraites[sexe] as { parAge: Table }).parAge, age, dernier) /
				reels /
				taux(sexe, "r", age)
			);
		const t =
			(age - AGE_FIN_COTISANTS) / (AGE_DEBUT_RETRAITES - AGE_FIN_COTISANTS);
		return part(AGE_FIN_COTISANTS) * (1 - t) + part(AGE_DEBUT_RETRAITES) * t;
	};
	for (let age = AGE_MIN; age <= AGE_MAX; age++) {
		sortie[sexe].push(lire(pyramide[sexe] as Table, age, age === AGE_MAX));
		// Jamais plus que la population réelle : avant 24 ans le modèle manque d'emplois jeunes (apprentis, étudiants).
		sortie.partPrive[sexe].push(Number(Math.min(1, part(age)).toFixed(4)));
	}
}

await Bun.write(
	new URL(
		"../packages/engine/src/population/france.data.json",
		import.meta.url,
	),
	`${JSON.stringify(sortie, null, "\t")}\n`,
);
// Pyramides projetées : même convention d'âge, même regroupement des plus âgés.
const central = projections.populationProjetee.scenarios.central.population;
const FIN = 2070;
const projetees: Record<string, { femmes: number[]; hommes: number[] }> = {};
for (let annee = ANNEE; annee <= FIN; annee++) {
	const k = annee - central.anneeDebut;
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
	projetees[annee] = {
		femmes: ligne(central.femmes),
		hommes: ligne(central.hommes),
	};
}
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
		annees: projetees,
	})}\n`,
);

// Recoupement : totaux pondérés du scénario de référence face aux chiffres publiés.
const indice = (age: number) => Math.max(0, Math.min(AGE_MAX, age) - AGE_MIN);
const ponderee = ponderer(
	population,
	{
		annee: ANNEE,
		femmes: [...new Array<number>(AGE_MIN).fill(0), ...sortie.femmes],
		hommes: [...new Array<number>(AGE_MIN).fill(0), ...sortie.hommes],
	},
	{
		nom: "privé",
		part: (age, sexe) =>
			sortie.partPrive[sexe === "F" ? "femmes" : "hommes"][indice(age)] ?? 0,
	},
);
const t = runSimulation(ponderee, B, {}, buildComptes(ponderee, B));
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
		nom: "Pensions versées",
		unite: "milliards",
		modele: t.masses.pensions / 1e9,
		cible:
			(rg.effectifs * rg.avantagePrincipalDroitDirectMoyenM1 * 12 +
				aa.effectifs * aa.avantagePrincipalDroitDirectMoyenM1 * 12) /
			1e9,
		source:
			"Drees, effectifs × pension moyenne de droit direct fin 2024, régime général et Agirc-Arrco",
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
