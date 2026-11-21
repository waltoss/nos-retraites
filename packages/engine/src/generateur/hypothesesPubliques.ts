import type {
	CategorieFonctionnaire,
	RegimeFonctionPublique,
} from "../types.ts";
import type { ComportementDepart } from "./hypotheses.ts";
import donnees from "./hypothesesPubliques.data.json" with { type: "json" };

type Points = ReadonlyArray<readonly [x: number, y: number]>;
type ParRegime<T> = Record<RegimeFonctionPublique, T>;

/**
 * Hypothèses du générateur de carrières de fonctionnaires : paramètres libres du modèle,
 * réglés à la main sur les statistiques publiées des deux régimes, et non des paramètres légaux.
 */
export interface HypothesesPubliques {
	/** Part des individus simulés dans chaque régime ; la pondération rétablit les effectifs réels. */
	partRegime: ParRegime<number>;
	partFemmes: ParRegime<number>;
	/** Âge du premier emploi, avant l'entrée dans la fonction publique. */
	debutVieActive: ParRegime<{
		moyenne: number;
		ecartType: number;
		min: number;
	}>;
	/** Âge d'entrée dans la fonction publique : un âge minimal plus un délai de loi exponentielle. */
	entree: ParRegime<{ min: number; delaiMoyen: number; max: number }>;
	/** Part des années d'avant l'entrée qui valident quatre trimestres dans un autre régime. */
	partValideeAvantEntree: number;
	traitement: {
		anneeDeNiveau: number;
		/** Traitement annuel d'un agent médian au sommet du profil, l'année de niveau. */
		niveau: ParRegime<number>;
		/** Dispersion du niveau permanent (écart-type du logarithme). */
		sigma: ParRegime<number>;
		/** Traitement selon l'âge, en part du sommet. */
		profil: ParRegime<Points>;
		/**
		 * Le traitement suit l'ancienneté autant que l'âge : celui qui entre après l'âge de référence
		 * est placé sur le profil plus bas que son âge, de cette part des années de retard.
		 */
		partAnciennete: ParRegime<number>;
		ageEntreeDeReference: number;
		/** Traitement des femmes rapporté à celui des hommes, selon la génération : il tient aussi lieu du temps partiel. */
		ecartFemmes: ParRegime<Points>;
		/**
		 * Hausse annuelle du traitement à âge et rang égaux, en plus de la valeur du point :
		 * les grilles sont relevées et les qualifications montent.
		 */
		glissementDesGrilles: number;
	};
	/** Enseignants de l'État : part, et niveau de traitement rapporté à la moyenne du régime. */
	enseignants: { part: number; traitement: number; autres: number };
	/** Primes en part du traitement, et dispersion entre individus autour de cette part. */
	primes: {
		enseignants: number;
		autresSre: number;
		cnracl: number;
		dispersion: number;
	};
	/** Part de chaque catégorie active selon la génération. */
	categories: ParRegime<
		Record<Exclude<CategorieFonctionnaire, "sedentaire">, Points>
	>;
	depart: ParRegime<ComportementDepart>;
}

export const HYPOTHESES_PUBLIQUES: HypothesesPubliques =
	donnees as unknown as HypothesesPubliques;
