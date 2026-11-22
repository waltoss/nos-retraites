/** Mécanique d'une réserve : elle rapporte, se remplit par les excédents et se vide par les déficits. */
import { describe, expect, test } from "bun:test";
import {
	cadrerFlux,
	type FluxRegime,
	projeterReserve,
} from "../src/index.ts";

const flux = (cotisations: number[], pensions: number[]): FluxRegime[] =>
	cotisations.map((c, k) => ({
		annee: 2026 + k,
		cotisations: c,
		pensions: pensions[k] as number,
	}));

describe("réserve d'un régime", () => {
	test("à l'équilibre, elle ne grossit que de ses produits financiers", () => {
		const r = projeterReserve(flux([10, 10, 10], [10, 10, 10]), {
			initiale: 100,
			rendement: 0.02,
			ressources: 50,
			charges: 50,
		});
		expect(r.map((a) => a.reserve)).toEqual([100, 102, 102 * 1.02]);
		expect(r[1]?.produitsFinanciers).toBeCloseTo(2, 12);
		expect(r[1]?.soldeTechnique).toBe(0);
		expect(r[0]?.moisDeCharges).toBeCloseTo(24, 12);
	});

	test("le modèle ne donne que l'évolution : les niveaux sont ceux de l'année de départ", () => {
		const r = projeterReserve(flux([10, 11], [20, 20]), {
			initiale: 0,
			rendement: 0,
			ressources: 100,
			charges: 100,
		});
		expect(r[1]?.ressources).toBeCloseTo(110, 12);
		expect(r[1]?.charges).toBe(100);
		expect(r[1]?.reserve).toBeCloseTo(10, 12);
	});

	test("un déficit puise dans la réserve ; une fois vide, il manque de l'argent", () => {
		const r = projeterReserve(flux([10, 10, 10, 10], [10, 12, 12, 12]), {
			initiale: 30,
			rendement: 0,
			ressources: 100,
			charges: 100,
		});
		expect(r.map((a) => Math.round(a.reserve))).toEqual([30, 10, 0, 0]);
		expect(r.map((a) => Math.round(a.manque))).toEqual([0, 0, 10, 20]);
	});

	test("un rendement plus haut retarde l'épuisement", () => {
		const cas = (rendement: number) =>
			projeterReserve(
				flux(new Array(30).fill(10), [10, ...new Array(29).fill(10.5)]),
				{ initiale: 60, rendement, ressources: 100, charges: 100 },
			).findIndex((a) => a.manque > 0);
		expect(cas(0)).toBeGreaterThan(0);
		expect(cas(0.03)).toBeGreaterThan(cas(0));
	});

	test("cadrage : le droit en vigueur suit la série publiée, le scénario garde son écart", () => {
		const reference = flux([10, 12], [5, 9]);
		const cadre = { 2026: 0.5, 2027: 0.55 };
		const droit = cadrerFlux(reference, reference, cadre);
		// Pensions sur cotisations : 0,5 puis 0,5 × 1,1, quoi que dise le modèle.
		expect(droit[0]?.pensions).toBeCloseTo(5, 12);
		expect((droit[1]?.pensions ?? 0) / 12).toBeCloseTo(0.55, 12);
		const scenario = cadrerFlux(reference, flux([10, 12], [5, 8.1]), cadre);
		expect((scenario[1]?.pensions ?? 0) / (droit[1]?.pensions ?? 1)).toBeCloseTo(0.9, 12);
	});
});
