/**
 * Tolérances du calage. Les salaires (Insee) et les durées de carrière (Drees) servent à ajuster
 * les hypothèses ; les pensions (Drees) ne servent qu'à vérifier, elles ne sont jamais ciblées.
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

	test("pensions, hors calage : bornes de l'état actuel", () => {
		expect(Math.abs(ecart("ensemble pension D1"))).toBeLessThan(0.25);
		expect(Math.abs(ecart("ensemble pension médiane"))).toBeLessThan(0.12);
		expect(Math.abs(ecart("ensemble pension D9"))).toBeLessThan(0.18);
	});

	// Critère du projet, pas encore tenu. La cible Drees couvre tous les régimes,
	// le modèle les seuls salariés du privé : une partie de l'écart vient de là.
	test.failing("critère : D1, médiane et D9 à ±10 % de la Drees", () => {
		for (const q of ["D1", "médiane", "D9"])
			expect(Math.abs(ecart(`ensemble pension ${q}`))).toBeLessThan(0.1);
	});
});
