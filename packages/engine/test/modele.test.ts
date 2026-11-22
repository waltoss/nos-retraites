/**
 * Ce que le modèle par affiliation rend possible, et que l'ancien ne savait pas faire :
 * une carrière qui change de régime, un régime ajouté sans toucher au moteur, une décision
 * remplacée, des règles propres à un régime ou à des générations.
 * Que les résultats d'avant n'aient pas bougé, c'est `photographie.test.ts` qui le dit.
 */
import { describe, expect, test } from "bun:test";
import {
	type Affiliation,
	type AnneeCarriere,
	BAREMES_FRANCE as B,
	buildCompte,
	type Carriere,
	CHAMP_PRIVE,
	computePension,
	computePensions,
	cumulJusqua,
	detail,
	generatePopulation,
	generatePopulationPublique,
	MODELE,
	type Modele,
	moisParEtat,
	ouvrirCompte,
	PYRAMIDES_PROJETEES,
	prepareProjection,
	projeter,
	reglesGeneration,
	SCENARIO_PUBLIC,
	SCENARIO_REFERENCE,
} from "../src/index.ts";

/** Carrière continue : une suite de périodes, chacune sous une affiliation. */
function carriere(
	anneeNaissance: number,
	periodes: { de: number; a: number; affiliation: string; salaire: number }[],
): Carriere {
	const annees: AnneeCarriere[] = [];
	for (const p of periodes)
		for (let age = p.de; age <= p.a; age++)
			annees.push({
				annee: anneeNaissance + age,
				affiliation: p.affiliation,
				etat: "emploi",
				salaireBrut: p.salaire,
			});
	return { anneeNaissance, sexe: "H", enfants: [], cadre: false, annees };
}

describe("carrière qui change de régime", () => {
	const periodes = [
		{ de: 22, a: 46, affiliation: "prive", salaire: 30000 },
		{ de: 47, a: 66, affiliation: "sre", salaire: 30000 },
	];
	const mixte: Carriere = {
		...carriere(1965, periodes),
		fonctionPublique: { regime: "sre", categorie: "sedentaire" },
	};
	// La même vie, vue par l'ancien modèle : les années de fonctionnaire sont « un autre régime ».
	const tronquee = carriere(
		1965,
		periodes.map((p) => ({
			...p,
			affiliation: p.affiliation === "sre" ? "autre" : p.affiliation,
		})),
	);
	const p = computePension(mixte, B);
	const q = computePension(tronquee, B);

	test("chaque régime verse sa pension", () => {
		expect(Object.keys(p.parRegime).sort()).toEqual([
			"agircArrco",
			"cnav",
			"sre",
		]);
		expect(detail(p, "cnav").pensionAnnuelle).toBeGreaterThan(0);
		expect(detail(p, "agircArrco").pensionAnnuelle).toBeGreaterThan(0);
		expect(detail(p, "sre").pensionAnnuelle).toBeGreaterThan(0);
	});

	test("l'affiliation où l'on a le plus travaillé décide du départ", () => {
		expect(p.affiliation).toBe("prive");
		expect(p.liquidation).toEqual(q.liquidation);
	});

	test("la pension du privé est la même, celle de la fonction publique s'y ajoute", () => {
		expect(p.parRegime.cnav).toEqual(q.parRegime.cnav);
		expect(p.parRegime.agircArrco).toEqual(q.parRegime.agircArrco);
		const sre = detail(p, "sre");
		expect(p.mensuelleBrute).toBeCloseTo(
			q.mensuelleBrute + (sre.pensionAnnuelle + sre.rafp) / 12,
			6,
		);
	});

	test("chaque régime compte la durée passée dans l'autre", () => {
		const sre = detail(p, "sre");
		// 25 années dans le privé : 100 trimestres que la fonction publique compte dans la durée d'assurance.
		expect(sre.trimestresValides).toBe(sre.services + 100);
		expect(detail(p, "cnav").trimestresAutresRegimes).toBe(sre.services);
	});
});

/** Un régime en points inventé, pour le test : il n'existe nulle part dans le moteur. */
const CAISSE = "caisseLiberale";
const TAUX = 0.1;
const PRIX_DU_POINT = 20;
const VALEUR_DU_POINT = 1.2;
const LIBERAL: Affiliation = {
	id: "liberal",
	regimes: [CAISSE],
	buildCompte(c) {
		const compte = ouvrirCompte("liberal", c);
		c.annees.forEach((a, i) => {
			if (moisParEtat(a).emploi === 0) return;
			if (a.affiliation !== "liberal") {
				compte.trimestresAutresRegimes[i] = 4;
				return;
			}
			compte.trimestresCotises[i] = 4;
			compte.trimestresReputes[i] = 4;
			compte.points[i] = (a.salaireBrut * TAUX) / PRIX_DU_POINT;
		});
		return compte;
	},
	liquider(_c, compte, _b, options) {
		const age = options.ageLiquidation ?? 65 * 4;
		const cumul = cumulJusqua(compte, age);
		const pensionAnnuelle = cumul.points * VALEUR_DU_POINT;
		return {
			age,
			duree: {
				trimestresValides:
					cumul.trimestresCotises + cumul.trimestresAutresRegimes,
				dureeRequise: 172,
				trimestresDecote: 0,
				trimestresSurcote: 0,
				minimumApplique: false,
			},
			parRegime: { [CAISSE]: { pensionAnnuelle } },
			annuelle: pensionAnnuelle,
		};
	},
	cotiser: (a) => ({ base: 0, complementaire: a.salaireBrut * TAUX }),
};
const ETENDU: Modele = {
	...MODELE,
	affiliations: { ...MODELE.affiliations, liberal: LIBERAL },
	regimes: [...MODELE.regimes, { id: CAISSE, etage: "complementaire" }],
};

describe("régime ajouté sans toucher au moteur", () => {
	const c = carriere(1970, [
		{ de: 22, a: 46, affiliation: "prive", salaire: 30000 },
		{ de: 47, a: 66, affiliation: "liberal", salaire: 60000 },
	]);
	const sans = computePension(c, B);
	const avec = computePension(c, B, { modele: ETENDU });

	test("sans lui, ses années ne comptent que pour la durée", () => {
		expect(Object.keys(sans.parRegime).sort()).toEqual(["agircArrco", "cnav"]);
		expect(detail(sans, "cnav").trimestresAutresRegimes).toBeGreaterThan(0);
	});

	test("avec lui, la même carrière touche une pension de plus", () => {
		expect(avec.liquidation).toEqual(sans.liquidation);
		expect(avec.parRegime.cnav).toEqual(sans.parRegime.cnav);
		const age = avec.liquidation.age;
		const annees = Math.floor(age / 4) - 47 + (age % 4) / 4;
		const attendue =
			((annees * 60000 * TAUX) / PRIX_DU_POINT) * VALEUR_DU_POINT;
		expect(avec.parRegime[CAISSE]?.pensionAnnuelle).toBeCloseTo(attendue, 6);
		expect(avec.mensuelleBrute).toBeCloseTo(
			sans.mensuelleBrute + attendue / 12,
			6,
		);
	});

	test("la projection verse ses pensions et encaisse ses cotisations", () => {
		const base = generatePopulation(
			{ ...SCENARIO_REFERENCE, taille: 1500 },
			B,
		);
		// Un individu sur trois devient libéral à 45 ans.
		const population = base.map((i) =>
			i.id % 3 === 0
				? {
						...i,
						carriere: {
							...i.carriere,
							annees: i.carriere.annees.map((a) =>
								a.affiliation === "prive" &&
								a.annee - i.carriere.anneeNaissance >= 45
									? { ...a, affiliation: "liberal" }
									: a,
							),
						},
					}
				: i,
		);
		const options = {
			debut: 2026,
			fin: 2060,
			pyramides: PYRAMIDES_PROJETEES,
			champ: CHAMP_PRIVE,
			anneeEffet: 2028,
		};
		const projeterAvec = (modele: Modele) =>
			projeter(prepareProjection(population, B, {}, { ...options, modele }));
		const sansCaisse = projeterAvec(MODELE);
		const avecCaisse = projeterAvec(ETENDU);
		const derniere = (p: typeof sansCaisse) =>
			p.annees.at(-1) as (typeof p.annees)[number];
		// Le champ reste celui des salariés du privé : le nouveau régime est compté à part.
		for (const cle of ["pensions", "cotisations", "cotisants"] as const)
			expect(derniere(avecCaisse).autres[cle]).toBeGreaterThan(
				derniere(sansCaisse).autres[cle],
			);
	});

	test("un régime qui verse sans être déclaré est refusé", () => {
		const oublie: Modele = { ...ETENDU, regimes: MODELE.regimes };
		expect(() =>
			prepareProjection([], B, {}, {
				debut: 2026,
				fin: 2030,
				pyramides: PYRAMIDES_PROJETEES,
				champ: CHAMP_PRIVE,
				anneeEffet: 2028,
				modele: oublie,
			}),
		).toThrow("caisseLiberale");
	});
});

describe("décisions et profils", () => {
	const population = generatePopulation(
		{ ...SCENARIO_REFERENCE, taille: 600, generations: [1960, 1990] },
		B,
	);

	test("une décision se remplace sans toucher au moteur", () => {
		// Tout le monde attend l'âge du taux plein automatique.
		const patient: Modele = {
			...MODELE,
			decisions: {
				depart: (_c, _compte, g) => ({ age: g.ageTauxPleinAutomatique }),
			},
		};
		const pensions = computePensions(population, B, {}, undefined, patient);
		population.forEach((i, k) => {
			expect(pensions[k]?.liquidation.age).toBe(
				reglesGeneration(i.carriere.anneeNaissance, B).ageTauxPleinAutomatique,
			);
		});
	});

	test("le profil d'un individu ne dépend pas du scénario", () => {
		const autre = generatePopulation(
			{
				...SCENARIO_REFERENCE,
				taille: 600,
				generations: [1960, 1990],
				facteurs: { chomage: 2 },
			},
			B,
		);
		population.forEach((i, k) => {
			expect(autre[k]?.carriere.profil).toEqual(i.carriere.profil);
		});
	});
});

describe("règles propres à un régime ou à des générations", () => {
	const prive = generatePopulation(
		{ ...SCENARIO_REFERENCE, taille: 600, generations: [1965, 1995] },
		B,
	);
	const publique = generatePopulationPublique(B, undefined, {
		...SCENARIO_PUBLIC,
		taille: 600,
		generations: [1965, 1995],
	});

	test("un âge légal relevé pour les seuls fonctionnaires de l'État", () => {
		const regles = { parAffiliation: { sre: { ageLegal: 264 } } };
		expect(computePensions(prive, B, regles)).toEqual(
			computePensions(prive, B, {}),
		);
		const avant = computePensions(publique, B, {});
		const apres = computePensions(publique, B, regles);
		let retardes = 0;
		let avances = 0;
		publique.forEach((i, k) => {
			const a = avant[k]?.liquidation.age ?? 0;
			const b = apres[k]?.liquidation.age ?? 0;
			if (buildCompte(i.carriere, B).affiliation !== "sre")
				expect(apres[k]).toEqual(avant[k]);
			else if (b > a) retardes++;
			else if (b < a) avances++;
		});
		// Quelques-uns partent plus tôt : une invalidité ou une carrière longue leur ouvre la pension
		// avant le nouvel âge légal, sans la poursuite d'activité qu'ils choisissaient avant.
		expect(avances).toBeLessThan(retardes / 10);
		expect(retardes).toBeGreaterThan(50);
	});

	test("une valeur du point réduite pour les seules générations nées depuis 1980", () => {
		const reference = computePensions(prive, B, {});
		const partout = computePensions(prive, B, { valeurDuPoint: 0.9 });
		const jeunes = computePensions(prive, B, {
			parGeneration: [{ de: 1980, regles: { valeurDuPoint: 0.9 } }],
		});
		prive.forEach((i, k) => {
			expect(jeunes[k]).toEqual(
				i.carriere.anneeNaissance >= 1980 ? partout[k] : reference[k],
			);
		});
	});
});
