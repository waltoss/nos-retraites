/**
 * Chiffres figés des scénarios types (apps/web/src/accueil.json) : le solde de tous les régimes
 * année par année, l'âge moyen de départ et la pension de deux générations, avec la loi actuelle
 * et avec chaque scénario type. L'accueil et la page Scénarios les affichent sans attendre le
 * moteur, qui met plusieurs secondes par scénario sur un téléphone.
 *
 * Le calcul passe par le worker du site lui-même, avec la même taille de population : ce sont
 * au chiffre près ceux que le site calculerait. À relancer après tout changement du moteur, des
 * barèmes, de la population ou de scenarios.ts ; `--verifie` échoue si le fichier n'est plus à jour.
 */

import type { Reponse, Requete } from "../apps/web/src/engine.worker.ts";
import type { AnneeSysteme, Projection } from "../packages/engine/src/index.ts";

const reponses: Reponse[] = [];
(globalThis as unknown as { self: unknown }).self = {
	postMessage: (r: Reponse) => reponses.push(r),
};
await import("../apps/web/src/engine.worker.ts");
const { versScenario } = await import("../apps/web/src/leviers.ts");
const { SCENARIOS } = await import("../apps/web/src/scenarios.ts");
const { TAILLE } = await import("../apps/web/src/taille.ts");

const moteur = (
	globalThis as unknown as {
		self: { onmessage: (e: { data: Requete }) => void };
	}
).self;
const demander = (m: Requete): Reponse => {
	moteur.onmessage({ data: m });
	return reponses.at(-1) as Reponse;
};

export const GENERATIONS = [1975, 2000];
const arrondi = (x: number, n: number) => Number(x.toFixed(n));

/** Moyenne sur cinq générations voisines : chacune ne compte que quelques centaines de personnes simulées. */
function generation(p: Projection, annee: number) {
	const voisines = p.generations.filter(
		(g) => Math.abs(g.generation - annee) <= 2,
	);
	const moyenne = (f: (g: (typeof voisines)[number]) => number) =>
		voisines.reduce((t, g) => t + f(g), 0) / Math.max(1, voisines.length);
	return {
		age: arrondi(
			moyenne((g) => g.ageMoyenDepart),
			2,
		),
		pension: Math.round(moyenne((g) => g.pensionMoyenne)),
	};
}

/** Ce que l'on garde d'un scénario : soldes en millions d'euros, âges moyens de départ par année. */
const figer = (p: Projection, s: AnneeSysteme[]) => ({
	soldes: s.map((a) => Math.round(a.solde / 1e6)),
	pib: s.map((a) => arrondi((100 * a.solde) / a.pib, 2)),
	ages: p.annees.map((a) => arrondi(a.ageMoyenDepart, 2)),
	generations: Object.fromEntries(
		GENERATIONS.map((g) => [g, generation(p, g)]),
	),
});

demander({ type: "init", taille: TAILLE });
let loi: ReturnType<typeof figer> | null = null;
let debut = 0;
const scenarios: Record<string, ReturnType<typeof figer>> = {};
for (const s of SCENARIOS) {
	const r = demander({
		type: "projection",
		id: 1,
		scenario: versScenario(s.reglages),
	});
	if (r.type !== "projection") throw new Error("Réponse inattendue du moteur");
	loi ??= figer(r.reference, r.systeme.reference);
	debut = r.systeme.reference[0]?.annee ?? 0;
	scenarios[s.id] = figer(r.courant, r.systeme.courant);
}

const donnees = { taille: TAILLE, debut, loi, scenarios };
const sortie = `${JSON.stringify(donnees, null, "\t")}\n`;
const chemin = new URL("../apps/web/src/accueil.json", import.meta.url);
if (process.argv.includes("--verifie")) {
	// Le contenu, pas la mise en page : le formateur du dépôt réécrit le fichier à sa façon.
	const actuel = await Bun.file(chemin)
		.json()
		.catch(() => null);
	if (JSON.stringify(actuel) !== JSON.stringify(donnees)) {
		console.error(
			"accueil.json n'est plus à jour : relancer bun scripts/build-accueil.ts",
		);
		process.exit(1);
	}
	console.log("accueil.json est à jour");
} else {
	await Bun.write(chemin, sortie);
	console.log(
		`${SCENARIOS.length} scénarios figés dans apps/web/src/accueil.json`,
	);
}
process.exit(0);
