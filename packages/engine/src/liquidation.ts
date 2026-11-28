import type { Affiliation, Modele } from "./affiliation.ts";
import { detailCotisations } from "./affiliations/prive.ts";
import type { Baremes } from "./baremes/types.ts";
import type { CompteCarriere } from "./compte.ts";
import type { ComportementDepart } from "./generateur/hypotheses.ts";
import { MODELE } from "./modele.ts";
import { ecreter, type ReglesScenario } from "./regles.ts";
import {
	type AffiliationId,
	type AgeTrimestres,
	type AnneeCarriere,
	type Carriere,
	type DetailsParRegime,
	moisParEtat,
	type Pension,
} from "./types.ts";

/** Affiliations d'une carrière servies par un même module, la plus travaillée en tête. */
type Groupe = { module: Affiliation; ids: AffiliationId[]; mois: number[] };

/**
 * Affiliations simulées d'une carrière, groupées par module et rangées de la plus travaillée à la
 * moins travaillée. Des affiliations servies par le même module partagent un compte et une
 * liquidation : c'est le cas des régimes alignés, qui ne versent qu'une pension de base.
 */
function groupesDe(carriere: Carriere, modele: Modele): Groupe[] {
	const groupes: Groupe[] = [];
	for (const a of carriere.annees) {
		const module = modele.affiliations[a.affiliation];
		if (!module) continue;
		let g = groupes.find((x) => x.module === module);
		if (!g) {
			g = { module, ids: [], mois: [] };
			groupes.push(g);
		}
		let k = g.ids.indexOf(a.affiliation);
		if (k < 0) {
			k = g.ids.length;
			g.ids.push(a.affiliation);
			g.mois.push(0);
		}
		(g.mois[k] as number) += moisParEtat(a).emploi;
	}
	const total = (g: Groupe) => g.mois.reduce((t, x) => t + x, 0);
	// À égalité, la première rencontrée dans la carrière reste devant.
	for (const g of groupes) {
		const ordre = g.ids
			.map((_, k) => k)
			.sort((x, y) => (g.mois[y] as number) - (g.mois[x] as number));
		g.ids = ordre.map((k) => g.ids[k] as AffiliationId);
		g.mois = ordre.map((k) => g.mois[k] as number);
	}
	return groupes.sort((x, y) => total(y) - total(x));
}

/**
 * Affiliations simulées d'une carrière, la principale en tête : celle où l'individu a le plus
 * travaillé, qui décide de son départ. Une carrière qui n'en a aucune prend celle par défaut.
 */
export function affiliationsDe(
	carriere: Carriere,
	modele: Modele = MODELE,
): AffiliationId[] {
	const ids = groupesDe(carriere, modele).flatMap((g) => g.ids);
	return ids.length > 0 ? ids : [modele.parDefaut];
}

function affiliation(modele: Modele, id: AffiliationId) {
	const a = modele.affiliations[id];
	if (!a) throw new Error(`Affiliation inconnue du modèle : ${id}`);
	return a;
}

/**
 * Compte d'une carrière : celui de son affiliation principale, et attachés à lui ceux de ses
 * autres affiliations. Il ne dépend pas des règles du scénario : à calculer une seule fois.
 */
export function buildCompte(
	carriere: Carriere,
	b: Baremes,
	modele: Modele = MODELE,
): CompteCarriere {
	const groupes = groupesDe(carriere, modele);
	if (groupes.length === 0)
		return affiliation(modele, modele.parDefaut).buildCompte(carriere, b);
	const comptes = groupes.map((g) => {
		const compte = g.module.buildCompte(carriere, b);
		compte.affiliation = g.ids[0] as AffiliationId;
		return compte;
	});
	// Le compte qui accompagne toujours une affiliation, quand la carrière n'y a pas d'année.
	for (const g of groupes) {
		const id = g.module.avec;
		if (id === undefined) continue;
		const module = affiliation(modele, id);
		if (groupes.some((x) => x.module === module)) continue;
		if (comptes.some((c) => c.affiliation === id)) continue;
		const compte = module.buildCompte(carriere, b);
		compte.affiliation = id;
		comptes.push(compte);
	}
	const [principal, ...autres] = comptes as [
		CompteCarriere,
		...CompteCarriere[],
	];
	if (autres.length > 0) principal.autres = autres;
	return principal;
}

export type OptionsPension = {
	regles?: ReglesScenario;
	/** Âge de départ imposé ; sinon le comportement par défaut s'applique. */
	ageLiquidation?: AgeTrimestres;
	compte?: CompteCarriere;
	/** Comportement de départ ; il ne joue que pour les carrières qui portent un profil. */
	comportement?: ComportementDepart;
	modele?: Modele;
};

/**
 * Calcule la pension d'une carrière, en euros de l'année de référence des barèmes.
 * Les barèmes doivent déjà porter les règles du scénario (voir appliquerRegles).
 *
 * L'affiliation principale décide de l'âge de départ ; les autres liquident au même âge, ou plus
 * tard quand elles n'ouvrent pas encore de droit à cet âge (`liquidation` du détail du régime).
 */
export function computePension(
	carriere: Carriere,
	b: Baremes,
	options: OptionsPension = {},
): Pension {
	const modele = options.modele ?? MODELE;
	const compte = options.compte ?? buildCompte(carriere, b, modele);
	const liquidation = {
		regles: options.regles,
		ageLiquidation: options.ageLiquidation,
		comportement: options.comportement,
		decisions: modele.decisions,
	};
	const principale = affiliation(modele, compte.affiliation).liquider(
		carriere,
		compte,
		b,
		liquidation,
	);
	const age = principale.age;
	let annuelle = principale.annuelle;
	let parRegime: DetailsParRegime = principale.parRegime;
	// Les autres affiliations liquident au même âge et pour le même motif.
	const motif = principale.duree.motif;
	const impose = {
		...liquidation,
		ageLiquidation: age,
		auPlusTot: true,
		...(motif && motif !== "invalidite" ? { motif } : {}),
	};
	for (const autre of compte.autres ?? []) {
		const l = affiliation(modele, autre.affiliation).liquider(
			carriere,
			autre,
			b,
			{ ...impose, dejaLiquide: annuelle },
		);
		annuelle += l.annuelle;
		parRegime = { ...parRegime, ...l.parRegime };
	}
	const pension: Pension = {
		liquidation: { age, annee: carriere.anneeNaissance + Math.floor(age / 4) },
		affiliation: compte.affiliation,
		duree: principale.duree,
		parRegime,
		mensuelleBrute: annuelle / 12,
	};
	return ecreterPension(pension, options.regles);
}

/**
 * La même pension après l'écrêtement du scénario : il se juge sur le total, et chaque régime
 * en porte sa part. Sans écrêtement, ou quand il ne retire rien, la pension est rendue telle quelle.
 */
export function ecreterPension(
	pension: Pension,
	regles: ReglesScenario | undefined,
): Pension {
	const e = regles?.ecretement;
	if (!e || pension.mensuelleBrute <= 0) return pension;
	const reste = ecreter(pension.mensuelleBrute, e) / pension.mensuelleBrute;
	if (reste >= 1) return pension;
	const parRegime: DetailsParRegime = {};
	for (const [id, d] of Object.entries(pension.parRegime))
		if (d) parRegime[id] = { ...d, pensionAnnuelle: d.pensionAnnuelle * reste };
	return {
		...pension,
		parRegime,
		mensuelleBrute: pension.mensuelleBrute * reste,
		ecretement: reste,
	};
}

/** Cotisations vieillesse d'une année de carrière, selon son affiliation ; nulles hors du modèle. */
export function cotisationsAnnee(
	annee: AnneeCarriere,
	b: Baremes,
	anneeDuPlafond?: number,
	modele: Modele = MODELE,
): { base: number; complementaire: number } {
	const a = modele.affiliations[annee.affiliation];
	return a
		? a.cotiser(annee, b, anneeDuPlafond)
		: { base: 0, complementaire: 0 };
}

/** Cotisations d'un salarié du privé sur un salaire brut : régime général et complémentaire. */
export function computeCotisations(
	salaireBrut: number,
	b: Baremes,
	annee: number = b.anneeReference,
): number {
	const d = detailCotisations(salaireBrut, b, annee);
	return d.base + d.complementaire;
}
