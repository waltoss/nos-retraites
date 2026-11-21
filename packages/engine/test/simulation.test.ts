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
				if ((a.moisEmploi ?? 12) === 0) expect(a.salaireBrut).toBe(0);
				expect((a.moisEmploi ?? 0) + (a.moisChomage ?? 0) + (a.moisMaladie ?? 0)).toBeLessThanOrEqual(12);
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

describe("projection", () => {
	test("trajectoires cohérentes avec la photographie et avec la date d'effet", async () => {
		const {
			BAREMES_FRANCE,
			CHAMP_PRIVE,
			computePensions,
			PYRAMIDES_PROJETEES,
			runProjection,
			SCENARIO_REFERENCE,
		} = await import("../src/index.ts");
		const population = generatePopulation(
			{ ...SCENARIO_REFERENCE, taille: 12000 },
			BAREMES_FRANCE,
		);
		const comptes = buildComptes(population, BAREMES_FRANCE);
		const options = {
			debut: 2026,
			fin: 2070,
			pyramides: PYRAMIDES_PROJETEES,
			champ: CHAMP_PRIVE,
			anneeEffet: 2028,
			comptes,
			pensionsReference: computePensions(population, BAREMES_FRANCE, {}, comptes),
		};
		const reference = runProjection(population, BAREMES_FRANCE, {}, options);
		const photo = runSimulation(population, BAREMES_FRANCE, {}, comptes);
		const premiere = reference.annees[0];
		expect(premiere?.annee).toBe(2026);
		// La première année de la projection est la photographie de l'année de référence.
		expect((premiere?.retraites ?? 0) / photo.effectifs.retraites).toBeCloseTo(1, 2);
		expect((premiere?.pensions ?? 0) / photo.masses.pensions).toBeCloseTo(1, 2);
		expect((premiere?.cotisations ?? 0) / photo.masses.cotisations).toBeCloseTo(1, 2);

		const reforme = runProjection(
			population,
			BAREMES_FRANCE,
			{ ageLegal: 260, revalorisationReelle: -0.01 },
			options,
		);
		// Rien ne change avant l'année d'effet.
		for (const k of [0, 1]) {
			expect(reforme.annees[k]?.pensions).toBeCloseTo(reference.annees[k]?.pensions ?? 0, 0);
			expect(reforme.annees[k]?.retraites).toBeCloseTo(reference.annees[k]?.retraites ?? 0, 0);
		}
		// Ensuite : moins de retraités, des pensions qui décrochent des prix.
		const fin = reforme.annees.at(-1);
		const finReference = reference.annees.at(-1);
		expect(fin?.retraites ?? 0).toBeLessThan(finReference?.retraites ?? 0);
		expect((fin?.pensions ?? 0) / (finReference?.pensions ?? 1)).toBeLessThan(0.95);
		// Mortalité selon la pension : autant de retraités, mais les pensions élevées durent plus longtemps.
		const { SURVIE_SELON_PENSION } = await import("../src/index.ts");
		const inegale = runProjection(population, BAREMES_FRANCE, {}, {
			...options,
			survie: SURVIE_SELON_PENSION,
		});
		expect((inegale.annees[20]?.retraites ?? 0) / (reference.annees[20]?.retraites ?? 1)).toBeCloseTo(1, 2);
		expect(inegale.annees[20]?.pensions ?? 0).toBeGreaterThan((reference.annees[20]?.pensions ?? 0) * 1.01);
		// Les générations déjà parties ne voient pas leur âge de départ bouger.
		const g1950 = (p: typeof reference) => p.generations.find((g) => g.generation === 1950);
		expect(g1950(reforme)?.ageMoyenDepart).toBeCloseTo(g1950(reference)?.ageMoyenDepart ?? 0, 6);
	});
});

describe("système entier", () => {
	test("la loi actuelle retombe sur le cadrage du COR, un scénario s'en écarte dans le bon sens", async () => {
		const {
			BAREMES_FRANCE,
			CADRAGE_COR,
			CHAMP_PRIVE,
			computeSysteme,
			PYRAMIDES_PROJETEES,
			runProjection,
			SCENARIO_REFERENCE,
		} = await import("../src/index.ts");
		const population = generatePopulation(
			{ ...SCENARIO_REFERENCE, taille: 8000 },
			BAREMES_FRANCE,
		);
		const options = {
			debut: 2026,
			fin: 2070,
			pyramides: PYRAMIDES_PROJETEES,
			champ: CHAMP_PRIVE,
			anneeEffet: 2028,
			comptes: buildComptes(population, BAREMES_FRANCE),
		};
		const reference = runProjection(population, BAREMES_FRANCE, {}, options);
		const loi = computeSysteme(reference, reference);
		for (const a of loi) {
			const c = CADRAGE_COR.annees[a.annee];
			expect(a.depenses).toBeCloseTo(c?.depenses ?? 0, 0);
			expect(a.ressources).toBeCloseTo(c?.ressources ?? 0, 0);
			expect(a.soldeHorsEtat).toBeLessThan(a.solde);
		}
		// Solde officiel de 2026 : un besoin de financement de l'ordre de 0,2 % du PIB.
		const debut = loi[0];
		expect((debut?.solde ?? 0) / (debut?.pib ?? 1)).toBeGreaterThan(-0.004);
		expect(debut?.solde ?? 0).toBeLessThan(0);

		const sousIndexe = computeSysteme(
			reference,
			runProjection(population, BAREMES_FRANCE, { revalorisationReelle: -0.01 }, options),
		);
		const cotise = computeSysteme(
			reference,
			runProjection(population, BAREMES_FRANCE, { cotisationBase: 0.01 }, options),
		);
		const point = computeSysteme(
			reference,
			runProjection(population, BAREMES_FRANCE, { valeurDuPoint: 0.95 }, options),
		);
		const fin = loi.length - 1;
		expect(sousIndexe[fin]?.depenses ?? 0).toBeLessThan(loi[fin]?.depenses ?? 0);
		expect(cotise[fin]?.cotisations ?? 0).toBeGreaterThan(loi[fin]?.cotisations ?? 0);
		expect(cotise[fin]?.depenses).toBeCloseTo(loi[fin]?.depenses ?? 0, 0);
		// Un réglage propre à la complémentaire du privé ne se propage pas aux autres régimes.
		const ecartPrive = (reference.annees[fin]?.pensions ?? 0) * 0.05;
		expect((loi[fin]?.depenses ?? 0) - (point[fin]?.depenses ?? 0)).toBeLessThan(ecartPrive);
	});
});
