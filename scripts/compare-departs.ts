/**
 * Départs à la retraite du scénario de référence, par année de départ : âge moyen, motifs,
 * décote et surcote. À comparer aux statistiques de `data/references/departs.json`.
 */
import {
	BAREMES_FRANCE as B,
	buildComptes,
	computePensions,
	generatePopulation,
	SCENARIO_REFERENCE,
} from "../packages/engine/src/index.ts";

const population = generatePopulation(SCENARIO_REFERENCE, B);
const pensions = computePensions(
	population,
	B,
	{},
	buildComptes(population, B),
);
const annees = process.argv.slice(2).map(Number).filter(Boolean);
const pct = (x: number) => `${(100 * x).toFixed(1)} %`;
for (const annee of annees.length ? annees : [2019, 2023, 2026, 2035, 2050]) {
	const t = {
		n: 0,
		age: 0,
		longue: 0,
		inaptitude: 0,
		decote: 0,
		trimestresDecote: 0,
		surcote: 0,
		trimestresSurcote: 0,
		tard: 0,
	};
	const parAge = new Map<number, number>();
	population.forEach((individu, k) => {
		const p = pensions[k];
		// Seuls ceux qui ont des droits comptent comme nouveaux retraités.
		if (!p || p.liquidation.annee !== annee || p.mensuelleBrute <= 0) return;
		const w = individu.poids || 1;
		t.n += w;
		t.age += (w * p.liquidation.age) / 4;
		if (p.cnav.motif === "carriereLongue") t.longue += w;
		if (p.cnav.motif === "inaptitude") t.inaptitude += w;
		if (p.cnav.trimestresDecote > 0) {
			t.decote += w;
			t.trimestresDecote += w * p.cnav.trimestresDecote;
		}
		if (p.cnav.trimestresSurcote > 0) {
			t.surcote += w;
			t.trimestresSurcote += w * p.cnav.trimestresSurcote;
		}
		const a = Math.floor(p.liquidation.age / 4);
		if (a >= 67) t.tard += w;
		parAge.set(a, (parAge.get(a) ?? 0) + w);
	});
	console.log(
		`${annee} : ${Math.round(t.n / 1000)} milliers de départs, âge moyen ${(t.age / t.n).toFixed(2)}`,
	);
	console.log(
		`  carrière longue ${pct(t.longue / t.n)}, inaptitude ${pct(t.inaptitude / t.n)}, décote ${pct(t.decote / t.n)} (${(t.trimestresDecote / Math.max(1, t.decote)).toFixed(1)} trim.), surcote ${pct(t.surcote / t.n)} (${(t.trimestresSurcote / Math.max(1, t.surcote)).toFixed(1)} trim.), 67 ans et plus ${pct(t.tard / t.n)}`,
	);
	console.log(
		`  par âge : ${[...parAge.entries()]
			.sort(([x], [y]) => x - y)
			.map(([a, w]) => `${a}: ${pct(w / t.n)}`)
			.join(", ")}`,
	);
}
