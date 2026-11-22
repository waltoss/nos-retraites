import type { BaremeGeneration, Baremes } from "./baremes/types.ts";
import {
	type CompteCarriere,
	cumulJusqua,
	trimestresCotisesAvant,
} from "./compte.ts";
import type { ComportementDepart } from "./generateur/hypotheses.ts";
import { trimestresManquants, trimestresMda } from "./regimes/cnav.ts";
import type { AgeTrimestres, Carriere } from "./types.ts";

export type Depart = {
	age: AgeTrimestres;
	motif?: "carriereLongue" | "inaptitude";
};

/** Âge avant la fin duquel il faut avoir cotisé pour la plus tardive des portes de carrière longue. */
const AGE_DEBUT_PRECOCE = 21;

/**
 * Âge de départ. Sans comportement, l'individu part dès qu'il a le taux plein, par la durée
 * ou par l'âge, jamais avant l'âge légal sauf carrière longue. Avec un comportement et un
 * profil, il peut aussi partir pour inaptitude, accepter une décote ou continuer de travailler
 * après le taux plein : chaque penchant du profil est comparé à un seuil du comportement.
 */
export function decideLiquidation(
	carriere: Carriere,
	compte: CompteCarriere,
	g: BaremeGeneration,
	b: Baremes,
	comportement?: ComportementDepart,
	/** Trimestres accordés au titre des enfants à une année de départ donnée ; absent, ceux du régime général. */
	trimestresEnfants: (annee: number) => number = (annee) =>
		trimestresMda(carriere, b.cnav, annee),
): Depart {
	// Carrière longue : départ avant l'âge légal dès que la durée cotisée est atteinte.
	const longue = b.cnav.carriereLongue;
	const debut = longue?.trimestresDebut;
	const reputesA = (age: AgeTrimestres) => {
		const annee = carriere.anneeNaissance + Math.floor(age / 4);
		return (
			cumulJusqua(compte, age).trimestresReputes +
			(longue && annee >= longue.majorationsEnfantsDepuis
				? Math.min(
						longue.plafondsReputes.majorationsEnfants,
						trimestresEnfants(annee),
					)
				: 0)
		);
	};
	if (longue && debut !== undefined && g.carriereLongue) {
		let anticipe = g.ageLegal;
		const reputes = reputesA;
		for (const borne of g.carriereLongue) {
			if (borne.age >= anticipe) continue;
			if (trimestresCotisesAvant(compte, borne.debutAvant) < debut) continue;
			for (let age = borne.age; age < anticipe; age++) {
				if (reputes(age) >= borne.dureeCotisee) {
					anticipe = age;
					break;
				}
			}
		}
		if (anticipe < g.ageLegal)
			return { age: anticipe, motif: "carriereLongue" };
	}
	const manquants = (age: AgeTrimestres) => {
		const cumul = cumulJusqua(compte, age);
		const annee = carriere.anneeNaissance + Math.floor(age / 4);
		return trimestresManquants(
			cumul.trimestresCotises +
				cumul.trimestresAssimiles +
				cumul.trimestresAutresRegimes +
				trimestresEnfants(annee),
			age,
			g,
		);
	};
	const enEmploi = (age: AgeTrimestres) => {
		const a = carriere.annees[Math.floor(age / 4) - compte.ageDebut];
		return (
			a !== undefined &&
			a.etat === "emploi" &&
			(a.salaireBrut > 0 || a.affiliation === "autre")
		);
	};
	const p = comportement ? carriere.profil : undefined;
	const seuilDecote =
		comportement &&
		p !== undefined &&
		p.attachementTravail < comportement.partDecote
			? Math.ceil(p.ampleur * comportement.trimestresDecoteMax)
			: 0;
	if (
		comportement &&
		p !== undefined &&
		manquants(g.ageLegal) > 0 &&
		!enEmploi(g.ageLegal) &&
		p.sante < comportement.partInaptitude
	)
		return { age: g.ageLegal, motif: "inaptitude" };
	let age = g.ageLegal;
	while (age < g.ageTauxPleinAutomatique && manquants(age) > seuilDecote) age++;
	// Qui a commencé tôt et réunit la durée cotisée ne prolonge pas : il part dès le taux plein, que
	// ce soit avant l'âge légal ou à cet âge. Sans cela, la même personne partirait plus tard quand
	// un scénario avance l'âge légal et rend son départ anticipé sans objet.
	const debutPrecoce =
		longue !== undefined &&
		debut !== undefined &&
		trimestresCotisesAvant(compte, AGE_DEBUT_PRECOCE) >= debut;
	if (
		comportement &&
		p !== undefined &&
		!(debutPrecoce && reputesA(age) >= g.dureeRequise) &&
		manquants(age) === 0 &&
		p.attachementTravail > 1 - comportement.partSurcote
	) {
		// Poursuite d'activité : durée tirée d'une loi exponentielle, tant que l'emploi dure.
		const voulus = Math.ceil(
			-Math.log(1 - p.ampleur) * comportement.trimestresSurcote,
		);
		const limite = Math.min(age + voulus, 70 * 4);
		while (age < limite && enEmploi(age)) age++;
	}
	return { age };
}

/**
 * Les décisions du modèle : ce qu'un individu fait quand il a le choix, selon son profil, sa
 * situation et les règles du moment. Une par point de décision ; un modèle peut en remplacer une.
 * Pour l'instant seul le départ est une décision : enfants, interruptions et changements
 * d'affiliation sont encore tirés dans le générateur de carrières.
 */
export type Decisions = {
	depart: typeof decideLiquidation;
};

export const DECISIONS: Decisions = { depart: decideLiquidation };
