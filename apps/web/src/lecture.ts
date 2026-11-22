import type { AnneeSysteme } from "@nos-retraites/engine";

/** Comment lire le solde du système : deux conventions indépendantes, choisies sur la page Simuler. */
export interface Lecture {
	/** Les versements d'équilibre de l'État ne comptent pas comme une ressource. */
	horsEtat: boolean;
	/** Ce que rapportent les réserves et ce que coûte la dette entrent dans le solde. */
	interets: boolean;
}

export const LECTURE_OFFICIELLE: Lecture = { horsEtat: false, interets: false };

/** Intérêts de l'année dans la lecture choisie : nuls quand ils ne sont pas comptés. */
export function interetsLus(a: AnneeSysteme, l: Lecture): number {
	if (!l.interets || !a.interets) return 0;
	return l.horsEtat ? a.interets.horsEtat : a.interets.officiel;
}

/** Ressources moins dépenses dans la lecture choisie. */
export function soldeLu(a: AnneeSysteme, l: Lecture): number {
	return (l.horsEtat ? a.soldeHorsEtat : a.solde) + interetsLus(a, l);
}

/** Versements d'équilibre de l'État de l'année, comptés dans les autres ressources en lecture officielle. */
export function versementsEtat(a: AnneeSysteme): number {
	return a.solde - a.soldeHorsEtat;
}
