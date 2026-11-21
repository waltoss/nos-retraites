import { describe, expect, test } from "bun:test";
import { buildCompte, computeCotisations, computePension, cumulJusqua } from "../src/index.ts";
import { BAREMES_FICTIFS as B, carriereContinue } from "./fixture.ts";

describe("régime général", () => {
	test("carrière complète : taux plein dès l'âge légal", () => {
		const p = computePension(carriereContinue(20, 61, 30000), B);
		expect(p.liquidation.age).toBe(62 * 4);
		expect(p.cnav.trimestresValides).toBe(168);
		expect(p.cnav.tauxLiquidation).toBe(0.5);
		expect(p.cnav.salaireAnnuelMoyen).toBe(30000);
		expect(p.cnav.pensionAnnuelle).toBeCloseTo(15000, 6);
	});

	test("le salaire est plafonné au PASS dans le salaire annuel moyen", () => {
		const p = computePension(carriereContinue(20, 61, 60000), B);
		expect(p.cnav.salaireAnnuelMoyen).toBe(40000);
		expect(p.cnav.pensionAnnuelle).toBeCloseTo(20000, 6);
	});

	test("seules les 25 meilleures années comptent", () => {
		const c = carriereContinue(20, 61, 20000);
		for (const a of c.annees.slice(0, 25)) a.salaireBrut = 36000;
		expect(computePension(c, B).cnav.salaireAnnuelMoyen).toBe(36000);
	});

	test("départ à l'âge légal avec une carrière incomplète : décote et proratisation", () => {
		const p = computePension(carriereContinue(25, 61, 30000), B, { ageLiquidation: 62 * 4 });
		expect(p.cnav.trimestresValides).toBe(148);
		expect(p.cnav.trimestresDecote).toBe(20);
		expect(p.cnav.tauxLiquidation).toBeCloseTo(0.375, 9);
		expect(p.cnav.pensionAnnuelle).toBeCloseTo(30000 * 0.375 * (148 / 168), 6);
	});

	test("sans taux plein par la durée, le départ par défaut attend l'âge du taux plein automatique", () => {
		const p = computePension(carriereContinue(25, 61, 30000), B);
		expect(p.liquidation.age).toBe(67 * 4);
		expect(p.cnav.tauxLiquidation).toBe(0.5);
		expect(p.cnav.proratisation).toBeCloseTo(148 / 168, 9);
	});

	test("la décote retient le plus favorable de la durée et de l'âge", () => {
		const p = computePension(carriereContinue(30, 64, 30000), B, { ageLiquidation: 65 * 4 });
		expect(p.cnav.trimestresValides).toBe(140);
		expect(p.cnav.trimestresDecote).toBe(8);
	});

	test("surcote pour les trimestres travaillés au-delà du taux plein", () => {
		const p = computePension(carriereContinue(20, 63, 30000), B, { ageLiquidation: 64 * 4 });
		expect(p.cnav.trimestresSurcote).toBe(8);
		expect(p.cnav.pensionAnnuelle).toBeCloseTo(15000 * 1.1, 6);
	});

	test("une mère de trois enfants reçoit des trimestres et une majoration", () => {
		const c = carriereContinue(24, 61, 30000, { sexe: "F", enfants: [1985, 1988, 1991] });
		const p = computePension(c, B);
		expect(p.cnav.trimestresMda).toBe(24);
		expect(p.cnav.trimestresValides).toBe(38 * 4 + 24);
		expect(p.liquidation.age).toBe(62 * 4);
		expect(p.cnav.majorationEnfants).toBe(0.1);
		expect(p.cnav.pensionAnnuelle).toBeCloseTo(15000 * 1.1, 6);
	});

	test("un père n'a pas de trimestres pour enfants mais a la majoration", () => {
		const c = carriereContinue(20, 61, 30000, { enfants: [1985, 1988, 1991] });
		const p = computePension(c, B);
		expect(p.cnav.trimestresMda).toBe(0);
		expect(p.cnav.majorationEnfants).toBe(0.1);
	});

	test("un petit salaire ne valide qu'une partie des trimestres", () => {
		const compte = buildCompte(carriereContinue(20, 20, 3200), B);
		expect(compte.trimestresCotises[0]).toBe(2);
	});

	test("le chômage valide des trimestres sans salaire", () => {
		const c = carriereContinue(20, 61, 30000);
		for (const a of c.annees.slice(10, 15)) {
			a.etat = "chomage";
			a.salaireBrut = 0;
		}
		const p = computePension(c, B);
		expect(p.cnav.trimestresValides).toBe(168);
		expect(p.cnav.trimestresCotises).toBe(148);
	});

	test("l'inactivité ne valide rien", () => {
		const c = carriereContinue(20, 61, 30000);
		for (const a of c.annees.slice(10, 15)) {
			a.etat = "inactivite";
			a.salaireBrut = 0;
		}
		expect(computePension(c, B, { ageLiquidation: 62 * 4 }).cnav.trimestresValides).toBe(148);
	});

	test("un départ en cours d'année compte les trimestres écoulés", () => {
		const compte = buildCompte(carriereContinue(20, 62, 30000), B);
		expect(cumulJusqua(compte, 62 * 4 + 2).trimestresCotises).toBe(170);
	});
});

describe("régime complémentaire", () => {
	test("points sur la tranche 1", () => {
		const p = computePension(carriereContinue(20, 61, 30000), B);
		expect(p.agircArrco.points).toBeCloseTo(42 * 90, 6);
		expect(p.agircArrco.pensionAnnuelle).toBeCloseTo(42 * 90 * 1.4, 6);
		expect(p.mensuelleBrute).toBeCloseTo((15000 + 5292) / 12, 6);
	});

	test("points sur les deux tranches au-dessus du PASS", () => {
		const p = computePension(carriereContinue(20, 61, 60000), B);
		expect(p.agircArrco.points).toBeCloseTo(42 * 280, 6);
	});

	test("coefficient d'anticipation en cas de décote", () => {
		const p = computePension(carriereContinue(25, 61, 30000), B, { ageLiquidation: 62 * 4 });
		expect(p.agircArrco.coefficientAnticipation).toBeCloseTo(0.8, 9);
	});

	test("le chômage donne des points sur la base du dernier salaire", () => {
		const c = carriereContinue(20, 61, 30000);
		const a = c.annees[10];
		if (a) {
			a.etat = "chomage";
			a.salaireBrut = 0;
		}
		expect(computePension(c, B).agircArrco.points).toBeCloseTo(42 * 90, 6);
	});
});

describe("scénario", () => {
	test("relever l'âge légal retarde le départ et ajoute une surcote nulle", () => {
		const p = computePension(carriereContinue(20, 65, 30000), B, { regles: { ageLegal: 64 * 4 } });
		expect(p.liquidation.age).toBe(64 * 4);
		expect(p.cnav.trimestresSurcote).toBe(0);
		expect(p.cnav.trimestresValides).toBe(176);
	});

	test("allonger la durée requise retarde le départ", () => {
		const p = computePension(carriereContinue(20, 65, 30000), B, { regles: { dureeRequise: 172 } });
		expect(p.liquidation.age).toBe(63 * 4);
	});

	test("cotisations de l'année de référence", () => {
		expect(computeCotisations(30000, B)).toBeCloseTo(
			30000 * 0.15 + 30000 * 0.02 + 30000 * (0.06 * 1.25 + 0.02),
			6,
		);
		expect(computeCotisations(60000, B)).toBeCloseTo(
			40000 * 0.15 +
				60000 * 0.02 +
				40000 * (0.06 * 1.25 + 0.02) +
				20000 * (0.16 * 1.25 + 0.03) +
				60000 * 0.004,
			6,
		);
	});
});
