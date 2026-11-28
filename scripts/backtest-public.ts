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
import tempsPartiel from "../packages/engine/src/generateur/tempsPartielPublic.data.json" with {
	type: "json",
};
import {
	BAREMES_FRANCE as B,
	buildComptes,
	CADRAGE_COR,
	CHAMP_PUBLIC,
	computePensions,
	detailFonctionPublique,
	generatePopulationPublique,
	type Pension,
	PYRAMIDES_PROJETEES,
	type Pyramide,
	poidsDeLAnnee,
	prepareProjection,
	projeter,
	SURVIE_SELON_PENSION,
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
		survie: SURVIE_SELON_PENSION,
	},
);

const REGIMES = [
	["sre", "fpeCivile", "État"],
	["cnracl", "cnracl", "CNRACL"],
	["militaire", "fpeMilitaire", "Militaires"],
] as const;
const CIVILS = [REGIMES[0], REGIMES[1]] as const;
const SEXES = [
	["F", "femmes"],
	["H", "hommes"],
] as const;
type Regime = "sre" | "cnracl" | "militaire";
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
	const d = detailFonctionPublique(x.pension);
	if (!d) throw new Error("Pension hors fonction publique");
	return d;
};
/** Avantage principal de droit direct, hors majoration pour enfants, par mois. */
const principal = (x: Vue) =>
	detail(x).pensionAnnuelle / (1 + detail(x).majorationEnfants) / 12;
/**
 * Convention de la Drees : un retraité pour invalidité n'est compté qu'à partir de l'âge d'ouverture
 * des droits des sédentaires, et pas parmi les nouveaux retraités.
 */
const invalide = (x: Vue) => detail(x).motif === "invalidite";
const anneeDOuverture = (x: Vue) => {
	const g = population[x.k]?.carriere.anneeNaissance ?? 0;
	const table = B.fonctionPublique?.parGeneration.sedentaire ?? {};
	return g + Math.ceil((table[Math.min(1985, g)]?.ageLegal ?? 248) / 4);
};
const retraites = (v: Vue[], annee: number) =>
	v.filter(
		(x) =>
			x.pension.liquidation.annee <= annee &&
			(detailFonctionPublique(x.pension)?.pensionAnnuelle ?? 0) > 0 &&
			(!invalide(x) || annee >= anneeDOuverture(x)),
	);
const partisTous = (v: Vue[], de: number, a: number) =>
	v.filter(
		(x) =>
			x.pension.liquidation.annee >= de &&
			x.pension.liquidation.annee <= a &&
			(detailFonctionPublique(x.pension)?.pensionAnnuelle ?? 0) > 0,
	);
const partis = (v: Vue[], de: number, a: number) =>
	partisTous(v, de, a).filter((x) => !invalide(x));

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
		// Trop peu de femmes militaires dans la population simulée pour en dire quelque chose.
		if (regime === "militaire" && sexe === "F") continue;
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
for (const [regime, , nom] of CIVILS) {
	const flux = partis(vue(2025, regime), 2023, 2025);
	// Départs pour ancienneté : services et bonifications, puis durée d'assurance tous régimes.
	const d = reference.population.entreeEtPolypensionnes
		.dureesALaLiquidation as unknown as {
		fpeCivilsServicesEtBonificationsSerie: { ensemble: Serie };
		flux2025ParMotif: Record<string, Record<string, number[]>>;
		cnraclRecueil: {
			dureeValidee: Record<
				string,
				{ vieillesse: { total: { total: number } } }
			>;
			dureeDAssuranceTousAvantagesInclus2024: {
				vieillesse: { total: { total: number } };
			};
		};
	};
	ajoute(
		"Fonction publique : durées des nouveaux retraités, en trimestres",
		`${nom}, services et bonifications`,
		moyenne(flux, (x) => detail(x).services + detail(x).bonifications),
		regime === "sre"
			? (d.fpeCivilsServicesEtBonificationsSerie.ensemble[2024] ?? 0)
			: (d.cnraclRecueil.dureeValidee[2024]?.vieillesse.total.total ?? 0),
	);
	ajoute(
		"Fonction publique : durées des nouveaux retraités, en trimestres",
		`${nom}, tous régimes`,
		moyenne(flux, (x) => detail(x).trimestresValides),
		regime === "sre"
			? (d.flux2025ParMotif.pensionsCiviles?.anciennete?.[3] ?? 0)
			: d.cnraclRecueil.dureeDAssuranceTousAvantagesInclus2024.vieillesse.total
					.total,
	);
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
	// Part des départs pour invalidité (jaune, tableau 70, 2024).
	const motifs = reference.cibles.conditionsDeLiquidation.jauneDepartsParMotif
		.repartition2024Tableau70 as unknown as Record<
		string,
		{ invalidite: number; partsDansLeTotalPct: { invalidite: number } }
	>;
	const totalDe = (v: string) =>
		(motifs[v]?.invalidite ?? 0) /
		((motifs[v]?.partsDansLeTotalPct.invalidite ?? 1) / 100);
	ajoute(
		"Fonction publique : conditions de départ, en % des départs de 2022 à 2024",
		`${nom}, pour invalidité`,
		// Dix années groupées : ces départs sont rares dans la population simulée.
		100 * part(partisTous(vue(2024, regime), 2015, 2024), invalide),
		regime === "sre"
			? (motifs.fpeCivils?.partsDansLeTotalPct.invalidite ?? 0)
			: (100 *
					((motifs.fpt?.invalidite ?? 0) + (motifs.fph?.invalidite ?? 0))) /
					(totalDe("fpt") + totalDe("fph")),
	);
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

// Militaires : ceux qui quittent l'armée avec une pension (jaune, départs pour ancienneté de 2024).
{
	const flux = partis(vue(2025, "militaire"), 2021, 2025);
	const m = reference.population.entreeEtPolypensionnes.dureesALaLiquidation
		.militairesServicesEtBonificationsSerie as unknown as {
		dureeMoyenneDesServicesEtBonifications: Serie;
		ageMoyenALaRadiationDesCadres: Serie;
	};
	const indices = reference.population.profilDeCarriere
		.indiceMoyenDeLiquidationMilitairesSerie.valeurs as unknown as Serie;
	const groupe = "Fonction publique : militaires qui partent avec une pension";
	ajoute(
		groupe,
		"âge moyen, en années",
		moyenne(flux, (x) => x.pension.liquidation.age / 4 + 0.5),
		m.ageMoyenALaRadiationDesCadres[2024] ?? 0,
	);
	ajoute(
		groupe,
		"services et bonifications, en trimestres",
		moyenne(flux, (x) => detail(x).services + detail(x).bonifications),
		m.dureeMoyenneDesServicesEtBonifications[2024] ?? 0,
	);
	ajoute(
		groupe,
		"indice de fin de carrière, en points",
		moyenne(flux, (x) => detail(x).traitementDeReference) /
			(B.fonctionPublique?.valeurPoint[2026] ?? 1),
		indices[2024] ?? 0,
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
for (const [regime, , nom] of CIVILS) {
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
			((annee2024(x)?.salaireBrut ?? 0) - (annee2024(x)?.primes ?? 0)) /
			(annee2024(x)?.quotite ?? 1) /
			12,
	);
	const primes = moyenne(
		enPoste,
		(x) => (annee2024(x)?.primes ?? 0) / (annee2024(x)?.quotite ?? 1) / 12,
	);
	// Part des agents à temps partiel, femmes et hommes réunis (Siasp, fin 2019).
	const publie = tempsPartiel[regime as "sre" | "cnracl"];
	const femmes = part(enPoste, (x) => population[x.k]?.carriere.sexe === "F");
	ajoute(
		"Fonction publique : agents à temps partiel, en %",
		nom,
		100 * part(enPoste, (x) => (annee2024(x)?.quotite ?? 1) < 1),
		100 * (femmes * publie.F.part + (1 - femmes) * publie.H.part),
	);
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

// Projection : dépenses en part du PIB, face aux groupes État et CNRACL du COR. Le champ du COR est plus
// large (militaires, réversions, ouvriers de l'État) : c'est la pente qui se compare, pas le niveau.
const groupes = projections.projectionsFinancieresCOR.parGroupeDeRegimes
	.depensesPartPIB.horsTransfertsInternes as unknown as Record<
	string,
	{ anneeDebut: number; valeurs: number[] }
>;
const cor = (annee: number) =>
	((groupes.FPE?.valeurs[annee - (groupes.FPE?.anneeDebut ?? 0)] ?? 0) +
		(groupes.CNRACL?.valeurs[annee - (groupes.CNRACL?.anneeDebut ?? 0)] ?? 0)) *
	100;
const avenir = projeter(
	prepareProjection(
		population,
		B,
		{},
		{
			debut: B.anneeReference,
			fin: 2070,
			pyramides: PYRAMIDES_PROJETEES,
			champ: CHAMP_PUBLIC,
			anneeEffet: 2028,
			comptes,
			pensionsReference: pensions,
			survie: SURVIE_SELON_PENSION,
		},
	),
);
const partDuPib = (annee: number) =>
	(100 * (avenir.annees.find((a) => a.annee === annee)?.pensions ?? 0)) /
	(CADRAGE_COR.annees[annee]?.pib ?? 1);
for (const annee of [2040, 2055, 2070])
	ajoute(
		"Fonction publique : dépenses en 2040, 2055 et 2070, base 100 en 2026",
		`${annee}`,
		(100 * partDuPib(annee)) / partDuPib(B.anneeReference),
		(100 * cor(annee)) / cor(B.anneeReference),
	);

// Polypensionnés : retraités de 60 ans ou plus qui touchent aussi une pension du régime général (Drees, EIR 2020).
// C'est la cible du réglage de `avantEntree.partAuPrive`.
const polypensionnes =
	reference.population.entreeEtPolypensionnes.polypensionnes.eir2020
		.partPercevantAussiUnePensionDuRegimeGeneral;
for (const [regime, cle, nom] of [
	["sre", "pensionnesCivilsDeLEtat", "État"],
	["cnracl", "pensionnesCnracl", "CNRACL"],
	["militaire", "pensionnesMilitaires", "Militaires"],
] as const) {
	let tous = 0;
	let avec = 0;
	for (const x of retraites(vue(2020, regime), 2020)) {
		if (2020 - (population[x.k]?.carriere.anneeNaissance ?? 0) < 60) continue;
		tous += x.poids;
		const cnav = x.pension.parRegime.cnav;
		if (
			cnav &&
			cnav.pensionAnnuelle > 0 &&
			(cnav.liquidation?.annee ?? x.pension.liquidation.annee) <= 2020
		)
			avec += x.poids;
	}
	ajoute(
		"Fonction publique : retraités qui touchent aussi une pension du régime général, en %, fin 2020",
		nom,
		(100 * avec) / tous,
		polypensionnes[cle],
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
