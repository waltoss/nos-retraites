import type { Modele } from "./affiliation.ts";
import { affiliationFonctionPublique } from "./affiliations/fonctionPublique.ts";
import { INDEPENDANT } from "./affiliations/independant.ts";
import { PRIVE } from "./affiliations/prive.ts";
import { valeur } from "./baremes/types.ts";
import { DECISIONS } from "./decisions.ts";

/**
 * Le modèle de la France : salariés du privé et fonctionnaires des trois régimes de la fonction
 * publique. Les autres régimes sont dans le bloc résiduel (`systeme.ts`) ; une année qui en relève
 * porte l'affiliation `autre`.
 */
export const MODELE: Modele = {
	affiliations: {
		prive: PRIVE,
		sre: affiliationFonctionPublique("sre"),
		cnracl: affiliationFonctionPublique("cnracl"),
		militaire: affiliationFonctionPublique("militaire"),
		artisan: INDEPENDANT,
		commercant: INDEPENDANT,
	},
	regimes: [
		{ id: "cnav", etage: "base" },
		{
			id: "agircArrco",
			etage: "complementaire",
			service: (b, annee) =>
				b.agircArrco.indiceValeurDeService
					? valeur(b.agircArrco.indiceValeurDeService, annee)
					: 1,
			// La valeur du point vaut pour toutes les pensions complémentaires en cours.
			pensionsEnCours: (regles) => regles.valeurDuPoint ?? 1,
		},
		{ id: "sre", etage: "integre" },
		{ id: "cnracl", etage: "integre" },
		{ id: "militaire", etage: "integre" },
		{ id: "ssi", etage: "base" },
		{ id: "rci", etage: "complementaire" },
	],
	decisions: DECISIONS,
	parDefaut: "prive",
};
