/**
 * Une seule population : un fonctionnaire passé par le privé est une personne, avec ses pensions
 * de fonctionnaire et du privé, et personne n'est compté deux fois.
 */
import { describe, expect, test } from "bun:test";
import {
	type AnneeCarriere,
	BAREMES_FRANCE as B,
	buildComptes,
	type Carriere,
	CHAMP_PRIVE,
	CHAMP_PUBLIC,
	computePension,
	computePensions,
	departDuChamp,
	detail,
	generatePopulation,
	generatePopulationEntiere,
	generatePopulationPublique,
	type OptionsProjection,
	PYRAMIDE_FRANCE,
	PYRAMIDES_PROJETEES,
	pensionVersee,
	prepareProjection,
	projeter,
	rechamper,
	SCENARIO_PUBLIC,
	SCENARIO_REFERENCE,
	SURVIE_SELON_PENSION,
	valeur,
} from "../src/index.ts";

/** Quelques années de salarié ou hors du modèle, puis un poste de fonctionnaire jusqu'à un âge donné. */
function carriere(
	options: {
		avant?: "prive" | "autre";
		regime?: "sre" | "militaire";
		fin?: number;
		sexe?: "F" | "H";
		enfants?: number[];
	} = {},
): Carriere {
	const naissance = 1962;
	const regime = options.regime ?? "sre";
	const fin = options.fin ?? 70;
	const annees: AnneeCarriere[] = [];
	for (let age = 20; age < 70; age++) {
		const annee = naissance + age;
		if (age < 28)
			annees.push({
				annee,
				affiliation: options.avant ?? "prive",
				etat: "emploi",
				salaireBrut:
					options.avant === "autre" ? 0 : 0.8 * valeur(B.cnav.pass, annee),
			});
		else if (age < fin)
			annees.push({
				annee,
				affiliation: regime,
				etat: "emploi",
				salaireBrut: 30000,
				primes: 0,
			});
		else
			annees.push({
				annee,
				affiliation: regime,
				etat: "inactivite",
				salaireBrut: 0,
				moisEmploi: 0,
				moisChomage: 0,
				moisMaladie: 0,
			});
	}
	return {
		anneeNaissance: naissance,
		sexe: options.sexe ?? "H",
		enfants: options.enfants ?? [],
		cadre: false,
		annees,
		fonctionPublique:
			regime === "militaire"
				? { regime, categorie: "sedentaire", ageRadiation: fin }
				: { regime, categorie: "sedentaire" },
	};
}

describe("fonctionnaire passé par le privé", () => {
	test("ses années de salarié lui valent une pension du privé, sans toucher à celle de fonctionnaire", () => {
		const avec = computePension(carriere(), B);
		const sans = computePension(carriere({ avant: "autre" }), B);
		expect(avec.liquidation).toEqual(sans.liquidation);
		expect(avec.parRegime.sre).toEqual(sans.parRegime.sre);
		expect(sans.parRegime.cnav).toBeUndefined();
		const cnav = detail(avec, "cnav");
		const complementaire = detail(avec, "agircArrco");
		expect(cnav.pensionAnnuelle).toBeGreaterThan(0);
		expect(complementaire.points).toBeGreaterThan(0);
		// Huit ans au régime général sur une carrière complète tous régimes.
		expect(cnav.trimestresCotises).toBe(32);
		expect(cnav.trimestresAutresRegimes).toBeGreaterThan(120);
		expect(avec.mensuelleBrute).toBeCloseTo(
			sans.mensuelleBrute +
				(cnav.pensionAnnuelle + complementaire.pensionAnnuelle) / 12,
			6,
		);
	});

	test("les trimestres pour enfants sont ceux de la fonction publique, pas du régime général", () => {
		const mere = computePension(
			carriere({ sexe: "F", enfants: [1990, 1993] }),
			B,
		);
		const sansEnfant = computePension(carriere({ sexe: "F" }), B);
		const cnav = detail(mere, "cnav");
		expect(cnav.trimestresMda).toBe(16);
		// Comptés dans la durée tous régimes, pas dans la part de carrière au régime général.
		expect(cnav.proratisation).toBe(detail(sansEnfant, "cnav").proratisation);
	});

	test("parti avant l'âge légal du privé, il attend cet âge pour sa pension du privé", () => {
		const c = carriere({ regime: "militaire", fin: 46 });
		const p = computePension(c, B);
		expect(p.liquidation.age).toBe(46 * 4);
		const cnav = detail(p, "cnav");
		expect(cnav.liquidation?.age).toBeGreaterThanOrEqual(62 * 4);
		expect(detail(p, "agircArrco").liquidation).toEqual(cnav.liquidation);
		expect(departDuChamp(CHAMP_PRIVE, p)).toEqual(cnav.liquidation);
		expect(departDuChamp(CHAMP_PUBLIC, p)).toEqual(p.liquidation);

		const population = [{ id: 0, poids: 1, carriere: c }];
		const options: OptionsProjection = {
			debut: 2026,
			fin: 2030,
			pyramides: PYRAMIDES_PROJETEES,
			champ: CHAMP_PRIVE,
			anneeEffet: 2028,
		};
		const prive = prepareProjection(population, B, {}, options);
		const depuis = cnav.liquidation?.annee ?? 0;
		// Dans le privé, il n'est retraité qu'à partir de cette date ; dans son régime, dès son départ.
		expect(pensionVersee(prive, 0, depuis - 1)).toBeNull();
		// À la valeur du point de cette année-là près.
		expect(
			(pensionVersee(prive, 0, depuis) ?? 0) /
				(cnav.pensionAnnuelle + detail(p, "agircArrco").pensionAnnuelle),
		).toBeCloseTo(1, 2);
		const militaire = rechamper(prive, CHAMP_PUBLIC);
		expect(pensionVersee(militaire, 0, 2010)).toBeGreaterThan(0);
	});
});

describe("population entière", () => {
	const scenario = { ...SCENARIO_REFERENCE, taille: 6000 };
	const publique = generatePopulationPublique(B, undefined, {
		...SCENARIO_PUBLIC,
		taille: 3000,
	});
	const prive = generatePopulation(scenario, B);
	const entiere = generatePopulationEntiere(scenario, B, publique);
	const options = (population: typeof entiere): OptionsProjection => ({
		debut: 2026,
		fin: 2060,
		pyramides: PYRAMIDES_PROJETEES,
		champ: CHAMP_PRIVE,
		survie: SURVIE_SELON_PENSION,
		anneeEffet: 2028,
		comptes: buildComptes(population, B),
	});
	const preparer = (population: typeof entiere) =>
		prepareProjection(population, B, {}, options(population));
	const tout = preparer(entiere);

	test("les salariés puis les fonctionnaires, chacun avec son poids", () => {
		expect(entiere.length).toBe(prive.length + publique.length);
		entiere.forEach((i, k) => {
			expect(i.id).toBe(k);
			expect(i.carriere.fonctionPublique !== undefined).toBe(k >= prive.length);
		});
		prive.forEach((i, k) => {
			expect(entiere[k]?.poids).toBeCloseTo(i.poids, 6);
		});
		// Personne ne représente plus de monde qu'il n'en existe.
		const total = entiere.reduce((t, i) => t + i.poids, 0);
		const reels = [...PYRAMIDE_FRANCE.femmes, ...PYRAMIDE_FRANCE.hommes].reduce(
			(t, x) => t + x,
			0,
		);
		expect(total).toBeLessThan(reels);
	});

	test("le privé de la population entière : celui des salariés plus celui des fonctionnaires", () => {
		const ensemble = projeter(tout).annees;
		const salaries = projeter(preparer(prive)).annees;
		const fonctionnaires = projeter(
			preparer(entiere.slice(prive.length)),
		).annees;
		for (const k of [0, 10, 34]) {
			const a = ensemble[k];
			const s = salaries[k];
			const f = fonctionnaires[k];
			if (!a || !s || !f) throw new Error("année absente");
			expect(f.cotisants).toBeGreaterThan(0);
			expect(f.pensions).toBeGreaterThan(0);
			for (const cle of ["cotisants", "cotisations", "retraites", "pensions"] as const)
				expect(a[cle] / (s[cle] + f[cle])).toBeCloseTo(1, 9);
			// Les pensions et cotisations de fonctionnaire ont leur propre champ : elles ne sont pas ici.
			expect(a.autres.pensions / s.autres.pensions).toBeCloseTo(1, 9);
		}
	});

	test("regardée dans le champ des fonctionnaires, elle donne leurs seules pensions de fonctionnaire", () => {
		const vus = projeter(rechamper(tout, CHAMP_PUBLIC)).annees;
		const seuls = projeter(
			prepareProjection(entiere.slice(prive.length), B, {}, {
				...options(entiere.slice(prive.length)),
				champ: CHAMP_PUBLIC,
			}),
		).annees;
		for (const k of [0, 10, 34]) {
			expect((vus[k]?.pensions ?? 0) / (seuls[k]?.pensions ?? 1)).toBeCloseTo(1, 9);
			expect((vus[k]?.retraites ?? 0) / (seuls[k]?.retraites ?? 1)).toBeCloseTo(1, 9);
			expect((vus[k]?.cotisants ?? 0) / (seuls[k]?.cotisants ?? 1)).toBeCloseTo(1, 9);
		}
		// Un fonctionnaire jamais salarié n'est ni cotisant ni retraité du privé.
		const pensions = computePensions(entiere, B, {}, tout.comptes);
		const jamais = pensions.findIndex(
			(p, k) => k >= prive.length && p.parRegime.cnav === undefined,
		);
		expect(jamais).toBeGreaterThan(0);
		expect(tout.releve[jamais]).toBe(0);
		expect(rechamper(tout, CHAMP_PUBLIC).releve[jamais]).toBe(1);
	});
});
