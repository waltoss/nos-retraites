/**
 * Régimes de la fonction publique : la formule sur l'exemple publié par le Service des retraites
 * de l'État, puis les règles une par une, puis le backtest borné à son état actuel.
 */
import { describe, expect, test } from "bun:test";
import { BACKTEST_PUBLIC } from "../../../scripts/backtest-public.ts";
import {
	type AnneeCarriere,
	appliquerRegles,
	BAREMES_FRANCE as B,
	type BaremeFonctionPublique,
	buildCompte,
	type Carriere,
	type CategorieFonctionnaire,
	computeFonctionPublique,
	computePension,
	cumulJusqua,
	type GenerationFonctionnaire,
	reglesGenerationFonctionPublique,
} from "../src/index.ts";

const fp = B.fonctionPublique as BaremeFonctionPublique;

/** Fonctionnaire en poste sans interruption entre deux âges, au traitement et aux primes donnés. */
function fonctionnaire(
	anneeNaissance: number,
	ageEntree: number,
	traitement: (age: number) => number,
	options: {
		categorie?: CategorieFonctionnaire;
		primes?: number;
		sexe?: "F" | "H";
		enfants?: number[];
		debut?: number;
	} = {},
): Carriere {
	const annees: AnneeCarriere[] = [];
	for (let age = options.debut ?? ageEntree; age < 70; age++) {
		const annee = anneeNaissance + age;
		if (age < ageEntree) {
			annees.push({ annee, etat: "emploi", salaireBrut: 0, autreRegime: true });
			continue;
		}
		const primes = traitement(age) * (options.primes ?? 0);
		annees.push({
			annee,
			etat: "emploi",
			salaireBrut: traitement(age) + primes,
			primes,
		});
	}
	return {
		anneeNaissance,
		sexe: options.sexe ?? "H",
		enfants: options.enfants ?? [],
		cadre: false,
		annees,
		fonctionPublique: {
			regime: "sre",
			categorie: options.categorie ?? "sedentaire",
		},
	};
}

const generation = (g: Partial<GenerationFonctionnaire>) =>
	({
		ageLegal: 248,
		dureeRequise: 168,
		ageTauxPleinAutomatique: 268,
		ageSurcote: 248,
		anneeOuverture: 2022,
		...g,
	}) as GenerationFonctionnaire;

describe("pension d'un fonctionnaire", () => {
	test("exemple du SRE : 148 trimestres sur 168 donnent 66,07 % du traitement", () => {
		// 37 ans de services, départ à 67 ans : pas de décote.
		const c = fonctionnaire(1958, 30, () => 2602.22 * 12);
		const compte = buildCompte(c, B);
		const d = computeFonctionPublique(
			c,
			compte,
			cumulJusqua(compte, 268),
			268,
			generation({}),
			fp,
		);
		expect(d.services).toBe(148);
		expect(d.tauxLiquidation).toBeCloseTo(0.6607, 4);
		expect(d.pensionAnnuelle / d.traitementDeReference).toBeCloseTo(0.6607, 4);
		// 1 719,28 € par mois dans l'exemple, pour un traitement de 2 602,22 €.
		expect(2602.22 * d.tauxLiquidation).toBeCloseTo(1719.28, 0);
	});

	test("la décote retire 1,25 % par trimestre manquant", () => {
		const c = fonctionnaire(1962, 24, () => 40000);
		const compte = buildCompte(c, B);
		const g = generation({ ageLegal: 250, dureeRequise: 169 });
		// À 63 ans : 156 trimestres, il en manque 13 pour la durée et 16 pour l'âge.
		const d = computeFonctionPublique(c, compte, cumulJusqua(compte, 252), 252, g, fp);
		expect(d.trimestresDecote).toBe(13);
		expect(d.pensionAnnuelle / d.traitementDeReference).toBeCloseTo(
			((0.75 * 156) / 169) * (1 - 0.0125 * 13),
			4,
		);
	});

	test("la décote montait en charge : 0,625 % et 10 trimestres au plus pour un droit ouvert en 2010", () => {
		expect(fp.decote(2005)).toEqual({ taux: 0, plafond: 0 });
		expect(fp.decote(2010)).toEqual({ taux: 0.00625, plafond: 10 });
		expect(fp.decote(2030)).toEqual({ taux: 0.0125, plafond: 20 });
	});

	test("le minimum garanti relève une pension basse : 95 % du montant plein pour 30 ans de services", () => {
		const c = fonctionnaire(1960, 37, () => 22000);
		const compte = buildCompte(c, B);
		const d = computeFonctionPublique(
			c,
			compte,
			cumulJusqua(compte, 268),
			268,
			generation({}),
			fp,
		);
		expect(d.services).toBe(120);
		expect(d.minimumGarantiApplique).toBe(true);
		expect(d.pensionAnnuelle).toBeCloseTo(0.95 * fp.minimumGaranti.annuel, 0);
	});

	test("une mère fonctionnaire gagne 4 trimestres de services par enfant né avant 2004, 2 trimestres de durée d'assurance après", () => {
		const c = fonctionnaire(1970, 25, () => 35000, {
			sexe: "F",
			enfants: [1998, 2006],
		});
		const compte = buildCompte(c, B);
		const d = computeFonctionPublique(
			c,
			compte,
			cumulJusqua(compte, 240),
			240,
			generation({ dureeRequise: 172 }),
			fp,
		);
		expect(d.services).toBe(140);
		// Départ avant septembre 2026 exclu ici : en 2030, l'enfant de 2006 donne aussi un trimestre de services.
		expect(d.bonifications).toBe(5);
		expect(d.trimestresValides).toBe(140 + 4 + 2);
	});

	test("la catégorie active ouvre le départ cinq ans plus tôt, à condition d'avoir 17 ans de services", () => {
		const actif = fonctionnaire(1975, 22, () => 30000, { categorie: "actif" });
		const g = reglesGenerationFonctionPublique(actif, buildCompte(actif, B), B);
		expect(g.ageLegal).toBe(59 * 4);
		expect(g.ageTauxPleinAutomatique).toBe(62 * 4);
		const tardif = fonctionnaire(1975, 48, () => 30000, {
			categorie: "actif",
			debut: 22,
		});
		const h = reglesGenerationFonctionPublique(tardif, buildCompte(tardif, B), B);
		expect(h.ageLegal).toBe(64 * 4);
	});
});

describe("leviers propres à la fonction publique", () => {
	// Traitement qui monte de 2 % par an : les 25 meilleures années valent moins que la dernière.
	const c = fonctionnaire(1975, 24, (age) => 25000 * 1.02 ** (age - 24), {
		primes: 0.3,
	});
	const pension = (regles = {}) =>
		computePension(c, appliquerRegles(B, regles), {
			regles,
			ageLiquidation: 66 * 4,
		});

	test("25 meilleures années : la pension baisse", () => {
		const reference = pension().mensuelleBrute;
		const reforme = pension({ anneesTraitement: 25 }).mensuelleBrute;
		expect(reforme).toBeLessThan(reference * 0.92);
		expect(reforme).toBeGreaterThan(reference * 0.7);
	});

	test("primes comptées : la base de la pension monte de la part des primes", () => {
		const d0 = pension().fonctionPublique;
		const d1 = pension({ primesComptees: true }).fonctionPublique;
		expect((d1?.traitementDeReference ?? 0) / (d0?.traitementDeReference ?? 1)).toBeCloseTo(1.3, 2);
	});

	test("avance des catégories actives supprimée : même âge que les sédentaires, un trimestre de plus par génération", () => {
		const actif = fonctionnaire(1990, 22, () => 30000, { categorie: "actif" });
		const compte = buildCompte(actif, B);
		const regles = { avanceCategoriesActives: 0, anneeEffet: 2028 };
		expect(reglesGenerationFonctionPublique(actif, compte, B, regles).ageLegal).toBe(
			64 * 4,
		);
		const ancien = fonctionnaire(1971, 22, () => 30000, { categorie: "actif" });
		const g0 = reglesGenerationFonctionPublique(ancien, buildCompte(ancien, B), B);
		const g1 = reglesGenerationFonctionPublique(
			ancien,
			buildCompte(ancien, B),
			B,
			regles,
		);
		expect(g1.ageLegal - g0.ageLegal).toBeGreaterThan(0);
		expect(g1.ageLegal - g0.ageLegal).toBeLessThan(8);
	});

	test("un âge légal plus bas ne fait partir personne plus tard", () => {
		const regles = { ageLegal: 248, anneeEffet: 2028 };
		const be = appliquerRegles(B, regles);
		for (const entree of [20, 24, 30, 40]) {
			const x = fonctionnaire(1975, entree, () => 30000, { debut: 19 });
			x.tirageDepart = 0.9;
			const compte = buildCompte(x, B);
			expect(
				computePension(x, be, { regles, compte }).liquidation.age,
			).toBeLessThanOrEqual(computePension(x, B, { compte }).liquidation.age);
		}
	});
});

describe("backtest de la fonction publique", () => {
	const groupe = (debut: string) => {
		const lignes = BACKTEST_PUBLIC.filter((l) =>
			l.groupe.startsWith(`Fonction publique : ${debut}`),
		);
		if (lignes.length === 0) throw new Error(`groupe inconnu : ${debut}`);
		return lignes;
	};
	const relatif = (l: { modele: number; observe: number }) =>
		Math.abs(l.modele / l.observe - 1);

	test("pension moyenne des retraités : État à moins de 8 %, CNRACL à moins de 13 %", () => {
		for (const l of groupe("pension moyenne des retraités"))
			expect(relatif(l)).toBeLessThan(l.nom.startsWith("État") ? 0.08 : 0.13);
	});

	test("pension moyenne des nouveaux retraités à moins de 15 %", () => {
		for (const l of groupe("pension moyenne des nouveaux retraités"))
			expect(relatif(l)).toBeLessThan(0.15);
	});

	test("durées de services et d'assurance à moins de 6 %", () => {
		for (const l of groupe("durées")) expect(relatif(l)).toBeLessThan(0.06);
	});

	// Écart connu : les sédentaires de l'État partaient plus tôt en 2014 que dans le modèle (1,6 an).
	test("âge moyen de départ à moins de 0,8 an en 2024, de 1,8 an en 2014", () => {
		for (const l of groupe("âge moyen de départ"))
			expect(Math.abs(l.modele - l.observe)).toBeLessThan(
				l.nom.endsWith("2024") ? 0.8 : 1.8,
			);
	});

	test("traitements et primes de 2024 à moins de 10 %", () => {
		for (const l of groupe("rémunération")) expect(relatif(l)).toBeLessThan(0.1);
	});

	test("masse des pensions de 2024 à moins de 15 %", () => {
		for (const l of groupe("pensions de droit direct"))
			expect(relatif(l)).toBeLessThan(0.15);
	});
});
