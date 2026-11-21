import { type Baremes, valeur } from "../baremes/types.ts";
import type { Rng } from "../rng.ts";
import type { AnneeCarriere, Carriere, Etat, Sexe } from "../types.ts";
import type { Hypotheses } from "./hypotheses.ts";

const AGE_FIN = 70;

function interpole(
	points: ReadonlyArray<readonly [number, number]>,
	x: number,
): number {
	const premier = points[0];
	const dernier = points[points.length - 1];
	if (!premier || !dernier) return 0;
	if (x <= premier[0]) return premier[1];
	for (let i = 1; i < points.length; i++) {
		const a = points[i - 1] as readonly [number, number];
		const b = points[i] as readonly [number, number];
		if (x <= b[0]) return a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0]);
	}
	return dernier[1];
}

function tire(repartition: ReadonlyArray<number>, u: number): number {
	let cumul = 0;
	for (let i = 0; i < repartition.length; i++) {
		cumul += repartition[i] as number;
		if (u < cumul) return i;
	}
	return repartition.length - 1;
}

/**
 * Génère la carrière d'un individu, année par année, par transitions entre états.
 * Tous les tirages viennent du générateur fourni : même graine, même carrière.
 */
export function generateCarriere(
	anneeNaissance: number,
	rng: Rng,
	h: Hypotheses,
	b: Baremes,
): Carriere {
	const sexe: Sexe = rng.next() < h.partFemmes ? "F" : "H";
	const rang = rng.normal();
	const ageEntree = Math.round(
		Math.min(
			h.ageEntree.max,
			Math.max(
				h.ageEntree.min,
				h.ageEntree.moyenne + h.ageEntree.effetRang * rang + h.ageEntree.ecartType * rng.normal(),
			),
		),
	);

	const nbEnfants = tire(h.repartitionEnfants, rng.next());
	const enfants: number[] = [];
	let ageNaissance = Math.max(
		17,
		Math.round(h.agePremierEnfant.moyenne + h.agePremierEnfant.ecartType * rng.normal() + rang),
	);
	for (let i = 0; i < nbEnfants; i++) {
		enfants.push(anneeNaissance + ageNaissance + (sexe === "H" ? 2 : 0));
		ageNaissance += Math.max(1, Math.round(h.ecartEntreEnfants + rng.normal()));
	}
	const tempsPartiel = sexe === "F" && nbEnfants > 0 && rng.next() < h.tempsPartielMeres.part;

	// Le risque de sortie de l'emploi décroît avec le rang de salaire.
	const risque = h.risqueRang ** -rang;
	const annees: AnneeCarriere[] = [];
	let etat: Etat = "emploi";
	let interruptionFamiliale = false;

	for (let age = ageEntree; age < AGE_FIN; age++) {
		const annee = anneeNaissance + age;
		const u = rng.next();
		const choc = rng.normal();
		const senior = age >= h.seniors.age;
		const sorties = senior ? h.seniors.multiplicateurSorties : 1;
		const retours = senior ? 1 / h.seniors.diviseurRetours : 1;
		const naissance = sexe === "F" && enfants.includes(annee);

		if (age > ageEntree) {
			if (etat === "emploi") {
				const pChomage = Math.min(0.5, h.depuisEmploi.chomage * risque * sorties);
				const pMaladie = h.depuisEmploi.maladie * sorties;
				const pInactivite = h.depuisEmploi.inactivite * sorties;
				if (u < pChomage) etat = "chomage";
				else if (u < pChomage + pMaladie) etat = "maladieMaternite";
				else if (u < pChomage + pMaladie + pInactivite) etat = "inactivite";
			} else if (etat === "chomage") {
				const pEmploi = h.depuisChomage.emploi * retours;
				if (u < pEmploi) etat = "emploi";
				else if (u < pEmploi + h.depuisChomage.inactivite) etat = "inactivite";
			} else if (etat === "maladieMaternite") {
				const pEmploi = h.depuisMaladie.emploi * retours;
				if (u < pEmploi) etat = "emploi";
				else if (u < pEmploi + h.depuisMaladie.inactivite) etat = "inactivite";
			} else if (etat === "inactivite") {
				const p = interruptionFamiliale
					? h.interruptionNaissance.retourAnnuel
					: h.depuisInactivite.emploi * retours;
				if (u < p) {
					etat = "emploi";
					interruptionFamiliale = false;
				}
			}
		}
		// Une naissance : congé maternité l'année même, puis interruption possible.
		if (naissance) {
			if (rng.next() < h.interruptionNaissance.probabilite * Math.min(2, risque)) {
				etat = "inactivite";
				interruptionFamiliale = true;
			} else if (etat === "emploi") {
				etat = "maladieMaternite";
			}
		} else if (etat === "maladieMaternite" && sexe === "F" && enfants.includes(annee - 1)) {
			etat = "emploi";
		}

		let salaireBrut = 0;
		if (etat === "emploi") {
			const jeuneEnfant = enfants.some((n) => annee >= n && annee - n < 12);
			const quotite = tempsPartiel && jeuneEnfant ? h.tempsPartielMeres.quotite : 1;
			const niveau =
				interpole(h.profilSalaire, age) *
				Math.exp(
					h.sigmaPermanent * rang +
						h.penteRang * rang * (Math.min(age, 55) - 30) +
						h.sigmaTransitoire * choc,
				) *
				(sexe === "F" ? h.ecartSalaireFemmes : 1);
			const smicAnnuel = valeur(b.cnav.smicHoraire, annee) * h.heuresAnnuelles;
			salaireBrut =
				Math.max(niveau * valeur(b.cnav.pass, annee), smicAnnuel) * quotite;
		}
		annees.push({ annee, etat, salaireBrut });
	}

	return { anneeNaissance, sexe, enfants, cadre: rang > h.seuilCadre, annees };
}
