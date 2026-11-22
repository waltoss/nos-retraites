/**
 * Photographie du moteur : empreinte de chaque carrière, de chaque pension et de chaque année
 * projetée, pour le droit en vigueur et pour un scénario par levier.
 *
 * Elle ne dit pas que les chiffres sont justes (c'est le rôle des backtests), elle dit qu'ils
 * n'ont pas bougé : une refonte du modèle de données doit la laisser intacte, au bit près.
 * Seul `lire.ts` connaît la forme des carrières et des pensions.
 *
 * Après un changement voulu des résultats : `bun test packages --update-snapshots`.
 */
import { describe, expect, test } from "bun:test";
import {
	BAREMES_FRANCE as B,
	buildComptes,
	CHAMP_PRIVE,
	CHAMP_PUBLIC,
	computePensions,
	computeSysteme,
	generatePopulation,
	generatePopulationPublique,
	type Individu,
	type OptionsProjection,
	type Pension,
	PYRAMIDES_PROJETEES,
	photographier,
	prepareProjection,
	projeter,
	reglesUniverselles,
	runSimulation,
	SCENARIO_PUBLIC,
	SCENARIO_REFERENCE,
	SURVIE_SELON_PENSION,
} from "../src/index.ts";
import { type Regles, valeursAnnee, valeursPension } from "./lire.ts";

const ANNEE_EFFET = 2028;

/** Un scénario par levier, puis tous ensemble. */
const SCENARIOS: Record<string, Regles> = {
	droitEnVigueur: {},
	ageLegal65: { ageLegal: 260 },
	ageLegal60Duree42: { ageLegal: 240, dureeRequise: 168 },
	duree44: { dureeRequise: 176 },
	ageTauxPlein66: { ageTauxPlein: 264 },
	avanceDebut: {
		ageLegal: 248,
		avanceDebut: { maximum: 8, ageSansAvance: 20, parAnnee: 2 },
	},
	sansCarriereLongue: { carriereLongue: false },
	meilleuresAnnees30: { nbMeilleuresAnnees: 30 },
	tauxPlein48: { tauxPlein: 0.48 },
	decote: { decoteParTrimestre: 0.003 },
	surcote: { surcoteParTrimestre: 0.02 },
	valeurDuPoint: { valeurDuPoint: 0.95 },
	minimumContributifPlus: { minimumContributif: 1.2 },
	sansMinimumContributif: { minimumContributif: 0 },
	mda4: { mdaParEnfant: 4 },
	majorationEnfants: { majorationTroisEnfants: 0.05 },
	cotisationBase: { cotisationBase: 0.01 },
	tauxAppel: { tauxAppel: 1.3 },
	revalorisation: {
		revalorisationReelle: -0.01,
		revalorisationDuree: 3,
		revalorisationSeuil: 1500,
	},
	traitementEtPrimes: { anneesTraitement: 10, primesComptees: true },
	categoriesActives: { avanceCategoriesActives: 0.5 },
	toutEnsemble: {
		ageLegal: 260,
		dureeRequise: 176,
		ageTauxPlein: 272,
		nbMeilleuresAnnees: 30,
		tauxPlein: 0.48,
		decoteParTrimestre: 0.01,
		surcoteParTrimestre: 0.015,
		valeurDuPoint: 0.97,
		minimumContributif: 1.1,
		mdaParEnfant: 6,
		majorationTroisEnfants: 0.08,
		cotisationBase: 0.005,
		tauxAppel: 1.29,
		revalorisationReelle: -0.005,
		anneesTraitement: 25,
		primesComptees: true,
		avanceCategoriesActives: 0,
	},
};

/** Empreinte d'une suite de nombres : la même si et seulement si chaque bit est le même. */
function empreinte(valeurs: number[]): string {
	const octets = new Uint8Array(Float64Array.from(valeurs).buffer);
	return Bun.hash(octets).toString(16);
}

const somme = (v: number[]) => v.reduce((t, x) => t + x, 0);

function empreinteCarrieres(population: Individu[]) {
	const v: number[] = [];
	let annees = 0;
	for (const i of population) {
		const c = i.carriere;
		v.push(c.anneeNaissance, c.sexe === "F" ? 1 : 0, c.cadre ? 1 : 0);
		v.push(c.enfants.length, ...c.enfants);
		for (const a of c.annees) {
			v.push(...valeursAnnee(c, a));
			annees++;
		}
	}
	return { individus: population.length, annees, empreinte: empreinte(v) };
}

function empreintePensions(pensions: Pension[]) {
	const v: number[] = [];
	let mensuelle = 0;
	let age = 0;
	for (const p of pensions) {
		v.push(...valeursPension(p));
		mensuelle += p.mensuelleBrute;
		age += p.liquidation.age;
	}
	return {
		pensionMoyenne: mensuelle / pensions.length,
		ageMoyen: age / pensions.length / 4,
		empreinte: empreinte(v),
	};
}

const prive = generatePopulation({ ...SCENARIO_REFERENCE, taille: 6000 }, B);
const publique = generatePopulationPublique(B, undefined, {
	...SCENARIO_PUBLIC,
	taille: 3000,
});
const populations = { prive, publique };
const comptes = {
	prive: buildComptes(prive, B),
	publique: buildComptes(publique, B),
};
const reference = {
	prive: computePensions(prive, B, {}, comptes.prive),
	publique: computePensions(publique, B, {}, comptes.publique),
};
const options = (nom: "prive" | "publique"): OptionsProjection => ({
	debut: 2026,
	fin: 2070,
	pyramides: PYRAMIDES_PROJETEES,
	champ: nom === "prive" ? CHAMP_PRIVE : CHAMP_PUBLIC,
	survie: SURVIE_SELON_PENSION,
	anneeEffet: ANNEE_EFFET,
	comptes: comptes[nom],
	pensionsReference: reference[nom],
});

describe("photographie du moteur", () => {
	test("carrières générées", () => {
		expect({
			prive: empreinteCarrieres(prive),
			publique: empreinteCarrieres(publique),
		}).toMatchSnapshot();
	});

	test("comptes de carrière", () => {
		const lire = (nom: "prive" | "publique") => {
			const v: number[] = [];
			for (const c of comptes[nom])
				v.push(
					c.ageDebut,
					...c.trimestresCotises,
					...c.trimestresAssimiles,
					...c.trimestresAutresRegimes,
					...c.trimestresReputes,
					...c.salairesRevalorises,
					...(c.primesRevalorisees ?? []),
					...c.points,
				);
			return empreinte(v);
		};
		expect({ prive: lire("prive"), publique: lire("publique") }).toMatchSnapshot();
	});

	for (const [nom, regles] of Object.entries(SCENARIOS))
		test(`pensions, ${nom}`, () => {
			const resultat: Record<string, unknown> = {};
			for (const champ of ["prive", "publique"] as const)
				for (const [date, r] of [
					["toujours", regles],
					["depuis2028", { ...regles, anneeEffet: ANNEE_EFFET }],
				] as const)
					resultat[`${champ}, ${date}`] = empreintePensions(
						computePensions(populations[champ], B, r, comptes[champ]),
					);
			expect(resultat).toMatchSnapshot();
		});

	for (const [nom, regles] of Object.entries(SCENARIOS))
		test(`projection, ${nom}`, () => {
			const projeterChamp = (champ: "prive" | "publique", r: Regles) => {
				const preparation = prepareProjection(
					populations[champ],
					B,
					r,
					options(champ),
				);
				return { preparation, projection: projeter(preparation) };
			};
			const p = projeterChamp("prive", regles);
			const f = projeterChamp("publique", regles);
			const lignes = (annees: object[]) =>
				empreinte(
					annees.flatMap((a) =>
						Object.values(a).filter((x) => typeof x === "number"),
					),
				);
			const photo = photographier(p.preparation, 2040);
			const droit = {
				prive: projeterChamp("prive", {}).projection,
				publique: projeterChamp("publique", {}).projection,
			};
			const systeme = computeSysteme(
				droit.prive,
				p.projection,
				undefined,
				projeterChamp("prive", reglesUniverselles(regles)).projection,
				{ reference: droit.publique, scenario: f.projection },
			);
			expect({
				prive: {
					annees: lignes(p.projection.annees),
					generations: lignes(p.projection.generations),
					pensions2070: p.projection.annees.at(-1)?.pensions,
					cotisations2070: p.projection.annees.at(-1)?.cotisations,
					// Artisans et commerçants parmi les mêmes individus, comptés à part.
					autres: lignes(p.projection.annees.map((a) => a.autres)),
					autres2070: p.projection.annees.at(-1)?.autres,
				},
				publique: {
					annees: lignes(f.projection.annees),
					generations: lignes(f.projection.generations),
					pensions2070: f.projection.annees.at(-1)?.pensions,
				},
				photo2040: {
					retraites: photo.effectifs.retraites,
					cotisants: photo.effectifs.cotisants,
					pensions: empreinte([...photo.pensionParIndividu]),
					parts: photo.parts,
				},
				systeme: {
					annees: lignes(
						systeme.map(({ postes, ...reste }) => ({
							...reste,
							...postes,
						})),
					),
					solde2070: systeme.at(-1)?.solde,
				},
			}).toMatchSnapshot();
		});

	test("photographie de l'année de référence", () => {
		const r = runSimulation(prive, B, {}, comptes.prive);
		expect({
			effectifs: r.effectifs,
			masses: r.masses,
			parts: r.parts,
			parSexe: r.parSexe,
			ageMoyenDepart: r.ageMoyenDepart,
			pensions: empreinte([...r.pensionParIndividu]),
			cotisations: somme([...r.cotisations.valeurs]),
		}).toMatchSnapshot();
	});
});
