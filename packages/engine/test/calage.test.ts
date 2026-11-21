/**
 * Tolérances du calage. Les salaires (Insee) et les durées de carrière (Drees) servent à ajuster
 * les hypothèses. Les pensions ne sont jamais ciblées : elles sont vérifiées par le backtest
 * (backtest.test.ts), régime par régime.
 */
import { describe, expect, test } from "bun:test";
import { mesurer, mesurerSalaires } from "../../../scripts/calage.ts";
import { HYPOTHESES } from "../src/index.ts";

const mesures = mesurer(HYPOTHESES);
const lit = (nom: string) => {
	const m = mesures.find((x) => x.nom === nom);
	if (!m) throw new Error(`mesure inconnue : ${nom}`);
	return m;
};
const ecart = (nom: string) => lit(nom).modele / lit(nom).cible - 1;

describe("calage sur la génération 1953", () => {
	test("salaires de 2025 : chaque décile à moins de 6 % de l'Insee", () => {
		for (const m of mesurerSalaires(HYPOTHESES))
			expect(Math.abs(m.modele / m.cible - 1)).toBeLessThan(0.06);
	});

	test("durées : chaque tranche à moins de 9 points de la Drees", () => {
		for (const m of mesures.filter((x) => x.nom.endsWith("(%)")))
			expect(Math.abs(m.modele - m.cible)).toBeLessThan(9);
	});

	test("durées moyennes à moins de 2,5 ans de la Drees", () => {
		for (const m of mesures.filter(
			(x) => x.nom.includes("durée") && x.nom.endsWith("(ans)"),
		))
			expect(Math.abs(m.modele - m.cible)).toBeLessThan(2.5);
	});
});
