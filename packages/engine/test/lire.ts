/**
 * Lecture des carrières et des pensions pour la photographie du moteur : le seul fichier de test
 * qui connaît leur forme. Les valeurs sortent dans un ordre fixe, quelle que soit la façon dont
 * le modèle de données les range.
 */
import {
	type AnneeCarriere,
	type Carriere,
	detailFonctionPublique,
	moisParEtat,
	type Pension,
	type ReglesScenario,
} from "../src/index.ts";

export type Regles = ReglesScenario;

const ou = (x: number | undefined, absent = -1) => x ?? absent;

/** Une année de carrière : ce qui s'y passe, et dans quel régime. */
export function valeursAnnee(_c: Carriere, a: AnneeCarriere): number[] {
	return [
		a.annee,
		["emploi", "chomage", "maladieMaternite", "inactivite", "retraite"].indexOf(
			a.etat,
		),
		a.salaireBrut,
		ou(a.moisEmploi),
		ou(a.moisChomage),
		ou(a.moisMaladie),
		ou(a.quotite),
		// Année travaillée dans un régime que le modèle ne simule pas.
		a.affiliation === "autre" && moisParEtat(a).emploi > 0 ? 1 : 0,
		// Primes d'une année de fonctionnaire.
		a.affiliation === "prive" || a.affiliation === "autre" ? -1 : ou(a.primes),
		["prive", "autre", "sre", "cnracl", "militaire", "artisan", "commercant"].indexOf(
			a.affiliation,
		),
		a.alternance ? 1 : 0,
		a.avpf ? 1 : 0,
	];
}

/** Une pension : le départ, puis le détail de chaque régime. */
export function valeursPension(p: Pension): number[] {
	const c = p.parRegime.cnav;
	const a = p.parRegime.agircArrco;
	const f = detailFonctionPublique(p);
	const motifs = [undefined, "carriereLongue", "inaptitude", "invalidite"];
	return [
		p.liquidation.age,
		p.liquidation.annee,
		p.mensuelleBrute,
		// Un fonctionnaire n'a pas de pension du privé : zéro partout, sauf la durée requise et
		// le coefficient de la complémentaire, comme avant que la pension soit rangée par régime.
		ou(c?.salaireAnnuelMoyen, 0),
		ou(c?.trimestresValides, 0),
		ou(c?.trimestresCotises, 0),
		ou(c?.trimestresAutresRegimes, 0),
		ou(c?.trimestresMda, 0),
		c ? c.dureeRequise : p.duree.dureeRequise,
		ou(c?.tauxLiquidation, 0),
		ou(c?.trimestresDecote, 0),
		ou(c?.trimestresSurcote, 0),
		ou(c?.proratisation, 0),
		ou(c?.majorationEnfants, 0),
		c?.minimumContributifApplique ? 1 : 0,
		motifs.indexOf(c?.motif),
		ou(c?.pensionAnnuelle, 0),
		ou(a?.points, 0),
		ou(a?.coefficientAnticipation, 1),
		ou(a?.majorationEnfants, 0),
		ou(a?.pensionAnnuelle, 0),
		f ? 1 : 0,
		ou(f?.traitementDeReference),
		ou(f?.services),
		ou(f?.bonifications),
		ou(f?.trimestresValides),
		ou(f?.dureeRequise),
		ou(f?.tauxLiquidation),
		ou(f?.trimestresDecote),
		ou(f?.trimestresSurcote),
		ou(f?.majorationEnfants),
		f?.minimumGarantiApplique ? 1 : 0,
		motifs.indexOf(f?.motif),
		ou(f?.rafp),
		ou(f?.pensionAnnuelle),
		// Artisans et commerçants.
		ou(p.parRegime.ssi?.pensionAnnuelle),
		ou(p.parRegime.ssi?.proratisation),
		ou(p.parRegime.rci?.points),
		ou(p.parRegime.rci?.pensionAnnuelle),
	];
}
