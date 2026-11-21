import { describe, expect, test } from "bun:test";
import {
	type Scenario,
	buildComptes,
	compareScenarios,
	createRng,
	generateCarriere,
	generatePopulation,
	HYPOTHESES,
	runSimulation,
} from "../src/index.ts";
import { BAREMES_FICTIFS as B } from "./fixture.ts";

const SCENARIO: Scenario = { taille: 4000, graine: 7, generations: [1955, 2003] };

describe("générateur", () => {
	test("même graine, même carrière", () => {
		const a = generateCarriere(1960, createRng(42), HYPOTHESES, B);
		const b = generateCarriere(1960, createRng(42), HYPOTHESES, B);
		expect(a).toEqual(b);
	});

	test("carrières plausibles", () => {
		const population = generatePopulation(SCENARIO, B);
		for (const { carriere: c } of population) {
			const premiere = c.annees[0];
			expect(premiere).toBeDefined();
			const ageEntree = (premiere?.annee ?? 0) - c.anneeNaissance;
			expect(ageEntree).toBeGreaterThanOrEqual(16);
			expect(ageEntree).toBeLessThanOrEqual(28);
			for (const a of c.annees) {
				expect(a.salaireBrut).toBeGreaterThanOrEqual(0);
				if (a.etat !== "emploi") expect(a.salaireBrut).toBe(0);
			}
		}
		const femmes = population.filter((i) => i.carriere.sexe === "F").length;
		expect(femmes / population.length).toBeGreaterThan(0.45);
		expect(femmes / population.length).toBeLessThan(0.55);
	});
});

describe("simulation", () => {
	const population = generatePopulation(SCENARIO, B);
	const comptes = buildComptes(population, B);

	test("chaque individu est compté une fois", () => {
		const r = runSimulation(population, B, {}, comptes);
		expect(r.effectifs.cotisants + r.effectifs.retraites + r.effectifs.autres).toBe(SCENARIO.taille);
		expect(r.effectifs.cotisants).toBeGreaterThan(0);
		expect(r.effectifs.retraites).toBeGreaterThan(0);
	});

	test("les comptes précalculés donnent le même résultat", () => {
		const a = runSimulation(population, B, {}, comptes);
		const b = runSimulation(population, B, {});
		expect(a.pensions.resume).toEqual(b.pensions.resume);
		expect(a.cotisations.resume).toEqual(b.cotisations.resume);
	});

	test("relever l'âge légal ne crée jamais de retraités", () => {
		let precedent = Number.POSITIVE_INFINITY;
		for (const age of [60, 62, 64, 66]) {
			const r = runSimulation(population, B, { ageLegal: age * 4 }, comptes);
			expect(r.effectifs.retraites).toBeLessThanOrEqual(precedent);
			precedent = r.effectifs.retraites;
		}
	});

	test("l'histogramme couvre tout l'échantillon", () => {
		const r = runSimulation(population, B, {}, comptes);
		const total = r.pensions.histogramme.classes.reduce((t, x) => t + x, 0);
		expect(total).toBeCloseTo(1, 9);
	});

	test("un scénario sans règle reproduit la référence", () => {
		const a = runSimulation(population, B, {}, comptes);
		const ecarts = compareScenarios(a.pensionParIndividu, a.pensionParIndividu);
		for (const e of ecarts) {
			expect(e.scenario).toBeCloseTo(e.reference, 9);
			expect(e.partSortie).toBe(0);
		}
	});

	test("baisser la valeur du point baisse toutes les pensions", () => {
		const a = runSimulation(population, B, {}, comptes);
		const b = runSimulation(population, B, { valeurDuPoint: 0.9 }, comptes);
		expect(b.effectifs.retraites).toBe(a.effectifs.retraites);
		for (const e of compareScenarios(a.pensionParIndividu, b.pensionParIndividu)) {
			expect(e.scenario).toBeLessThan(e.reference);
		}
	});

	test("monter les cotisations ne touche pas les pensions", () => {
		const a = runSimulation(population, B, {}, comptes);
		const b = runSimulation(population, B, { cotisationBase: 0.01 }, comptes);
		expect(b.masses.pensions).toBeCloseTo(a.masses.pensions, 6);
		expect(b.masses.cotisations).toBeGreaterThan(a.masses.cotisations);
	});

	test("les masses sont cohérentes avec les moyennes", () => {
		const r = runSimulation(population, B, {}, comptes);
		expect(r.masses.pensions).toBeCloseTo(r.pensions.resume.moyenne * r.effectifs.retraites * 12, 3);
		expect(r.parSexe.F.effectif + r.parSexe.H.effectif).toBe(r.effectifs.retraites);
	});

	test("moins de chômage, plus de cotisants", () => {
		const base = runSimulation(population, B, {}, comptes);
		const p = generatePopulation({ ...SCENARIO, facteurs: { chomage: 0.5 } }, B);
		const r = runSimulation(p, B, {});
		expect(r.effectifs.cotisants).toBeGreaterThan(base.effectifs.cotisants);
	});
});

describe("pondération", () => {
	test("les totaux du scénario de référence recoupent les chiffres publiés", async () => {
		const { BAREMES_FRANCE, SCENARIO_REFERENCE } = await import("../src/index.ts");
		const reference = (
			await import("../../../data/references/population.json", {
				with: { type: "json" },
			})
		).default;
		const population = generatePopulation(SCENARIO_REFERENCE, BAREMES_FRANCE);
		const r = runSimulation(population, BAREMES_FRANCE);
		const cotisants = reference.agircArrco.cotisants.totaux.ensemble;
		const retraites = reference.agircArrco.retraitesDroitDirect.totaux.ensemble.effectifs;
		expect(Math.abs(r.effectifs.cotisants / cotisants - 1)).toBeLessThan(0.06);
		expect(Math.abs(r.effectifs.retraites / retraites - 1)).toBeLessThan(0.1);
		// Personne ne représente plus de monde qu'il n'en existe à son âge.
		const total = population.reduce((t, i) => t + i.poids, 0);
		expect(total).toBeLessThan(reference.pyramideDesAges.france.totauxLus.ensemble);
	});
});
