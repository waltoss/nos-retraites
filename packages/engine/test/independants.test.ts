/**
 * Artisans et commerçants : retraite de base alignée sur le régime général et complémentaire RCI.
 * Les valeurs attendues sont recalculées ici à partir des paramètres lus dans les sources
 * (data/baremes/independants.json).
 */
import { describe, expect, test } from "bun:test";
import {
	type AnneeCarriere,
	BAREME_INDEPENDANTS,
	BAREMES_FRANCE as B,
	type Carriere,
	computePension,
	computePensions,
	cotisationsAnnee,
	detail,
	estIndependant,
	generatePopulation,
	HYPOTHESES,
	HYPOTHESES_INDEPENDANTS,
	SCENARIO_REFERENCE,
	valeur,
} from "../src/index.ts";

const pass = (annee: number) => valeur(B.cnav.pass, annee);

function carriere(
	anneeNaissance: number,
	periodes: { de: number; a: number; affiliation: string; revenu: number }[],
): Carriere {
	const annees: AnneeCarriere[] = [];
	for (const p of periodes)
		for (let age = p.de; age <= p.a; age++)
			annees.push({
				annee: anneeNaissance + age,
				affiliation: p.affiliation,
				etat: "emploi",
				salaireBrut: p.revenu,
			});
	return { anneeNaissance, sexe: "H", enfants: [], cadre: false, annees };
}

describe("points de retraite complémentaire", () => {
	const points = BAREME_INDEPENDANTS.pointsAnnee;

	test("depuis la réforme : 8,1 % jusqu'au plafond, 9,1 % au-delà, sur le prix d'achat de l'année", () => {
		expect(points(2026, 30000, pass(2026), "artisan")).toBeCloseTo(
			(30000 * 0.081) / 21.726,
			6,
		);
		const haut = 100000;
		expect(points(2026, haut, pass(2026), "commercant")).toBeCloseTo(
			(pass(2026) * 0.081 + (haut - pass(2026)) * 0.091) / 21.726,
			6,
		);
	});

	test("de 2013 à 2024 : 7 % jusqu'au plafond du régime, 8 % au-delà", () => {
		expect(points(2020, 30000, pass(2020), "artisan")).toBeCloseTo(
			(30000 * 0.07) / 17.691,
			6,
		);
		// Plafond du régime en 2020 : 38 340 €.
		expect(points(2020, 50000, pass(2020), "artisan")).toBeCloseTo(
			(38340 * 0.07 + (50000 - 38340) * 0.08) / 17.691,
			6,
		);
	});

	test("avant 2013, chaque métier a son régime : les artisans depuis 1979, les commerçants depuis 2004", () => {
		expect(points(1978, 10000, pass(1978), "artisan")).toBe(0);
		expect(points(1990, 10000, pass(1990), "artisan")).toBeGreaterThan(0);
		expect(points(2003, 20000, pass(2003), "commercant")).toBe(0);
		// Commerçants en 2010 : 6,5 % du revenu, point acheté 15,483 €.
		expect(points(2010, 20000, pass(2010), "commercant")).toBeCloseTo(
			(20000 * 0.065) / 15.483,
			6,
		);
		// Artisans en 2010 : 7,2 % sous le plafond, point de 4,692 € repris au coefficient 0,2778.
		expect(points(2010, 20000, pass(2010), "artisan")).toBeCloseTo(
			(20000 * 0.072) / (4.692 / 0.2778),
			4,
		);
	});

	test("abattement quand la retraite de base n'est pas au taux plein", () => {
		const k = BAREME_INDEPENDANTS.coefficientAbattement;
		expect(k(0)).toBe(1);
		expect(k(4)).toBe(0.96);
		expect(k(12)).toBe(0.88);
		expect(k(20)).toBe(0.78);
		expect(k(35)).toBe(0.78);
	});
});

describe("pension d'un indépendant", () => {
	test("la retraite de base se calcule comme celle d'un salarié au même revenu", () => {
		const periodes = [{ de: 22, a: 66, affiliation: "artisan", revenu: 25000 }];
		const artisan = computePension(carriere(1965, periodes), B);
		const salarie = computePension(
			carriere(
				1965,
				periodes.map((p) => ({ ...p, affiliation: "prive" })),
			),
			B,
		);
		expect(artisan.liquidation).toEqual(salarie.liquidation);
		expect(detail(artisan, "ssi").pensionAnnuelle).toBeCloseTo(
			detail(salarie, "cnav").pensionAnnuelle,
			6,
		);
		// Il n'a jamais été salarié : le régime général tient son compte mais ne lui verse rien.
		expect(detail(artisan, "cnav").pensionAnnuelle).toBe(0);
	});

	test("la complémentaire est la somme des points au prix du point", () => {
		const c = carriere(1965, [
			{ de: 22, a: 66, affiliation: "commercant", revenu: 25000 },
		]);
		const p = computePension(c, B);
		const age = p.liquidation.age;
		let attendus = 0;
		for (const a of c.annees) {
			const rang = a.annee - 1965;
			const part =
				rang < Math.floor(age / 4) ? 1 : rang === Math.floor(age / 4) ? (age % 4) / 4 : 0;
			attendus +=
				part *
				BAREME_INDEPENDANTS.pointsAnnee(a.annee, 25000, pass(a.annee), "commercant");
		}
		const rci = detail(p, "rci");
		expect(rci.points).toBeCloseTo(attendus, 6);
		expect(rci.pensionAnnuelle).toBeCloseTo(
			attendus * rci.coefficientAbattement * 1.347,
			6,
		);
		expect(p.mensuelleBrute).toBeCloseTo(
			(detail(p, "ssi").pensionAnnuelle + rci.pensionAnnuelle) / 12,
			6,
		);
	});

	test("trop peu de points : un capital versé une fois, pas de pension", () => {
		const c = carriere(1965, [
			{ de: 22, a: 62, affiliation: "prive", revenu: 30000 },
			{ de: 63, a: 66, affiliation: "artisan", revenu: 2000 },
		]);
		const rci = detail(computePension(c, B), "rci");
		expect(rci.points).toBeGreaterThan(0);
		expect(rci.points).toBeLessThan(40);
		expect(rci.versementUnique).toBe(true);
		expect(rci.pensionAnnuelle).toBe(0);
	});

	test("cotisations : 17,87 % sous le plafond pour la base, 8,1 % pour la complémentaire", () => {
		const annee: AnneeCarriere = {
			annee: 2026,
			affiliation: "artisan",
			etat: "emploi",
			salaireBrut: 30000,
		};
		const c = cotisationsAnnee(annee, B);
		expect(c.base).toBeCloseTo(30000 * (0.1715 + 0.0072), 6);
		expect(c.complementaire).toBeCloseTo(30000 * 0.081, 6);
	});
});

describe("population", () => {
	const scenario = { ...SCENARIO_REFERENCE, taille: 3000 };
	const sans = generatePopulation(
		{
			...scenario,
			hypotheses: {
				...HYPOTHESES,
				independants: { ...HYPOTHESES_INDEPENDANTS, part: { F: 0, H: 0 } },
			},
		},
		B,
	);
	const avec = generatePopulation(scenario, B);
	const avant = computePensions(sans, B);
	const apres = computePensions(avec, B);

	test("simuler les indépendants ne change ni le départ ni la pension du privé de personne", () => {
		let independants = 0;
		avec.forEach((i, k) => {
			const p = apres[k];
			const q = avant[k];
			expect(p?.liquidation).toEqual(q?.liquidation);
			expect(p?.parRegime.cnav).toEqual(q?.parRegime.cnav);
			expect(p?.parRegime.agircArrco).toEqual(q?.parRegime.agircArrco);
			if (i.carriere.annees.some(estIndependant)) {
				independants++;
				expect(p?.mensuelleBrute).toBeGreaterThanOrEqual(q?.mensuelleBrute ?? 0);
			} else expect(p).toEqual(q);
		});
		// Entre 15 et 25 % des individus du privé ont une période d'indépendant.
		expect(independants / avec.length).toBeGreaterThan(0.15);
		expect(independants / avec.length).toBeLessThan(0.25);
	});

	test("les années d'indépendant étaient déjà des années hors du régime général", () => {
		avec.forEach((i, k) => {
			i.carriere.annees.forEach((a, j) => {
				const b = sans[k]?.carriere.annees[j];
				if (estIndependant(a)) expect(b?.affiliation).toBe("autre");
				else expect(a).toEqual(b as AnneeCarriere);
			});
		});
	});
});
