/**
 * Backtest de la fonction publique : le modèle face aux statistiques des deux régimes
 * (État civil, CNRACL) de 2012 à 2025. Les effectifs sont réglés (build-population-publique.ts) ;
 * les pensions, les durées et les âges servent au réglage à la main des hypothèses de carrière.
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
	CHAMP_PUBLIC,
	computePensions,
	generatePopulationPublique,
	type Pension,
	type Pyramide,
	poidsDeLAnnee,
	prepareProjection,
} from "../packages/engine/src/index.ts";
import type { LigneBacktest } from "./backtest.ts";

const population = generatePopulationPublique(B);
const comptes = buildComptes(population, B);
const pensions = computePensions(population, B, {}, comptes);

const prix = projections.hypothesesEconomiquesCOR.prix.indice as {
	anneeDebut: number;
	valeurs: number[];
};
const indice = (annee: number) =>
	prix.valeurs[annee - prix.anneeDebut] as number;
/** Euros de l'année de référence vers euros courants d'une année. */
const enEurosCourants = (annee: number) =>
	indice(annee) / indice(B.anneeReference);

const t = projections.populationProjetee.scenarios.central
	.population as unknown as {
	anneeDebut: number;
	femmes: number[][];
	hommes: number[][];
};
const AGE_MAX = 96;
const pyramides: Record<number, Pyramide> = {};
for (let annee = 2012; annee <= B.anneeReference; annee++) {
	const ligne = (table: number[][]) => {
		const insee = table[annee - t.anneeDebut] as number[];
		const v = new Array<number>(AGE_MAX + 1).fill(0);
		for (let age = 1; age <= AGE_MAX; age++)
			v[age] =
				age === AGE_MAX
					? insee.slice(age - 1).reduce((s, x) => s + x, 0)
					: (insee[age - 1] as number);
		return v;
	};
	pyramides[annee] = {
		annee,
		femmes: ligne(t.femmes),
		hommes: ligne(t.hommes),
	};
}
const preparation = prepareProjection(
	population,
	B,
	{},
	{
		debut: 2012,
		fin: B.anneeReference,
		pyramides,
		champ: CHAMP_PUBLIC,
		anneeEffet: 2028,
		comptes,
		pensionsReference: pensions,
	},
);

const REGIMES = [
	["sre", "fpeCivile", "État"],
	["cnracl", "cnracl", "CNRACL"],
] as const;
const SEXES = [
	["F", "femmes"],
	["H", "hommes"],
] as const;
type Regime = "sre" | "cnracl";
const lignes: LigneBacktest[] = [];
const ajoute = (groupe: string, nom: string, modele: number, observe: number) =>
	lignes.push({ groupe, nom, modele, observe });

interface Vue {
	k: number;
	poids: number;
	pension: Pension;
}
/** Individus d'un régime, avec leur poids une année donnée. */
const vue = (annee: number, regime: Regime, sexe?: "F" | "H"): Vue[] => {
	const poids = poidsDeLAnnee(preparation, Math.min(annee, B.anneeReference));
	const v: Vue[] = [];
	population.forEach((individu, k) => {
		const c = individu.carriere;
		if (c.fonctionPublique?.regime !== regime) return;
		if (sexe && c.sexe !== sexe) return;
		if ((poids[k] as number) > 0)
			v.push({ k, poids: poids[k] as number, pension: pensions[k] as Pension });
	});
	return v;
};
const moyenne = (v: Vue[], f: (x: Vue) => number) => {
	let n = 0;
	let s = 0;
	for (const x of v) {
		n += x.poids;
		s += x.poids * f(x);
	}
	return n ? s / n : Number.NaN;
};
const part = (v: Vue[], f: (x: Vue) => boolean) =>
	moyenne(v, (x) => (f(x) ? 1 : 0));
const detail = (x: Vue) => {
	const d = x.pension.fonctionPublique;
	if (!d) throw new Error("Pension hors fonction publique");
	return d;
};
/** Avantage principal de droit direct, hors majoration pour enfants, par mois. */
const principal = (x: Vue) =>
	detail(x).pensionAnnuelle / (1 + detail(x).majorationEnfants) / 12;
const retraites = (v: Vue[], annee: number) =>
	v.filter((x) => x.pension.liquidation.annee <= annee);
const partis = (v: Vue[], de: number, a: number) =>
	v.filter(
		(x) =>
			x.pension.liquidation.annee >= de && x.pension.liquidation.annee <= a,
	);

type Serie = Record<string, number>;
const eacr = reference.cibles.retraitesEtPensions.dreesEacr.valeurs as Record<
	string,
	Record<string, Record<string, Record<string, Serie>>>
>;
const moyenneSerie = (s: Serie, de: number, a: number) => {
	const v: number[] = [];
	for (let annee = de; annee <= a; annee++)
		if (s[annee] !== undefined) v.push(s[annee] as number);
	return v.reduce((x, y) => x + y, 0) / v.length;
};

for (const [regime, cle, nom] of REGIMES) {
	for (const [sexe, libelle] of SEXES) {
		for (const annee of [2012, 2018, 2024]) {
			const observe =
				eacr[cle]?.stock?.[libelle]?.avantagePrincipalDroitDirect?.[annee];
			if (observe)
				ajoute(
					"Fonction publique : pension moyenne des retraités, en euros par mois",
					`${nom}, ${libelle}, ${annee}`,
					moyenne(retraites(vue(annee + 1, regime, sexe), annee), principal) *
						enEurosCourants(annee),
					observe,
				);
		}
		// Les départs d'une seule année sont peu nombreux dans la population simulée : trois années groupées.
		for (const [de, a] of [
			[2013, 2015],
			[2018, 2020],
			[2022, 2024],
		] as const) {
			const observe = eacr[cle]?.flux?.[libelle]?.avantagePrincipalDroitDirect;
			if (observe)
				ajoute(
					"Fonction publique : pension moyenne des nouveaux retraités, en euros par mois",
					`${nom}, ${libelle}, ${de}-${a}`,
					moyenne(partis(vue(a, regime, sexe), de, a), principal) *
						enEurosCourants((de + a) / 2),
					moyenneSerie(observe, de, a),
				);
		}
	}
}

// Durées, âges et conditions de départ des nouveaux retraités récents.
const durees = reference.population.entreeEtPolypensionnes.dureesALaLiquidation
	.flux2025ParMotif as unknown as Record<
	string,
	Record<string, [number, number, number, number]>
>;
const ages = reference.population.categoriesActives
	.agesDeDepartActifsEtSedentaires as unknown as Record<
	string,
	Record<string, Serie>
>;
const conditions = reference.cibles.conditionsDeLiquidation
	.jauneDecoteSurcoteSeries as unknown as {
	fpeCivilsSurcote: { partPct: Serie };
	fpeCivilsDecote: { partPct: Serie };
	cnraclSurcotePartPct: { cnracl: Serie };
	cnraclDecote: { partPct: { cnracl: Serie } };
};
for (const [regime, , nom] of REGIMES) {
	const flux = partis(vue(2025, regime), 2023, 2025);
	const anciennete =
		durees[regime === "sre" ? "pensionsCiviles" : "cnraclEnsemble"]?.anciennete;
	if (anciennete) {
		ajoute(
			"Fonction publique : durées des nouveaux retraités, en trimestres",
			`${nom}, services`,
			moyenne(flux, (x) => detail(x).services),
			anciennete[1],
		);
		ajoute(
			"Fonction publique : durées des nouveaux retraités, en trimestres",
			`${nom}, tous régimes`,
			moyenne(flux, (x) => detail(x).trimestresValides),
			anciennete[3],
		);
	}
	// Indice moyen à la liquidation (jaune, départs de 2025) : le traitement de référence en points d'indice.
	const indices = reference.population.profilDeCarriere
		.indiceMoyenALaLiquidation2025 as unknown as Record<string, number>;
	ajoute(
		"Fonction publique : indice moyen des nouveaux retraités, en points",
		nom,
		moyenne(flux, (x) => detail(x).traitementDeReference) /
			(B.fonctionPublique?.valeurPoint[2026] ?? 1),
		indices[regime === "sre" ? "pensionsCiviles" : "cnraclEnsemble"] ?? 0,
	);
	const serie =
		ages[
			regime === "sre"
				? "fpeCivilsAgeMoyenPremiereMiseEnPaiement"
				: "cnraclAgeMoyenPremiereMiseEnPaiement"
		];
	const estActif = (x: Vue) => {
		const c = population[x.k]?.carriere;
		// Parti avant l'âge légal des sédentaires de sa génération : il a usé de sa catégorie active.
		const sedentaire =
			B.fonctionPublique?.parGeneration.sedentaire[
				Math.min(1985, c?.anneeNaissance ?? 0)
			]?.ageLegal ?? 248;
		return (
			c?.fonctionPublique?.categorie !== "sedentaire" &&
			x.pension.liquidation.age < sedentaire
		);
	};
	for (const de of [2014, 2024]) {
		const f = partis(vue(de + 1, regime), de - 1, de + 1);
		// Né un 1er janvier, parti à un âge en trimestres : l'âge moyen dans l'année est d'un demi-trimestre de plus.
		const age = (x: Vue) => x.pension.liquidation.age / 4 + 0.125;
		if (serie?.sedentaires?.[de])
			ajoute(
				"Fonction publique : âge moyen de départ, en années",
				`${nom}, sédentaires, ${de}`,
				moyenne(
					f.filter((x) => !estActif(x)),
					age,
				),
				serie.sedentaires[de] as number,
			);
		if (serie?.actifs?.[de])
			ajoute(
				"Fonction publique : âge moyen de départ, en années",
				`${nom}, catégories actives, ${de}`,
				moyenne(f.filter(estActif), age),
				serie.actifs[de] as number,
			);
	}
	const recents = partis(vue(2024, regime), 2022, 2024);
	ajoute(
		"Fonction publique : conditions de départ, en % des départs de 2022 à 2024",
		`${nom}, avec décote`,
		100 * part(recents, (x) => detail(x).trimestresDecote > 0),
		moyenneSerie(
			regime === "sre"
				? conditions.fpeCivilsDecote.partPct
				: conditions.cnraclDecote.partPct.cnracl,
			2022,
			2024,
		),
	);
	ajoute(
		"Fonction publique : conditions de départ, en % des départs de 2022 à 2024",
		`${nom}, avec surcote`,
		100 * part(recents, (x) => detail(x).trimestresSurcote > 0),
		moyenneSerie(
			regime === "sre"
				? conditions.fpeCivilsSurcote.partPct
				: conditions.cnraclSurcotePartPct.cnracl,
			2022,
			2024,
		),
	);
	const minimum = (
		reference.cibles.conditionsDeLiquidation.dreesEacrMinimumGaranti
			.valeurs as unknown as Record<string, { ensemble: { effectifs: Serie } }>
	)[regime === "sre" ? "fpeCivile" : "cnracl"]?.ensemble.effectifs;
	const departs =
		eacr[regime === "sre" ? "fpeCivile" : "cnracl"]?.flux?.ensemble?.effectifs;
	if (minimum && departs)
		ajoute(
			"Fonction publique : conditions de départ, en % des départs de 2022 à 2024",
			`${nom}, au minimum garanti`,
			100 * part(recents, (x) => detail(x).minimumGarantiApplique),
			(100 * moyenneSerie(minimum, 2022, 2024)) /
				moyenneSerie(departs, 2022, 2024),
		);
}

// Traitements et primes des agents en poste en 2024 (Insee, fonctionnaires en équivalent temps plein).
const salaires = reference.population.remunerations
	.decompositionDuSalaireDesFonctionnaires2024.ensemble as Record<
	string,
	{ traitementBrut: number; primesIrSft: number }
>;
const cotisants = reference.population.effectifsCotisants;
const territoriaux = (cotisants.cnraclTerritoriaux.valeurs as Serie)[2024] ?? 0;
const hospitaliers = (cotisants.cnraclHospitaliers.valeurs as Serie)[2024] ?? 0;
const melange = (
	f: (v: { traitementBrut: number; primesIrSft: number }) => number,
) =>
	(f(salaires.fpt as never) * territoriaux +
		f(salaires.fph as never) * hospitaliers) /
	(territoriaux + hospitaliers);
for (const [regime, , nom] of REGIMES) {
	const enPoste = vue(2024, regime).filter((x) => {
		const c = population[x.k]?.carriere;
		const premiere = c?.annees[0]?.annee ?? 2025;
		return (
			x.pension.liquidation.annee > 2024 &&
			c?.annees[2024 - premiere]?.primes !== undefined
		);
	});
	const annee2024 = (x: Vue) => {
		const c = population[x.k]?.carriere;
		return c?.annees[2024 - (c.annees[0]?.annee ?? 0)];
	};
	const traitement = moyenne(
		enPoste,
		(x) =>
			((annee2024(x)?.salaireBrut ?? 0) - (annee2024(x)?.primes ?? 0)) / 12,
	);
	const primes = moyenne(enPoste, (x) => (annee2024(x)?.primes ?? 0) / 12);
	ajoute(
		"Fonction publique : rémunération des agents en poste en 2024, en euros par mois",
		`${nom}, traitement`,
		traitement,
		regime === "sre"
			? (salaires.fpe?.traitementBrut ?? 0)
			: melange((v) => v.traitementBrut),
	);
	ajoute(
		"Fonction publique : rémunération des agents en poste en 2024, en euros par mois",
		`${nom}, primes`,
		primes,
		regime === "sre"
			? (salaires.fpe?.primesIrSft ?? 0)
			: melange((v) => v.primesIrSft),
	);
}

// Masse des pensions de droit direct en 2024 : effectifs × pension totale moyenne (Drees).
for (const [regime, cle, nom] of REGIMES) {
	const stock = retraites(vue(2025, regime), 2024);
	const masse =
		stock.reduce((s, x) => s + x.poids * detail(x).pensionAnnuelle, 0) *
		enEurosCourants(2024);
	const observe =
		((eacr[cle]?.stock?.ensemble?.effectifs?.[2024] ?? 0) *
			(eacr[cle]?.stock?.ensemble?.pensionTotale?.[2024] ?? 0) *
			12) /
		1e9;
	ajoute(
		"Fonction publique : pensions de droit direct versées en 2024, en milliards d'euros",
		nom,
		masse / 1e9,
		observe,
	);
}

export const BACKTEST_PUBLIC = lignes;

if (import.meta.main) {
	let groupe = "";
	for (const l of lignes) {
		if (l.groupe !== groupe) {
			groupe = l.groupe;
			console.log(`\n${groupe}`);
		}
		const ecart = l.modele / l.observe - 1;
		console.log(
			`  ${l.nom.padEnd(38)} ${l.modele.toFixed(1).padStart(9)} ${l.observe.toFixed(1).padStart(9)}  ${(100 * ecart).toFixed(0).padStart(4)} %`,
		);
	}
}
