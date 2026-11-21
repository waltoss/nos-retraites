import type { Reglages } from "./leviers";

/**
 * Scénarios tout faits : les grandes options du débat, décrites par leurs réglages.
 * Ils ne portent le nom d'aucun parti ni d'aucun candidat, et aucun n'est mis en avant.
 */
export interface ScenarioType {
	id: string;
	titre: string;
	/** Ce que le scénario change, en une ou deux phrases. */
	texte: string;
	reglages: Reglages;
}

export const SCENARIOS: ScenarioType[] = [
	{
		id: "62-ans",
		titre: "Revenir à 62 ans",
		texte:
			"L'âge légal redescend à 62 ans. La durée de cotisation reste de 43 ans.",
		reglages: { ageLegal: 248 },
	},
	{
		id: "60-ans",
		titre: "60 ans et 40 années de cotisation",
		texte:
			"L'âge légal revient à 60 ans et il suffit de 40 années pour une pension complète.",
		reglages: { ageLegal: 240, dureeRequise: 160 },
	},
	{
		id: "65-ans",
		titre: "Aller à 65 ans",
		texte:
			"L'âge légal continue de monter de trois mois par génération jusqu'à 65 ans.",
		reglages: { ageLegal: 260 },
	},
	{
		id: "67-ans",
		titre: "Aller à 67 ans",
		texte:
			"L'âge légal monte jusqu'à 67 ans, l'âge où la décote disparaît aujourd'hui.",
		reglages: { ageLegal: 268 },
	},
	{
		id: "pensions",
		titre: "Faire porter l'effort sur les pensions",
		texte:
			"L'âge ne bouge pas. Les pensions versées augmentent chaque année un point de moins que les prix.",
		reglages: { revalorisation: -10 },
	},
	{
		id: "cotisations",
		titre: "Faire porter l'effort sur les cotisations",
		texte:
			"L'âge ne bouge pas. Deux points de cotisation en plus sur les salaires du privé.",
		reglages: { cotisationBase: 2 },
	},
	{
		id: "partage",
		titre: "Partager l'effort",
		texte:
			"Un peu de chaque : 65 ans, des pensions un demi-point sous les prix, un demi-point de cotisation en plus.",
		reglages: { ageLegal: 260, revalorisation: -5, cotisationBase: 0.5 },
	},
	{
		id: "emploi",
		titre: "Miser sur l'emploi",
		texte:
			"Aucune règle ne change. Le chômage recule d'un cinquième, les seniors restent plus souvent en emploi et les mères s'arrêtent deux fois moins après une naissance.",
		reglages: { chomage: 80, seniors: 80, interruptions: 50 },
	},
	{
		id: "demographie",
		titre: "Miser sur la démographie",
		texte:
			"Aucune règle ne change. La natalité remonte à 1,70 enfant par femme et le solde migratoire à 230 000 personnes par an.",
		reglages: { natalite: 170, immigration: 230 },
	},
];
