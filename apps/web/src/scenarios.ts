import donnees from "../../../data/references/programmes-2027.json";
import type { LevierId, Reglages } from "./leviers";

/**
 * Scénarios tout faits : les grandes options du débat, décrites par leurs réglages.
 * Le titre dit la mesure, jamais un nom. Ceux qui reprennent les mesures chiffrées d'un programme
 * de la présidentielle de 2027 portent en plus leur attribution (`programme`), lue dans
 * data/references/programmes-2027.json : qui l'annonce, ce qui est repris, ce qui est laissé de
 * côté, les sources. Aucun n'est mis en avant : l'ordre des programmes est tiré au sort (ordre.ts).
 */
export interface ScenarioType {
	id: string;
	titre: string;
	/** Ce que le scénario change, en une ou deux phrases. */
	texte: string;
	reglages: Reglages;
}

/**
 * D'où vient la valeur d'un réglage : annoncée par le candidat, rapportée hors d'un programme écrit,
 * approchée (annonce traduite en valeur de curseur) ou choisie ici faute d'annonce.
 */
export type Nature = "annonce" | "secondaire" | "approche" | "illustration";

/** Ce qu'il faut savoir d'une valeur qui ne vient pas telle quelle du candidat. */
export const NATURE: Record<Nature, string | null> = {
	annonce: null,
	secondaire: "hors programme écrit",
	approche: "valeur approchée",
	illustration: "valeur choisie ici, non annoncée",
};

export interface Programme {
	candidats: { nom: string; parti: string; precision?: string }[];
	repris: Partial<Record<LevierId, { texte: string; nature: Nature }>>;
	laisseDeCote: string[];
	sources: { titre: string; url: string; date: string }[];
}

/** Un candidat dont les annonces ne se traduisent en aucun scénario, et pourquoi. */
export interface SansScenario {
	nom: string;
	parti: string;
	raison: string;
	url: string;
}

const PROGRAMME = donnees.scenarios as Record<string, Programme>;
export const SANS_SCENARIO: SansScenario[] = donnees.sansScenario;
export const DATE_PROGRAMMES: string = donnees.meta.dateConsultation;

export const programmeDe = (id: string): Programme | undefined => PROGRAMME[id];

/** « Raphaël Glucksmann et Marine Tondelier » : les noms seuls, pour une ligne d'attribution. */
export function attribution(p: Programme): string {
	const noms = p.candidats.map((c) => c.nom);
	return noms.length > 1
		? `${noms.slice(0, -1).join(", ")} et ${noms.at(-1)}`
		: (noms[0] ?? "");
}

const cle = (r: Reglages) =>
	JSON.stringify(Object.entries(r).sort(([a], [b]) => a.localeCompare(b)));

/** Le scénario type dont les réglages sont exactement ceux-ci : un levier touché, et ce n'est plus lui. */
export function scenarioDe(r: Reglages): ScenarioType | undefined {
	const c = cle(r);
	return SCENARIOS.find((s) => cle(s.reglages) === c);
}

export const SCENARIOS: ScenarioType[] = [
	{
		id: "62-ans",
		titre: "Revenir à 62 ans",
		texte:
			"La réforme de 2023 est abrogée : l'âge légal redescend à 62 ans. La durée de cotisation reste de 43 ans.",
		reglages: { ageLegal: 248 },
	},
	{
		id: "60-ans",
		titre: "60 ans, 40 années et plus de décote",
		texte:
			"L'âge légal revient à 60 ans, il suffit de 40 années pour une pension complète et la décote disparaît. Le minimum de pension est relevé de moitié, le plus haut que le simulateur sache régler.",
		reglages: { ageLegal: 240, dureeRequise: 160, decote: 0, minimum: 150 },
	},
	{
		id: "premier-emploi",
		titre: "De 60 à 62 ans selon l'âge du premier emploi",
		texte:
			"L'âge légal est de 62 ans avec 42 années de cotisation, et baisse de six mois par année de début plus précoce, jusqu'à 60 ans et 40 années pour un début avant 20 ans. S'y ajoute un compte de retraite par capitalisation, payé par d'autres prélèvements que les cotisations de retraite : 12 milliards par an annoncés, soit 1,5 % du salaire ici.",
		reglages: {
			ageLegal: 248,
			dureeRequise: 168,
			avanceDebut: 8,
			debutSansAvance: 23,
			capitalisation: 1.5,
		},
	},
	{
		id: "63-65",
		titre: "63 ans au plus tôt, taux plein à 65 ans",
		texte:
			"L'âge légal s'arrête à 63 ans, la décote disparaît à 65 ans au lieu de 67, et elle passe à 7 % par année manquante. Un compte par capitalisation reçoit 1 % du salaire, en plus des cotisations.",
		reglages: {
			ageLegal: 252,
			ageTauxPlein: 260,
			decote: 7,
			capitalisation: 1,
		},
	},
	{
		id: "65-ans",
		titre: "65 ans, 45 années et de la capitalisation",
		texte:
			"L'âge légal monte à 65 ans et la durée de cotisation à 45 ans. Un compte par capitalisation s'ajoute pour tous les salariés : son niveau n'est pas annoncé, 2 % du salaire ici pour fixer les idées.",
		reglages: { ageLegal: 260, dureeRequise: 180, capitalisation: 2 },
	},
	{
		id: "gel",
		titre: "Geler les pensions un an, sauf les petites",
		texte:
			"L'âge suit la loi actuelle. En 2028 les pensions ne sont pas revalorisées : elles perdent la hausse des prix de l'année, environ 1,8 %, et ne la rattrapent pas. Le seuil qui protège les petites pensions n'est pas annoncé : 1 500 € bruts par mois ici.",
		reglages: {
			revalorisation: -18,
			revalorisationDuree: 1,
			revalorisationSeuil: 1500,
		},
	},
	{
		id: "pensions",
		titre: "Faire porter l'effort sur les pensions",
		texte:
			"L'âge ne bouge pas. Les pensions versées augmentent chaque année un point de moins que les prix.",
		reglages: { revalorisation: -10 },
	},
	{
		id: "hautes-pensions",
		titre: "Réduire les hautes pensions",
		texte:
			"L'âge ne bouge pas. Au-dessus de 2 000 € brut par mois, la moitié de ce qui dépasse n'est plus versée, et aucune pension ne dépasse 4 500 €. Les retraités actuels sont touchés comme les futurs.",
		reglages: {
			ecretementPart: 50,
			ecretementSeuil: 2000,
			ecretementPlafond: 4500,
		},
	},
	{
		id: "cotisations",
		titre: "Faire porter l'effort sur les cotisations",
		texte:
			"L'âge ne bouge pas. Deux points de cotisation en plus sur les salaires du privé.",
		reglages: { cotisationBase: 2 },
	},
	{
		id: "public-prive",
		titre: "Rapprocher le public du privé",
		texte:
			"La pension des fonctionnaires se calcule sur leurs 25 meilleures années, primes comprises, et les catégories actives perdent leur départ anticipé. Rien ne change pour le privé.",
		reglages: {
			traitementFonctionnaires: 25,
			primesFonctionnaires: 1,
			categoriesActives: 0,
		},
	},
	{
		id: "emploi",
		titre: "Miser sur l'emploi",
		texte:
			"Aucune règle ne change. Le chômage recule d'un cinquième, les seniors restent plus souvent en emploi et les mères s'arrêtent deux fois moins après une naissance.",
		reglages: { chomage: 80, seniors: 80, interruptions: 50 },
	},
	{
		id: "familles-immigration",
		titre: "Miser sur les naissances et l'immigration",
		texte:
			"L'âge ne bouge pas. Plus de places de crèche, un congé parental mieux payé, des aides aux familles, et un solde migratoire de 230 000 personnes par an.",
		reglages: {
			creches: 30,
			congeParental: 1,
			aidesFamilles: 5,
			immigration: 230,
		},
	},
];

/** Les scénarios tirés d'un programme de 2027, et les autres pistes du débat, attachées à personne. */
export const PROGRAMMES = SCENARIOS.filter((s) => PROGRAMME[s.id]);
export const PISTES = SCENARIOS.filter((s) => !PROGRAMME[s.id]);
