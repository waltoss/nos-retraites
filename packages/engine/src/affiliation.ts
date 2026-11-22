import type { Baremes } from "./baremes/types.ts";
import type { CompteCarriere } from "./compte.ts";
import type { Decisions } from "./decisions.ts";
import type { ComportementDepart } from "./generateur/hypotheses.ts";
import type { ReglesScenario } from "./regles.ts";
import type {
	AffiliationId,
	AgeTrimestres,
	AnneeCarriere,
	Carriere,
	DetailsParRegime,
	Duree,
	RegimeId,
} from "./types.ts";

export type OptionsLiquidation = {
	regles?: ReglesScenario;
	/** Âge de départ imposé ; sinon l'affiliation le décide. */
	ageLiquidation?: AgeTrimestres;
	/** Motif du départ imposé, quand une autre affiliation en a décidé : l'inaptitude vaut pour tous les régimes. */
	motif?: "carriereLongue" | "inaptitude";
	/** Comportement de départ ; il ne joue que pour les carrières qui portent un profil. */
	comportement?: ComportementDepart;
	decisions: Decisions;
};

/** Ce qu'une affiliation donne au départ : un âge, et une pension par régime. */
export type Liquide = {
	age: AgeTrimestres;
	duree: Duree;
	parRegime: DetailsParRegime;
	/** Total annuel versé par ses régimes, en euros de l'année de référence. */
	annuelle: number;
};

/**
 * Une affiliation : tout ce que le moteur sait du statut sous lequel une année est travaillée.
 * Elle seule connaît ses régimes, leurs barèmes et la façon dont ils se combinent (la décote de la
 * complémentaire suit celle de la base, par exemple). Le moteur ne passe que par ces trois fonctions.
 */
export type Affiliation = {
	id: AffiliationId;
	/** Régimes qui versent une pension au titre de cette affiliation. */
	regimes: readonly RegimeId[];
	/**
	 * Affiliation dont le compte accompagne toujours celui-ci, même sans année travaillée sous elle :
	 * le régime général tient le compte de tout assuré d'un régime aligné.
	 */
	avec?: AffiliationId;
	/**
	 * Droits acquis année par année sur les années de cette affiliation. Les années travaillées
	 * sous une autre ne comptent que pour la durée tous régimes.
	 */
	buildCompte(carriere: Carriere, b: Baremes): CompteCarriere;
	/**
	 * Départ et pensions. Les barèmes portent déjà les règles du scénario (voir `appliquerRegles`).
	 * Avec un âge imposé, l'affiliation ne décide pas : elle calcule ses pensions à cet âge.
	 */
	liquider(
		carriere: Carriere,
		compte: CompteCarriere,
		b: Baremes,
		options: OptionsLiquidation,
	): Liquide;
	/** Cotisations vieillesse d'une année (salarié et employeur), aux taux des barèmes donnés. */
	cotiser(
		annee: AnneeCarriere,
		b: Baremes,
		anneeDuPlafond?: number,
	): { base: number; complementaire: number };
};

/** Un régime : la caisse qui verse une pension, et ce que cette pension devient après le départ. */
export type Regime = {
	id: RegimeId;
	/** Base, complémentaire, ou intégré quand le régime tient lieu des deux (fonction publique). */
	etage: "base" | "complementaire" | "integre";
	/** Régime en points : valeur de service du point une année donnée, base 1 l'année de référence. */
	service?(b: Baremes, annee: number): number;
	/** Ce que le scénario fait aux pensions liquidées avant la réforme (1 : rien). */
	pensionsEnCours?(regles: ReglesScenario): number;
};

/**
 * Le modèle : les affiliations que le moteur sait simuler, les régimes qu'elles font vivre et les
 * décisions des individus. Ajouter un régime, c'est ajouter une entrée ici, sans toucher au moteur.
 */
export type Modele = {
	affiliations: Readonly<Record<string, Affiliation>>;
	/** Dans l'ordre où leurs pensions s'additionnent. */
	regimes: readonly Regime[];
	decisions: Decisions;
	/** Affiliation d'une carrière qui n'a travaillé sous aucune affiliation simulée. */
	parDefaut: AffiliationId;
};
