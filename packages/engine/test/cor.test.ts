/**
 * Cas types du COR (rapport annuel de juin 2026, tableau 3.3), génération 1964.
 * On reconstruit la carrière à partir du profil de salaire publié, on calcule la pension,
 * puis le taux de remplacement net avec les conventions du COR.
 * Références et sources : data/references/validation.json et salaires.json.
 */
import { describe, expect, test } from "bun:test";
import salaires from "../../../data/references/salaires.json" with {
	type: "json",
};
import validation from "../../../data/references/validation.json" with {
	type: "json",
};
import {
	type AnneeCarriere,
	BAREMES_FRANCE as B,
	buildCompte,
	type Carriere,
	computePension,
	valeur,
} from "../src/index.ts";

const GENERATION = 1964;
const cor = validation.casTypesCOR.valeurs;
const rm = salaires.remunerationMoyenneParTete;
const corrigee = rm.varianteCorrigeeActivitePartielle
	.anneesOuLaValeurDiffereDeLaFeuilleSMPT_sc0_7 as Record<string, number>;
const serie = rm.rmptEurosCourants_sc0_7 as Record<string, number>;
/** Rémunération moyenne par tête, corrigée de l'activité partielle en 2020 et 2021. */
const rmpt = (annee: number) => corrigee[annee] ?? serie[annee] ?? 0;

const s = salaires.passageBrutNet.tauxSalaries2026_droitEnVigueur.partSalariale;
const p = salaires.passageBrutNet.prelevementsSurPensions2026;

function salaireNet(brut: number, pass: number): number {
	const t1 = Math.min(brut, pass);
	const t2 = Math.max(0, brut - pass);
	const csgCrds =
		(s.csg.taux + s.crds.taux) * (1 - s.abattementAssietteCsgCrds) * brut;
	return (
		brut -
		t1 *
			(s.vieillessePlafonnee.taux +
				s.agircArrcoTranche1.taux +
				s.cegTranche1.taux) -
		t2 * (s.agircArrcoTranche2.taux + s.cegTranche2.taux) -
		brut * s.vieillesseDeplafonnee.taux -
		(t2 > 0 ? brut * s.cet.taux : 0) -
		csgCrds
	);
}

interface Cas {
	profil: Record<string, number>;
	cadre: boolean;
	/** Âge de départ, en années. */
	age: number;
	/** Prélèvements sur la pension selon la convention du COR pour ce cas. */
	prelevements: number;
}

function tauxRemplacementNet(cas: Cas) {
	const annees: AnneeCarriere[] = [];
	for (let age = 17; age < 68; age++) {
		const salaireBrut = (cas.profil[age] ?? 0) * rmpt(GENERATION + age);
		if (salaireBrut > 0)
			annees.push({ annee: GENERATION + age, etat: "emploi", salaireBrut });
	}
	const carriere: Carriere = {
		anneeNaissance: GENERATION,
		sexe: "H",
		enfants: [],
		cadre: cas.cadre,
		annees,
	};
	const pension = computePension(carriere, B, {
		ageLiquidation: cas.age * 4,
		compte: buildCompte(carriere, B),
	});
	// Départ en 2026, année de référence des barèmes : la pension est déjà en euros de 2026.
	const anneeDepart = GENERATION + Math.floor(cas.age);
	const dernier = anneeDepart - 1;
	const brut = (cas.profil[dernier - GENERATION] ?? 0) * rmpt(dernier);
	const denominateur =
		salaireNet(brut, valeur(B.cnav.pass, dernier)) / rmpt(dernier);
	const maladie = p.cotisationMaladieRetraiteComplementaire.taux;
	const cnav =
		(pension.cnav.pensionAnnuelle * (1 - cas.prelevements)) /
		rmpt(anneeDepart) /
		denominateur;
	const complementaire =
		(pension.agircArrco.pensionAnnuelle * (1 - cas.prelevements - maladie)) /
		rmpt(anneeDepart) /
		denominateur;
	return { pension, cnav, complementaire, total: cnav + complementaire };
}

const profils = cor.profilSalaireRelatifRMPTParAge;
const tableau = cor.generation1964_tauxRemplacementSelonAge_tableau3_3;
const series = cor.tauxRemplacementNetALaLiquidationParGeneration;

describe("cas types du COR, génération 1964, à ±2 %", () => {
	test("non-cadre à carrière continue, départ au taux plein à 62 ans", () => {
		const r = tauxRemplacementNet({
			profil: profils.casType2,
			cadre: false,
			age: tableau.casType2.ageTauxPlein.age,
			prelevements: p.tauxMedian.total,
		});
		expect(r.pension.cnav.trimestresDecote).toBe(0);
		const cible = tableau.casType2.ageTauxPlein.tauxRemplacementNet;
		expect(Math.abs(r.total / cible - 1)).toBeLessThan(0.02);
	});

	test("non-cadre à carrière continue, départ à l'âge légal", () => {
		const r = tauxRemplacementNet({
			profil: profils.casType2,
			cadre: false,
			age: tableau.casType2.ageOuvertureDroits.age,
			prelevements: p.tauxMedian.total,
		});
		const cible = tableau.casType2.ageOuvertureDroits.tauxRemplacementNet;
		expect(Math.abs(r.total / cible - 1)).toBeLessThan(0.02);
	});

	test("cadre à carrière continue, départ à l'âge légal", () => {
		const r = tauxRemplacementNet({
			profil: profils.casType1,
			cadre: true,
			age: tableau.casType1.ageOuvertureDroits.age,
			prelevements: p.tauxNormal.total,
		});
		const cible = tableau.casType1.ageOuvertureDroits.tauxRemplacementNet;
		expect(Math.abs(r.total / cible - 1)).toBeLessThan(0.02);
	});

	test("la part du régime général du non-cadre est à moins de 3 %", () => {
		// Le total tombe juste parce que deux écarts se compensent : le régime général est un peu haut,
		// la complémentaire nettement basse. Le COR calcule les points à un taux moyen de 6,61 %,
		// le moteur au taux obligatoire de 6,20 %.
		const r = tauxRemplacementNet({
			profil: profils.casType2,
			cadre: false,
			age: tableau.casType2.ageTauxPlein.age,
			prelevements: p.tauxMedian.total,
		});
		const c = series.casType2_nonCadre;
		const cnav = (c.dontCNAV as Record<string, number>)[GENERATION] ?? 0;
		expect(Math.abs(r.cnav / cnav - 1)).toBeLessThan(0.03);
		expect(r.complementaire).toBeLessThan(r.total - cnav);
	});

	// Carrières interrompues : le moteur s'écarte du COR de +12 % (chômage, cas n° 3) et de -8 %
	// (interruption pour enfant, cas n° 4). Les conventions du COR sur ces périodes ne sont pas publiées.
	test.todo("non-cadre avec chômage (cas n° 3)");
	test.todo("femme avec interruption pour enfant (cas n° 4)");
});
