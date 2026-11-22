import type {
	Affiliation,
	Liquide,
	OptionsLiquidation,
} from "../affiliation.ts";
import {
	type BaremeIndependants,
	type Baremes,
	valeur,
} from "../baremes/types.ts";
import { type CompteCarriere, cumulJusqua, ouvrirCompte } from "../compte.ts";
import { computeCnav } from "../regimes/cnav.ts";
import { computeRci } from "../regimes/rci.ts";
import {
	type AnneeCarriere,
	type Carriere,
	estIndependant,
	type MetierIndependant,
	moisParEtat,
} from "../types.ts";
import { departAligne, PRIVE } from "./prive.ts";

const ID = "independant";
const MOIS = 12;

function bareme(b: Baremes): BaremeIndependants {
	if (!b.independants) throw new Error("Barème des indépendants absent");
	return b.independants;
}

/**
 * Compte d'un artisan ou commerçant. La durée est celle que le régime général reconnaît à la
 * carrière, année par année : ses années d'indépendant y sont les siennes, tout le reste est la
 * durée des autres régimes. Les deux régimes voient ainsi la même durée d'assurance et décident
 * du même départ. Simplification : une année d'indépendant valide un trimestre par trimestre
 * travaillé, quel que soit le revenu, comme toute année passée hors du régime général.
 */
function buildCompte(carriere: Carriere, b: Baremes): CompteCarriere {
	const ind = bareme(b);
	const general = PRIVE.buildCompte(carriere, b);
	const compte = ouvrirCompte(ID, carriere);
	compte.sansRegimeGeneral = !general.trimestresCotises.some((x) => x > 0);
	for (let i = 0; i < carriere.annees.length; i++) {
		const a = carriere.annees[i] as AnneeCarriere;
		const horsGeneral = general.trimestresAutresRegimes[i] as number;
		const auGeneral = general.trimestresCotises[i] as number;
		const mois = moisParEtat(a).emploi;
		const ici = estIndependant(a) && mois > 0;
		const cotises = ici ? horsGeneral : 0;
		compte.trimestresCotises[i] = cotises;
		compte.trimestresAutresRegimes[i] = auGeneral + horsGeneral - cotises;
		compte.trimestresAssimiles[i] = general.trimestresAssimiles[i] as number;
		compte.trimestresReputes[i] = general.trimestresReputes[i] as number;
		if (!ici || a.salaireBrut <= 0) continue;
		const pass = valeur(b.cnav.pass, a.annee);
		const part = mois / MOIS;
		// Le plafond s'applique au prorata des mois travaillés.
		compte.salairesRevalorises[i] =
			Math.min(a.salaireBrut, pass * part) *
			valeur(b.cnav.coefficientsRevalorisation, a.annee);
		compte.points[i] =
			ind.pointsAnnee(
				a.annee,
				a.salaireBrut / part,
				pass,
				a.affiliation as MetierIndependant,
			) * part;
	}
	return compte;
}

/**
 * Départ et pensions d'un artisan ou commerçant : une retraite de base calculée comme au régime
 * général sur ses seuls revenus d'indépendant, et sa complémentaire.
 * Simplification : c'est la règle d'avant la liquidation unique des régimes alignés (2017),
 * appliquée à toutes les générations ; depuis, une seule pension est calculée sur l'ensemble des
 * salaires et des revenus.
 */
function liquider(
	carriere: Carriere,
	compte: CompteCarriere,
	b: Baremes,
	options: OptionsLiquidation,
): Liquide {
	const ind = bareme(b);
	const { depart, g } = departAligne(carriere, compte, b, options);
	const age = depart.age;
	const cumul = cumulJusqua(compte, age);
	// Périodes assimilées et trimestres pour enfants sont portés par le régime général, quand
	// l'individu y a aussi cotisé : ici, ils ne comptent que pour la durée tous régimes.
	const salarie = !compte.sansRegimeGeneral;
	const ssi = computeCnav(
		carriere,
		compte,
		salarie
			? {
					...cumul,
					trimestresAssimiles: 0,
					trimestresAutresRegimes:
						cumul.trimestresAutresRegimes + cumul.trimestresAssimiles,
				}
			: cumul,
		age,
		g,
		b.cnav,
		!salarie,
	);
	if (depart.motif) ssi.motif = depart.motif;
	const rci = computeRci(cumul.points, ssi.trimestresDecote, ind);
	return {
		age,
		duree: {
			trimestresValides: ssi.trimestresValides,
			dureeRequise: ssi.dureeRequise,
			trimestresDecote: ssi.trimestresDecote,
			trimestresSurcote: ssi.trimestresSurcote,
			minimumApplique: ssi.minimumContributifApplique,
			...(depart.motif ? { motif: depart.motif } : {}),
		},
		parRegime: { ssi, rci },
		annuelle: ssi.pensionAnnuelle + rci.pensionAnnuelle,
	};
}

/** Cotisations d'un artisan ou commerçant sur son revenu, aux taux de l'année de référence. */
function cotiser(
	annee: AnneeCarriere,
	b: Baremes,
	anneeDuPlafond: number = b.anneeReference,
): { base: number; complementaire: number } {
	const c = bareme(b).cotisation;
	const pass = valeur(b.cnav.pass, anneeDuPlafond);
	const revenu = annee.salaireBrut;
	const tranche1 = Math.min(revenu, pass);
	const tranche2 = Math.max(
		0,
		Math.min(revenu, c.plafondTranche2EnPass * pass) - pass,
	);
	return {
		base: tranche1 * c.basePlafonne + revenu * c.baseDeplafonne,
		complementaire:
			tranche1 * c.complementaireTranche1 + tranche2 * c.complementaireTranche2,
	};
}

/**
 * Artisan ou commerçant : retraite de base des indépendants (`ssi`), alignée sur le régime
 * général, et retraite complémentaire des indépendants (`rci`). Un seul module sert les deux
 * affiliations : elles partagent un compte et une liquidation, et ne diffèrent que par les points
 * de leurs régimes complémentaires d'avant 2013.
 */
export const INDEPENDANT: Affiliation = {
	id: ID,
	regimes: ["ssi", "rci"],
	avec: PRIVE.id,
	buildCompte,
	liquider,
	cotiser,
};
