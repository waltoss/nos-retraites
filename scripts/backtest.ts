/**
 * Backtest : le modèle, avec la loi telle qu'elle s'est appliquée à chaque génération,
 * face à ce qui a été observé de 2010 à 2024. Rien ici ne sert à régler le modèle.
 * Écrit apps/web/src/backtest.json.
 */
import historique from "../data/references/historique.json" with {
	type: "json",
};
import minima from "../data/references/minimum-contributif.json" with {
	type: "json",
};
import projections from "../data/references/projections.json" with {
	type: "json",
};
import validation from "../data/references/validation.json" with {
	type: "json",
};
import {
	BAREMES_FRANCE as B,
	buildComptes,
	CHAMP_PRIVE,
	computePensions,
	generatePopulation,
	moisParEtat,
	type Pension,
	type Pyramide,
	poidsDeLAnnee,
	prepareProjection,
	projeter,
	SCENARIO_REFERENCE,
	SURVIE_SELON_PENSION,
} from "../packages/engine/src/index.ts";

export interface LigneBacktest {
	groupe: string;
	nom: string;
	modele: number;
	observe: number;
}

const population = generatePopulation(SCENARIO_REFERENCE, B);
const comptes = buildComptes(population, B);
const pensions = computePensions(population, B, {}, comptes);
/** Seuls ceux qui ont des droits comptent : c'est le champ des statistiques de retraités. */
const retraites = population
	.map((individu, k) => ({ individu, pension: pensions[k] as Pension }))
	.filter((x) => x.pension.mensuelleBrute > 0);
const lignes: LigneBacktest[] = [];
const moyenne = (v: number[]) => v.reduce((t, x) => t + x, 0) / v.length;

// 1. Âge conjoncturel de départ au régime général (Drees, EACR) : 50 ans plus la somme,
// de 50 à 70 ans, des parts de chaque âge qui ne sont pas encore parties. La Drees regarde chaque
// génération en fin d'année, à un âge moyen d'une demi-année au-dessus de son âge révolu ;
// ici chacun est né un 1er janvier, on regarde donc la génération au milieu de son année d'âge.
const parAnnee = validation.agesDepart.valeurs.regimeGeneral_CNAV.parAnnee;
const ages = new Map<string, number[]>();
for (const r of retraites) {
	const c = r.individu.carriere;
	const cle = `${c.sexe}${c.anneeNaissance}`;
	const v = ages.get(cle) ?? [];
	v.push(r.pension.liquidation.age);
	ages.set(cle, v);
}
const ageConjoncturel = (annee: number, sexe: "F" | "H") => {
	let age = 50;
	for (let a = 50; a <= 70; a++) {
		const v = ages.get(`${sexe}${annee - a}`) ?? [];
		const partis = v.filter((q) => q <= 4 * a + 2).length;
		age += v.length ? 1 - partis / v.length : 0;
	}
	return age;
};
for (const annee of [2012, 2014, 2016, 2018, 2020, 2022, 2024])
	for (const [sexe, cle] of [
		["F", "femmes"],
		["H", "hommes"],
	] as const)
		lignes.push({
			groupe: "Âge moyen de départ au régime général, en années",
			nom: `${cle}, ${annee}`,
			modele: ageConjoncturel(annee, sexe),
			observe: (parAnnee as Record<string, Record<string, number>>)[annee]?.[
				cle
			] as number,
		});

// Euros de l'année de référence, avec l'indice des prix du COR (celui de l'Insee jusqu'en 2025).
const prix = projections.hypothesesEconomiquesCOR.prix.indice as {
	anneeDebut: number;
	valeurs: number[];
};
const indice = (annee: number) =>
	prix.valeurs[annee - prix.anneeDebut] as number;
const enEurosDeReference = (annee: number) =>
	indice(B.anneeReference) / indice(annee);
type Serie = Record<string, number | null>;
const lire = (serie: Serie, annee: number): number => {
	const v = serie[annee];
	if (v === null || v === undefined)
		throw new Error(`Année ${annee} absente d'une série historique`);
	return v;
};
const SEXES = [
	["F", "femmes"],
	["H", "hommes"],
] as const;

// Le modèle rejoué depuis 2012 avec la population réelle de chaque année.
const t = projections.populationProjetee.scenarios.central
	.population as unknown as {
	anneeDebut: number;
	femmes: number[][];
	hommes: number[][];
};
const AGE_MAX = 96;
const pyramides: Record<number, Pyramide> = {};
for (let annee = 2012; annee <= B.anneeReference; annee++) {
	// Même convention que la pondération : l'âge du moteur est l'âge révolu de l'Insee plus un.
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
		fin: 2024,
		pyramides,
		champ: CHAMP_PRIVE,
		anneeEffet: 2100,
		comptes,
		pensionsReference: pensions,
		survie: SURVIE_SELON_PENSION,
	},
);
const passe = projeter(preparation);

// 2. Pension moyenne de droit direct des retraités en fin d'année, par régime (Drees, EACR).
// La statistique publiée exclut les majorations pour enfants : on les retire aussi du modèle.
const base = (p: Pension) =>
	p.cnav.pensionAnnuelle / (1 + p.cnav.majorationEnfants) / 12;
const complementaire = (p: Pension) =>
	p.agircArrco.pensionAnnuelle / (1 + p.agircArrco.majorationEnfants) / 12;
// Le modèle ne simule pas les générations nées avant 1930 : on ne regarde que les années récentes.
const e = historique.effectifs;
/** Les retraités d'une fin d'année, avec le poids qu'ils ont cette année-là (mortalité selon la pension comprise). */
const stock = (annee: number) => {
	const poids = poidsDeLAnnee(preparation, annee);
	return population
		.map((individu, k) => ({
			individu: { ...individu, poids: poids[k] as number },
			pension: pensions[k] as Pension,
		}))
		.filter(
			(x) =>
				x.pension.mensuelleBrute > 0 &&
				x.pension.liquidation.annee <= annee &&
				x.individu.poids > 0,
		);
};
const moyennePonderee = (
	groupe: typeof retraites,
	sexe: "F" | "H",
	f: (p: Pension) => number,
): number => {
	let total = 0;
	let poids = 0;
	for (const x of groupe) {
		if (x.individu.carriere.sexe !== sexe) continue;
		total += x.individu.poids * f(x.pension);
		poids += x.individu.poids;
	}
	return total / poids;
};
for (const [sexe, cle] of SEXES) {
	lignes.push({
		groupe: "Pension moyenne des retraités, euros de 2026 par mois",
		nom: `${cle}, régime général, fin 2019`,
		modele: moyennePonderee(stock(2019), sexe, base),
		observe:
			lire(e.cnav.pensionMoyenne[cle] as Serie, 2019) *
			enEurosDeReference(2019),
	});
	for (const annee of [2019, 2024])
		lignes.push({
			groupe: "Pension moyenne des retraités, euros de 2026 par mois",
			nom: `${cle}, Agirc-Arrco, fin ${annee}`,
			modele: moyennePonderee(stock(annee), sexe, complementaire),
			observe:
				lire(e.agircArrco.pensionMoyenne[cle] as Serie, annee) *
				enEurosDeReference(annee),
		});
}

// 3. Pension moyenne de ceux qui partent dans l'année.
const partants = (debut: number, fin: number) =>
	retraites.filter(
		(x) =>
			x.pension.liquidation.annee >= debut &&
			x.pension.liquidation.annee <= fin,
	);
const moyenneObservee = (serie: Serie, debut: number, fin: number) => {
	let total = 0;
	for (let a = debut; a <= fin; a++)
		total += lire(serie, a) * enEurosDeReference(a);
	return total / (fin - debut + 1);
};
for (const [sexe, cle] of SEXES) {
	for (const [debut, fin] of [
		[2010, 2013],
		[2016, 2019],
	] as const)
		lignes.push({
			groupe: "Pension moyenne des nouveaux retraités, euros de 2026 par mois",
			nom: `${cle}, régime général, ${debut}-${fin}`,
			modele: moyennePonderee(partants(debut, fin), sexe, base),
			observe: moyenneObservee(
				e.cnav.pensionMoyenneNouveaux[cle] as Serie,
				debut,
				fin,
			),
		});
	lignes.push({
		groupe: "Pension moyenne des nouveaux retraités, euros de 2026 par mois",
		nom: `${cle}, Agirc-Arrco, 2019-2023`,
		modele: moyennePonderee(partants(2019, 2023), sexe, complementaire),
		observe: moyenneObservee(
			e.agircArrco.pensionMoyenneNouveaux[cle] as Serie,
			2019,
			2023,
		),
	});
}

// 3 bis. Part des nouveaux retraités dont la pension est portée au minimum contributif (Drees, EACR).
const beneficiaires = minima.beneficiaires.flux.part;
for (const [debut, fin, cles] of [
	[2015, 2019, ["ensemble"]],
	[2022, 2024, ["femmes", "hommes"]],
] as const)
	for (const cle of cles) {
		const groupeDeDeparts = partants(debut, fin).filter(
			(x) =>
				cle === "ensemble" ||
				x.individu.carriere.sexe === (cle === "femmes" ? "F" : "H"),
		);
		let observe = 0;
		for (let a = debut; a <= fin; a++)
			observe += lire(beneficiaires[cle] as Serie, a);
		lignes.push({
			groupe:
				"Part des nouveaux retraités au minimum contributif, en % (régime général)",
			nom: `${cle}, ${debut}-${fin}`,
			modele:
				(100 *
					groupeDeDeparts.filter(
						(x) => x.pension.cnav.minimumContributifApplique,
					).length) /
				groupeDeDeparts.length,
			observe: observe / (fin - debut + 1),
		});
	}

// 4. Part de la carrière validée au régime général, génération 1953 (Drees, EIR 2020).
const proratisation =
	historique.polypensionnes.dureeValidee.tousRetraitesGeneration1953
		.coefficientProratisationCnav;
for (const [sexe, cle] of SEXES)
	lignes.push({
		groupe: "Coefficient de proratisation au régime général, génération 1953",
		nom: cle,
		modele: moyenne(
			retraites
				.filter(
					(x) =>
						x.individu.carriere.sexe === sexe &&
						Math.abs(x.individu.carriere.anneeNaissance - 1953) <= 2,
				)
				.map((x) => x.pension.cnav.proratisation),
		),
		observe: proratisation[cle],
	});

// 5. Départs à la retraite par an, en milliers (Drees, EACR, Agirc-Arrco).
for (const [debut, fin] of [
	[2012, 2015],
	[2016, 2019],
	[2020, 2024],
] as const) {
	const annees = passe.annees.filter((a) => a.annee >= debut && a.annee <= fin);
	let observes = 0;
	for (let a = debut; a <= fin; a++)
		observes += lire(e.agircArrco.nouveauxRetraites.ensemble as Serie, a);
	lignes.push({
		groupe: "Départs à la retraite par an à l'Agirc-Arrco, en milliers",
		nom: `${debut}-${fin}`,
		modele: moyenne(annees.map((a) => a.departs)) / 1000,
		observe: observes / (fin - debut + 1) / 1000,
	});
}
for (const annee of [2020, 2024]) {
	const a = passe.annees.find((x) => x.annee === annee);
	lignes.push({
		groupe: "Cotisants de l'Agirc-Arrco, en millions",
		nom: String(annee),
		modele: (a?.cotisants ?? 0) / 1e6,
		observe: lire(e.agircArrco.cotisants.ensemble as Serie, annee) / 1e6,
	});
	lignes.push({
		groupe: "Retraités de droit direct de l'Agirc-Arrco, en millions",
		nom: String(annee),
		modele: (a?.retraites ?? 0) / 1e6,
		observe:
			lire(e.agircArrco.retraitesDroitDirect.ensemble as Serie, annee) / 1e6,
	});
}

// 6. Réforme de 2010 : que font à 60 ans ceux qui ne peuvent plus partir ? On compare la loi
// à un âge légal resté à 60 ans, pour les générations 1954 à 1956, et on regarde la part de
// chaque situation parmi les départs empêchés (Rabaté et Rochut, échantillon Cnav).
const evaluation = historique.evaluationsReforme2010.etudes.find(
	(x) => x.id === "rabateRochutCor2016",
);
if (!evaluation) throw new Error("Évaluation de la réforme de 2010 absente");
const effets = evaluation.effetsEnPoints as Record<
	string,
	{ ensemble: number } | null
>;
const effet = (cle: string) => effets[cle]?.ensemble ?? 0;
const sansReforme = computePensions(population, B, { ageLegal: 240 }, comptes);
const reportes = { emploi: 0, chomage: 0, autres: 0 };
population.forEach((individu, k) => {
	const c = individu.carriere;
	if (c.anneeNaissance < 1954 || c.anneeNaissance > 1956) return;
	const avec = pensions[k] as Pension;
	const sans = sansReforme[k] as Pension;
	if (avec.mensuelleBrute <= 0) return;
	if (sans.liquidation.age >= 61 * 4 || avec.liquidation.age < 61 * 4) return;
	const a = c.annees[60 - ((c.annees[0]?.annee ?? 0) - c.anneeNaissance)];
	const mois = a ? moisParEtat(a) : { emploi: 0, chomage: 0, maladie: 0 };
	reportes.emploi += mois.emploi;
	reportes.chomage += mois.chomage;
	reportes.autres += 12 - mois.emploi - mois.chomage;
});
const totalReportes = reportes.emploi + reportes.chomage + reportes.autres;
const totalObserve = -effet("retraite");
for (const [nom, modele, observe] of [
	["en emploi", reportes.emploi, effet("emploi")],
	["au chômage", reportes.chomage, effet("chomage")],
	[
		"en invalidité, en maladie ou sans activité",
		reportes.autres,
		effet("invalidite") + effet("maladie") + effet("inactiviteAutre"),
	],
] as const)
	lignes.push({
		groupe:
			"Réforme de 2010 : situation à 60 ans de ceux qui ne peuvent plus partir, en %",
		nom,
		modele: (100 * modele) / totalReportes,
		observe: (100 * observe) / totalObserve,
	});

// 7. Situation à chaque âge avant la retraite, moyenne 2022-2024 (Insee, enquête Emploi 2023).
// Champ différent : l'enquête couvre toute la population, le modèle les salariés du privé.
const situations = historique.emploiSeniors.situationParAgeDetaille2023
	.parAge as Record<
	string,
	{ emploiHorsCumul: number; chomage: number; inactiviteHorsRetraite: number }
>;
for (const age of [55, 57, 59, 61]) {
	const t = { n: 0, emploi: 0, sansEmploi: 0 };
	population.forEach((individu, k) => {
		const c = individu.carriere;
		for (const annee of [2022, 2023, 2024]) {
			if (annee - c.anneeNaissance !== age) continue;
			const w = individu.poids || 1;
			t.n += w;
			if ((pensions[k] as Pension).liquidation.annee <= annee) continue;
			const a = c.annees[annee - (c.annees[0]?.annee ?? annee)];
			const mois = a ? moisParEtat(a).emploi : 0;
			t.emploi += (w * mois) / 12;
			t.sansEmploi += (w * (12 - mois)) / 12;
		}
	});
	const observe = situations[age];
	if (!observe) throw new Error(`Âge ${age} absent de l'enquête Emploi`);
	lignes.push({
		groupe: "Situation avant la retraite en 2023, en % de la classe d'âge",
		nom: `en emploi à ${age} ans`,
		modele: (100 * t.emploi) / t.n,
		observe: observe.emploiHorsCumul,
	});
	lignes.push({
		groupe: "Situation avant la retraite en 2023, en % de la classe d'âge",
		nom: `ni en emploi ni à la retraite à ${age} ans`,
		modele: (100 * t.sansEmploi) / t.n,
		observe: observe.chomage + observe.inactiviteHorsRetraite,
	});
}

export const BACKTEST = lignes;
if (import.meta.main) {
	await Bun.write(
		new URL("../apps/web/src/backtest.json", import.meta.url),
		`${JSON.stringify(
			lignes.map((l) => ({
				...l,
				modele: Number(l.modele.toPrecision(4)),
				observe: Number(l.observe.toPrecision(4)),
			})),
			null,
			"\t",
		)}\n`,
	);
	let groupe = "";
	for (const l of lignes) {
		if (l.groupe !== groupe) {
			groupe = l.groupe;
			console.log(`\n${groupe}`);
		}
		const ecart = l.modele - l.observe;
		const relatif = (100 * ecart) / l.observe;
		const chiffres = Math.abs(l.observe) >= 100 ? 0 : 2;
		console.log(
			`  ${l.nom.padEnd(38)} modèle ${l.modele.toFixed(chiffres).padStart(8)}  observé ${l.observe.toFixed(chiffres).padStart(8)}  ${relatif >= 0 ? "+" : ""}${relatif.toFixed(1)} %`,
		);
	}
	const ecarts = lignes.map((l) => Math.abs(l.modele / l.observe - 1) * 100);
	console.log(`\nÉcart relatif moyen : ${moyenne(ecarts).toFixed(1)} %`);
}
