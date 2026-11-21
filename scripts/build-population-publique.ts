/**
 * Pondération de la population de fonctionnaires (packages/engine/src/population/fonctionPublique.data.json).
 *
 * Inconnue : la part de chaque génération qui fait carrière dans chaque régime, par sexe.
 * Elle est décrite par quelques points (un tous les cinq ans) et réglée par moindres carrés sur :
 * - les retraités de droit direct en fin d'année et les nouveaux retraités, par sexe, 2012-2024 (Drees, EACR) ;
 * - les cotisants de chaque régime, 2012-2025 (jaune « Pensions ») ;
 * - les cotisants de l'État par âge et sexe au 1er janvier 2025 (SRE).
 * Une pénalité de régularité évite les dents de scie. Après la dernière génération observée,
 * la part reste constante : c'est une hypothèse.
 */
import reference from "../data/references/fonction-publique.json" with {
	type: "json",
};
import projections from "../data/references/projections.json" with {
	type: "json",
};
import {
	BAREMES_FRANCE as B,
	buildComptes,
	computePensions,
	generatePopulationPublique,
	type Pension,
} from "../packages/engine/src/index.ts";

const t = projections.populationProjetee.scenarios.central
	.population as unknown as {
	anneeDebut: number;
	femmes: number[][];
	hommes: number[][];
};
const AGE_MAX = 96;
/** Population d'un âge du moteur (âge révolu de l'Insee plus un) au 1er janvier d'une année. */
const reels = (annee: number, sexe: "F" | "H", age: number): number => {
	const insee = (sexe === "F" ? t.femmes : t.hommes)[
		annee - t.anneeDebut
	] as number[];
	if (age < 1 || age > AGE_MAX) return 0;
	return age === AGE_MAX
		? insee.slice(age - 1).reduce((s, x) => s + x, 0)
		: (insee[age - 1] as number);
};

const population = generatePopulationPublique(B);
const comptes = buildComptes(population, B);
const pensions = computePensions(population, B, {}, comptes);

const REGIMES = ["sre", "cnracl", "militaire"] as const;
const CLE_DREES = {
	sre: "fpeCivile",
	cnracl: "cnracl",
	militaire: "fpeMilitaire",
} as const;
const SEXES = ["F", "H"] as const;
type Regime = (typeof REGIMES)[number];
type Sexe = (typeof SEXES)[number];
const NOEUDS = [
	1930, 1935, 1940, 1945, 1950, 1955, 1960, 1965, 1970, 1975, 1980, 1985, 1990,
	1995, 2000,
];
const nbNoeuds = NOEUDS.length;
/** Poids de la génération sur chaque nœud : interpolation linéaire, constante aux extrémités. */
const base = (generation: number): number[] => {
	const v = new Array<number>(nbNoeuds).fill(0);
	if (generation <= (NOEUDS[0] as number)) v[0] = 1;
	else if (generation >= (NOEUDS[nbNoeuds - 1] as number)) v[nbNoeuds - 1] = 1;
	else
		for (let j = 1; j < nbNoeuds; j++) {
			const a = NOEUDS[j - 1] as number;
			const b = NOEUDS[j] as number;
			if (generation <= b) {
				v[j] = (generation - a) / (b - a);
				v[j - 1] = 1 - (v[j] as number);
				break;
			}
		}
	return v;
};

const simules = new Map<string, number>();
const cellule = (k: number) => {
	const c = population[k]?.carriere;
	return `${c?.fonctionPublique?.regime}${c?.sexe}${c?.anneeNaissance}`;
};
population.forEach((_, k) => {
	simules.set(cellule(k), (simules.get(cellule(k)) ?? 0) + 1);
});

interface Cible {
	nom: string;
	valeur: number;
	poids: number;
	/** Qui compte, et à quel âge de la pyramide. */
	compte: (k: number, sexe: Sexe) => { annee: number; age: number } | null;
	sexes: readonly Sexe[];
}
/**
 * La Drees ne compte un retraité pour invalidité qu'à partir de l'âge d'ouverture des droits
 * des sédentaires, et pas parmi les nouveaux retraités : même convention ici.
 */
const invalide = (k: number) =>
	(pensions[k] as Pension).fonctionPublique?.motif === "invalidite";
const anneeDOuverture = (k: number) => {
	const g = population[k]?.carriere.anneeNaissance ?? 0;
	const table = B.fonctionPublique?.parGeneration.sedentaire ?? {};
	return g + Math.ceil((table[Math.min(1985, g)]?.ageLegal ?? 248) / 4);
};
const retraite = (k: number, annee: number) =>
	(pensions[k] as Pension).liquidation.annee <= annee &&
	(pensions[k] as Pension).mensuelleBrute > 0 &&
	(!invalide(k) || annee >= anneeDOuverture(k));
const cotise = (k: number, annee: number) => {
	const c = population[k]?.carriere;
	if (!c || (pensions[k] as Pension).liquidation.annee <= annee) return false;
	const premiere = c.annees[0]?.annee ?? annee + 1;
	return c.annees[annee - premiere]?.primes !== undefined;
};

const eacr = reference.cibles.retraitesEtPensions.dreesEacr.valeurs as Record<
	string,
	Record<string, Record<string, { effectifs: Record<string, number> }>>
>;
const cotisants = reference.population.effectifsCotisants;
const pyramideSre = cotisants.pyramideDesAges
	.sreCivilsComptesActifsAu1erJanvier2025 as unknown as Record<
	string,
	Record<string, number>
>;

function cibles(regime: Regime): Cible[] {
	const liste: Cible[] = [];
	const drees = eacr[CLE_DREES[regime]];
	const ageEn = (k: number, annee: number) =>
		annee - (population[k]?.carriere.anneeNaissance ?? 0);
	for (const [sexe, nom] of [
		["F", "femmes"],
		["H", "hommes"],
	] as const) {
		for (let annee = 2012; annee <= 2024; annee++) {
			const stock = drees?.stock?.[nom]?.effectifs[annee];
			// Retraités au 31 décembre : la population du 1er janvier suivant.
			if (stock)
				liste.push({
					nom: `retraités ${nom} ${annee}`,
					valeur: stock,
					poids: 1,
					sexes: [sexe],
					compte: (k) =>
						retraite(k, annee)
							? { annee: annee + 1, age: ageEn(k, annee + 1) }
							: null,
				});
			const flux = drees?.flux?.[nom]?.effectifs[annee];
			if (flux)
				liste.push({
					nom: `départs ${nom} ${annee}`,
					valeur: flux,
					poids: 0.4,
					sexes: [sexe],
					compte: (k) =>
						(pensions[k] as Pension).liquidation.annee === annee &&
						(pensions[k] as Pension).mensuelleBrute > 0 &&
						!invalide(k)
							? { annee, age: ageEn(k, annee) }
							: null,
				});
		}
		if (regime === "sre")
			for (let age = 26; age <= 58; age += 2) {
				const lire = (a: number) =>
					(pyramideSre[nom] as Record<string, number>)[a] ?? 0;
				liste.push({
					nom: `cotisants ${nom} de ${age} et ${age + 1} ans, 2025`,
					valeur: lire(age) + lire(age + 1),
					poids: 0.5,
					sexes: [sexe],
					// Âge révolu de la source : l'âge du moteur moins un.
					compte: (k) => {
						const a = ageEn(k, 2025);
						return cotise(k, 2025) && (a === age + 1 || a === age + 2)
							? { annee: 2025, age: a }
							: null;
					},
				});
			}
	}
	// Militaires : seuls ceux qui auront une pension militaire sont simulés, les cotisants ne se comparent pas.
	const serie = (
		regime === "militaire"
			? {}
			: (regime === "sre"
					? cotisants.sreCivils
					: cotisants.cnraclEnsembleCalcule
				).valeurs
	) as Record<string, number>;
	for (let annee = 2012; annee <= 2025; annee++) {
		const valeur = serie[annee];
		if (valeur)
			liste.push({
				nom: `cotisants ${annee}`,
				valeur,
				poids: 1,
				sexes: SEXES,
				compte: (k) =>
					cotise(k, annee) ? { annee, age: ageEn(k, annee) } : null,
			});
	}
	return liste;
}

const LAMBDA = 0.02;
const resultat: Record<Regime, Record<Sexe, number[]>> = {
	sre: { F: [], H: [] },
	cnracl: { F: [], H: [] },
	militaire: { F: [], H: [] },
};
for (const regime of REGIMES) {
	const liste = cibles(regime);
	const n = 2 * nbNoeuds;
	// Chaque cible est une somme linéaire des parts aux nœuds.
	const A = liste.map(() => new Array<number>(n).fill(0));
	population.forEach((individu, k) => {
		const c = individu.carriere;
		if (c.fonctionPublique?.regime !== regime) return;
		const decalage = c.sexe === "F" ? 0 : nbNoeuds;
		const b = base(c.anneeNaissance);
		const taille = simules.get(cellule(k)) ?? 1;
		liste.forEach((cible, i) => {
			if (!cible.sexes.includes(c.sexe)) return;
			const quand = cible.compte(k, c.sexe);
			if (!quand) return;
			const u = reels(quand.annee, c.sexe, quand.age) / taille;
			for (let j = 0; j < nbNoeuds; j++)
				(A[i] as number[])[decalage + j] += u * (b[j] as number);
		});
	});
	// Moindres carrés pondérés sur les écarts relatifs, parts positives, régularité entre nœuds voisins.
	const M = Array.from({ length: n }, () => new Array<number>(n).fill(0));
	const v = new Array<number>(n).fill(0);
	liste.forEach((cible, i) => {
		const w = (cible.poids / cible.valeur) ** 2;
		for (let a = 0; a < n; a++) {
			const x = (A[i] as number[])[a] as number;
			if (x === 0) continue;
			(v[a] as number) += 0;
			v[a] = (v[a] as number) + w * x * cible.valeur;
			for (let b = 0; b < n; b++)
				(M[a] as number[])[b] =
					((M[a] as number[])[b] as number) +
					w * x * ((A[i] as number[])[b] as number);
		}
	});
	const echelle = 1 / 0.03 ** 2;
	for (let s = 0; s < 2; s++)
		for (let j = 0; j + 1 < nbNoeuds; j++) {
			const a = s * nbNoeuds + j;
			const l = LAMBDA * echelle;
			(M[a] as number[])[a] = ((M[a] as number[])[a] as number) + l;
			(M[a + 1] as number[])[a + 1] =
				((M[a + 1] as number[])[a + 1] as number) + l;
			(M[a] as number[])[a + 1] = ((M[a] as number[])[a + 1] as number) - l;
			(M[a + 1] as number[])[a] = ((M[a + 1] as number[])[a] as number) - l;
		}
	const x = new Array<number>(n).fill(0.03);
	for (let tour = 0; tour < 5000; tour++)
		for (let a = 0; a < n; a++) {
			let reste = v[a] as number;
			for (let b = 0; b < n; b++)
				if (b !== a)
					reste -= ((M[a] as number[])[b] as number) * (x[b] as number);
			x[a] = Math.max(0, reste / ((M[a] as number[])[a] as number));
		}
	resultat[regime] = { F: x.slice(0, nbNoeuds), H: x.slice(nbNoeuds) };
	console.log(`\n${regime} : parts aux nœuds (%)`);
	for (const sexe of SEXES)
		console.log(
			sexe,
			resultat[regime][sexe].map((p) => (100 * p).toFixed(1)).join(" "),
		);
	const ecarts = liste.map((cible, i) => {
		const modele = (A[i] as number[]).reduce(
			(s, a, j) => s + a * (x[j] as number),
			0,
		);
		return { nom: cible.nom, ecart: modele / cible.valeur - 1 };
	});
	const pires = [...ecarts].sort(
		(a, b) => Math.abs(b.ecart) - Math.abs(a.ecart),
	);
	console.log(
		"écarts les plus grands :",
		pires
			.slice(0, 8)
			.map((e) => `${e.nom} ${(100 * e.ecart).toFixed(0)} %`)
			.join(" | "),
	);
	const montre = (motif: string) =>
		ecarts
			.filter((e) => e.nom.startsWith(motif))
			.map((e) => (100 * e.ecart).toFixed(0))
			.join(" ");
	console.log("cotisants par année (%) :", montre("cotisants 20"));
	console.log("retraitées :", montre("retraités femmes"));
	console.log("retraités :", montre("retraités hommes"));
}

const DEBUT = 1930;
const FIN = 2052;
const parts = Object.fromEntries(
	REGIMES.map((regime) => [
		regime,
		Object.fromEntries(
			SEXES.map((sexe) => [
				sexe,
				Array.from({ length: FIN - DEBUT + 1 }, (_, i) => {
					const b = base(DEBUT + i);
					return Number(
						b
							.reduce(
								(s, w, j) => s + w * (resultat[regime][sexe][j] as number),
								0,
							)
							.toFixed(5),
					);
				}),
			]),
		),
	]),
);
await Bun.write(
	new URL(
		"../packages/engine/src/population/fonctionPublique.data.json",
		import.meta.url,
	),
	`${JSON.stringify(
		{
			source:
				"Réglage sur data/references/fonction-publique.json : retraités et nouveaux retraités par sexe (Drees, EACR, 2012-2024), cotisants (jaune « Pensions » du PLF 2027, 2012-2025), cotisants de l'État par âge (SRE, 1er janvier 2025)",
			date: reference.meta.date,
			note: "Part de chaque génération qui fait carrière dans le régime, par sexe. Constante après la génération 2000 : hypothèse.",
			annee: B.anneeReference,
			generationDebut: DEBUT,
			parts,
		},
		null,
		"\t",
	)}\n`,
);
