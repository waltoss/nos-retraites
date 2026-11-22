/** Mécanique d'une réserve : elle rapporte, se remplit par les excédents et se vide par les déficits. */
import { describe, expect, test } from "bun:test";
import {
	type AnneeSysteme,
	ajouterInterets,
	cadrerFlux,
	type FluxRegime,
	PATRIMOINE_SYSTEME,
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

/** Une année du système réduite à ses deux soldes. */
const annee = (a: number, solde: number, soldeHorsEtat = solde) =>
	({ annee: a, solde, soldeHorsEtat }) as AnneeSysteme;

describe("intérêts du système entier", () => {
	const h = { annee: 2025, reserves: 120, dette: 20, taux: { 2026: 0.02, 2027: 0.01 } };

	test("la situation nette rapporte, puis le solde s'y ajoute", () => {
		const r = ajouterInterets([annee(2026, -10), annee(2027, -10)], h);
		expect(r[0]?.interets?.officiel).toBeCloseTo(2, 12);
		expect(r[0]?.situationPatrimoniale?.officiel).toBeCloseTo(92, 12);
		expect(r[1]?.interets?.officiel).toBeCloseTo(0.92, 12);
		expect(r[1]?.situationPatrimoniale?.officiel).toBeCloseTo(82.92, 12);
	});

	test("une fois la situation nette négative, la dette coûte", () => {
		const r = ajouterInterets([annee(2026, -200), annee(2027, 0)], h);
		expect(r[1]?.interets?.officiel).toBeCloseTo(-0.98, 12);
	});

	test("sans les versements de l'État, la dette grossit plus vite", () => {
		const r = ajouterInterets([annee(2026, 0, -50), annee(2027, 0, -50)], h);
		expect(r[1]?.interets?.officiel).toBeCloseTo(1.02, 12);
		expect(r[1]?.interets?.horsEtat).toBeCloseTo(0.52, 12);
	});

	test("au-delà de la série, le dernier taux connu continue", () => {
		const r = ajouterInterets([annee(2026, 0), annee(2027, 0), annee(2028, 0)], h);
		expect(r[2]?.interets?.officiel).toBeCloseTo(102 * 1.01 * 0.01, 12);
	});

	test("données : réserves et dette du COR fin 2025, taux défini jusqu'en 2070", () => {
		// 244,6 et 29,3 milliards d'euros de 2025, passés en euros de 2026.
		expect(PATRIMOINE_SYSTEME.reserves / 1e9).toBeGreaterThan(244.6);
		expect(PATRIMOINE_SYSTEME.reserves / 1e9).toBeLessThan(244.6 * 1.03);
		expect(PATRIMOINE_SYSTEME.dette / 1e9).toBeGreaterThan(29.3);
		expect(PATRIMOINE_SYSTEME.dette / 1e9).toBeLessThan(29.3 * 1.03);
		for (let a = 2026; a <= 2070; a++) expect(PATRIMOINE_SYSTEME.taux[a]).toBeNumber();
	});
});
