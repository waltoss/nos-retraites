import { describe, expect, test } from "bun:test";
import {
	type Scenario,
	buildComptes,
	createRng,
	generateCarriere,
	generatePopulation,
	HYPOTHESES_TRANCHE_0,
	runSimulation,
} from "../src/index.ts";
import { BAREMES_FICTIFS as B } from "./fixture.ts";

const SCENARIO: Scenario = { taille: 4000, graine: 7, generations: [1955, 2003] };

describe("générateur", () => {
	test("même graine, même carrière", () => {
		const a = generateCarriere(1960, createRng(42), HYPOTHESES_TRANCHE_0, B);
		const b = generateCarriere(1960, createRng(42), HYPOTHESES_TRANCHE_0, B);
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
});
