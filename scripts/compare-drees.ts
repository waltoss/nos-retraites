/** Photographie du scénario de référence : chiffres simulés, à confronter aux références Drees. */
import {
	BAREMES_FRANCE,
	buildComptes,
	CHAMP_PRIVE,
	carriereType,
	computePension,
	detail,
	generatePopulation,
	pensionDuChamp,
	runSimulation,
	SCENARIO_REFERENCE,
} from "../packages/engine/src/index.ts";

const b = BAREMES_FRANCE;
const population = generatePopulation(SCENARIO_REFERENCE, b);
const comptes = buildComptes(population, b);
const r = runSimulation(population, b, {}, comptes);
const f = (n: number) => Math.round(n).toString().padStart(6);
console.log(
	`Année de référence ${r.anneeReference}, ${population.length} individus, ${r.dureeMs.toFixed(0)} ms`,
);
console.log(
	"Effectifs",
	r.effectifs,
	"| âge moyen de départ",
	r.ageMoyenDepart.toFixed(2),
	"| 60-69 ans retraités",
	(r.partRetraitesSexagenaires * 100).toFixed(0),
	"%",
);
console.log(
	"Pensions mensuelles brutes   moyenne",
	f(r.pensions.resume.moyenne),
	"| D1..D9",
	r.pensions.resume.deciles.map(f).join(""),
);
console.log(
	"Cotisations annuelles        moyenne",
	f(r.cotisations.resume.moyenne),
	"| D1..D9",
	r.cotisations.resume.deciles.map(f).join(""),
);

for (const sexe of ["F", "H"] as const) {
	const pensions: number[] = [];
	population.forEach((i, k) => {
		if (i.carriere.sexe !== sexe || i.carriere.anneeNaissance > 1962) return;
		pensions.push(
			pensionDuChamp(
				CHAMP_PRIVE,
				computePension(i.carriere, b, { compte: comptes[k] }),
			),
		);
	});
	pensions.sort((x, y) => x - y);
	const q = (p: number) => pensions[Math.floor(p * (pensions.length - 1))] ?? 0;
	console.log(
		`Générations 1955-1962, ${sexe} : moyenne ${f(pensions.reduce((t, x) => t + x, 0) / pensions.length)} | D1 ${f(q(0.1))} | médiane ${f(q(0.5))} | D9 ${f(q(0.9))}`,
	);
}

console.log(
	"\nCarrières types (génération 1962, carrière continue depuis 20 ans, salaire en part du PASS) :",
);
for (const part of [0.5, 1, 2]) {
	const p = computePension(carriereType(1962, 20, 68, part, b), b);
	const dernier = part * (b.cnav.pass[2024] ?? 0);
	console.log(
		`  ${part} PASS : départ ${(p.liquidation.age / 4).toFixed(2)} ans, CNAV ${f(detail(p, "cnav").pensionAnnuelle / 12)} + complémentaire ${f(detail(p, "agircArrco").pensionAnnuelle / 12)} = ${f(p.mensuelleBrute)} €/mois, taux de remplacement brut ${(((p.mensuelleBrute * 12) / dernier) * 100).toFixed(0)} %`,
	);
}
