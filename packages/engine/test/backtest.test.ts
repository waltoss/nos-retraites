/**
 * Backtest : le modèle rejoue 2010-2024 avec la loi de chaque génération, et on borne
 * son écart à ce qui a été observé. Rien ici ne sert à régler le modèle, sauf le coefficient
 * de proratisation (réglage de la part de carrière passée dans un autre régime).
 * Les bornes décrivent l'état actuel : les resserrer quand le modèle progresse.
 */
import { describe, expect, test } from "bun:test";
import { BACKTEST } from "../../../scripts/backtest.ts";

const groupe = (debut: string) => {
	const lignes = BACKTEST.filter((l) => l.groupe.startsWith(debut));
	if (lignes.length === 0) throw new Error(`groupe inconnu : ${debut}`);
	return lignes;
};
const relatif = (l: { modele: number; observe: number }) =>
	Math.abs(l.modele / l.observe - 1);

describe("backtest 2010-2024", () => {
	test("âge moyen de départ au régime général à moins de 0,6 an", () => {
		for (const l of groupe("Âge moyen de départ"))
			expect(Math.abs(l.modele - l.observe)).toBeLessThan(0.5);
	});

	test("départs par an à moins de 15 %, effectifs à moins de 8 %", () => {
		for (const l of groupe("Départs à la retraite"))
			expect(relatif(l)).toBeLessThan(0.15);
		for (const l of [...groupe("Cotisants"), ...groupe("Retraités de droit")])
			expect(relatif(l)).toBeLessThan(0.08);
	});

	test("part de carrière au régime général à moins de 0,03", () => {
		for (const l of groupe("Coefficient de proratisation"))
			expect(Math.abs(l.modele - l.observe)).toBeLessThan(0.03);
	});

	// La part qui reste en emploi colle ; le modèle classe en inactivité une partie de ceux
	// que l'évaluation trouve au chômage, ce qui pèse peu sur les comptes des retraites.
	test("réforme de 2010 : part en emploi à moins de 5 points de l'évaluation", () => {
		const emploi = groupe("Réforme de 2010").find((l) => l.nom === "en emploi");
		expect(Math.abs((emploi?.modele ?? 0) - (emploi?.observe ?? 100))).toBeLessThan(5);
	});

	test("situation avant la retraite en 2023 à moins de 10 points de l'enquête Emploi", () => {
		for (const l of groupe("Situation avant la retraite"))
			expect(Math.abs(l.modele - l.observe)).toBeLessThan(10);
	});

	test("part au minimum contributif à moins de 9 points", () => {
		for (const l of groupe("Part des nouveaux retraités au minimum"))
			expect(Math.abs(l.modele - l.observe)).toBeLessThan(9);
	});

	test("pensions par régime : bornes de l'état actuel", () => {
		const pensions = [
			...groupe("Pension moyenne des retraités"),
			...groupe("Pension moyenne des nouveaux"),
		];
		for (const l of pensions) expect(relatif(l)).toBeLessThan(0.22);
		for (const l of pensions.filter((x) => x.nom.startsWith("hommes, régime général")))
			expect(relatif(l)).toBeLessThan(0.09);
	});

	// Critère du projet, pas encore tenu : la pension de base des femmes est trop haute,
	// la complémentaire des hommes trop basse.
	test.failing("critère : toutes les pensions moyennes à ±10 %", () => {
		for (const l of [
			...groupe("Pension moyenne des retraités"),
			...groupe("Pension moyenne des nouveaux"),
		])
			expect(relatif(l)).toBeLessThan(0.1);
	});
});
