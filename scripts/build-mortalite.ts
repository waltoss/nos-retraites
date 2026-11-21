/**
 * Mortalité selon le niveau de pension (packages/engine/src/population/mortalite.data.json).
 *
 * L'Insee publie des tables de mortalité par vingtième de niveau de vie. On en tire, par sexe,
 * la chance d'être en vie à chaque âge rapportée à celle de l'ensemble, à partir de 60 ans.
 * Le modèle classe les individus par leur pension, pas par le niveau de vie de leur ménage :
 * l'écart est atténué pour retrouver celui que la Drees mesure entre hautes et basses pensions.
 */
import reference from "../data/references/mortalite.json" with { type: "json" };

const PERIODE = "2020-2024";
/**
 * Atténuation : écart d'âge au décès entre basses et hautes pensions (Drees, Études et Résultats
 * n° 1327 : 2,6 ans chez les femmes, 3,4 à 3,8 ans chez les hommes) rapporté à l'écart d'espérance
 * de vie à 60 ans entre les mêmes parts de la distribution des niveaux de vie (4,5 et 5,7 à 6,2 ans).
 */
const ATTENUATION = 0.6;

type Table = { survie: number[] };
const tables = reference.parNiveauDeVie.periodes[PERIODE] as unknown as Record<
	"femmes" | "hommes",
	Record<string, Table>
>;
const relatif = (sexe: "femmes" | "hommes") => {
	const ensemble = tables[sexe].ensemble as Table;
	return Array.from({ length: 20 }, (_, v) => {
		const t = tables[sexe][`v${String(v + 1).padStart(2, "0")}`] as Table;
		return t.survie.map((s, i) =>
			Number(((s / (ensemble.survie[i] as number)) ** ATTENUATION).toFixed(4)),
		);
	});
};
const sortie = {
	source: reference.parNiveauDeVie.source,
	url: reference.parNiveauDeVie.url,
	date: reference.parNiveauDeVie.date,
	periode: PERIODE,
	attenuation: ATTENUATION,
	/** Indice 0 du tableau de chaque vingtième. */
	ageMin: 60,
	femmes: relatif("femmes"),
	hommes: relatif("hommes"),
};
await Bun.write(
	new URL(
		"../packages/engine/src/population/mortalite.data.json",
		import.meta.url,
	),
	`${JSON.stringify(sortie)}\n`,
);
for (const sexe of ["femmes", "hommes"] as const)
	console.log(
		sexe,
		"survie relative à 85 ans, du vingtième le plus modeste au plus aisé :",
		[0, 4, 9, 14, 19].map((v) => sortie[sexe][v]?.[25]).join(" "),
	);
