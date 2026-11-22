/**
 * Salariés agricoles : régime aligné, liquidation unique, même complémentaire. Le modèle dit
 * seulement lesquelles des années de salarié relèvent de la MSA ; rien d'autre ne doit bouger.
 */
import { describe, expect, test } from "bun:test";
import {
	BAREMES_FRANCE as B,
	computePensions,
	cotisationsAnnee,
	generatePopulation,
	HYPOTHESES,
	HYPOTHESES_SALARIES_AGRICOLES,
	partSalariesAgricoles,
	SCENARIO_REFERENCE,
} from "../src/index.ts";

const scenario = { ...SCENARIO_REFERENCE, taille: 3000 };
const sans = generatePopulation(
	{
		...scenario,
		hypotheses: {
			...HYPOTHESES,
			salariesAgricoles: {
				...HYPOTHESES_SALARIES_AGRICOLES,
				part: { F: 0, H: 0 },
			},
		},
	},
	B,
);
const avec = generatePopulation(scenario, B);

describe("salariés agricoles", () => {
	test("seule l'étiquette des années change : salaires, états et enfants sont les mêmes", () => {
		let agricoles = 0;
		avec.forEach((i, k) => {
			const autre = sans[k]?.carriere;
			expect(i.carriere.enfants).toEqual(autre?.enfants ?? []);
			i.carriere.annees.forEach((a, j) => {
				const b = autre?.annees[j];
				if (a.affiliation === "salarieAgricole") {
					agricoles++;
					expect(b?.affiliation).toBe("prive");
					expect({ ...a, affiliation: "prive" }).toEqual(b as typeof a);
				} else expect(a).toEqual(b as typeof a);
			});
		});
		expect(agricoles).toBeGreaterThan(0);
	});

	test("aucune pension ne bouge, dans le droit en vigueur comme dans un scénario", () => {
		let principale = 0;
		for (const regles of [{}, { ageLegal: 260, valeurDuPoint: 0.95 }]) {
			const avant = computePensions(sans, B, regles);
			computePensions(avec, B, regles).forEach((p, k) => {
				// Seule l'affiliation principale peut changer de nom, pour qui a surtout travaillé dans l'agriculture.
				const agricole = p.affiliation === "salarieAgricole";
				if (agricole) principale++;
				expect(agricole ? { ...p, affiliation: "prive" } : p).toEqual(
					avant[k] as typeof p,
				);
			});
		}
		expect(principale).toBeGreaterThan(0);
	});

	test("mêmes cotisations qu'un salarié du régime général", () => {
		const annee = { annee: 2026, etat: "emploi", salaireBrut: 30000 } as const;
		expect(
			cotisationsAnnee({ ...annee, affiliation: "salarieAgricole" }, B),
		).toEqual(cotisationsAnnee({ ...annee, affiliation: "prive" }, B));
	});

	test("la part recule des générations anciennes aux récentes", () => {
		const h = HYPOTHESES_SALARIES_AGRICOLES;
		expect(partSalariesAgricoles(h, "H", 1940)).toBe(h.part.H);
		expect(partSalariesAgricoles(h, "H", 1990)).toBeCloseTo(
			h.part.H * h.recul.rapport,
			12,
		);
		expect(partSalariesAgricoles(h, "F", 1960)).toBeLessThan(h.part.F);
	});
});
