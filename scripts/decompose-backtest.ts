/**
 * Décomposition des écarts du backtest : pourquoi la pension de base des femmes est trop haute
 * et la complémentaire trop basse. Rien n'est réglé ici, rien n'est écrit : le script affiche,
 * par sexe et par génération, les composantes de la pension du modèle face à ce qui est publié.
 *
 * `bun scripts/decompose-backtest.ts`
 */
import complementaireHistorique from "../data/references/complementaire-historique.json" with {
	type: "json",
};
import historique from "../data/references/historique.json" with {
	type: "json",
};
import minima from "../data/references/minimum-contributif.json" with {
	type: "json",
};
import projections from "../data/references/projections.json" with {
	type: "json",
};
import validation from "../data/references/validation.json" with {
	type: "json",
};
import {
	BAREMES_FRANCE as B,
	buildComptes,
	type Carriere,
	CHAMP_PRIVE,
	computePensions,
	detail,
	estSalarie,
	generatePopulation,
	moisParEtat,
	type Pension,
	type Pyramide,
	pensionDuChamp,
	poidsDeLAnnee,
	prepareProjection,
	SCENARIO_REFERENCE,
	SURVIE_SELON_PENSION,
	valeur,
} from "../packages/engine/src/index.ts";

type Serie = Record<string, number | null>;
const SEXES = [
	["F", "femmes"],
	["H", "hommes"],
] as const;
const lire = (serie: Serie, annee: number): number => {
	const v = serie[annee];
	if (v === null || v === undefined)
		throw new Error(`Année ${annee} absente d'une série`);
	return v;
};

const population = generatePopulation(SCENARIO_REFERENCE, B);
const comptes = buildComptes(population, B);
const pensions = computePensions(population, B, {}, comptes);
const sansMinimum = computePensions(
	population,
	B,
	{ minimumContributif: 0 },
	comptes,
);

// Même reconstitution des populations passées que le backtest.
const prix = projections.hypothesesEconomiquesCOR.prix.indice as {
	anneeDebut: number;
	valeurs: number[];
};
const indice = (annee: number) =>
	prix.valeurs[annee - prix.anneeDebut] as number;
const enEurosDeReference = (annee: number) =>
	indice(B.anneeReference) / indice(annee);
const t = projections.populationProjetee.scenarios.central
	.population as unknown as {
	anneeDebut: number;
	femmes: number[][];
	hommes: number[][];
};
const AGE_MAX = 96;
const pyramides: Record<number, Pyramide> = {};
for (let annee = 2012; annee <= B.anneeReference; annee++) {
	const ligne = (table: number[][]) => {
		const insee = table[annee - t.anneeDebut] as number[];
		const v = new Array<number>(AGE_MAX + 1).fill(0);
		for (let age = 1; age <= AGE_MAX; age++)
			v[age] =
				age === AGE_MAX
					? insee.slice(age - 1).reduce((s, x) => s + x, 0)
					: (insee[age - 1] as number);
		return v;
	};
	pyramides[annee] = {
		annee,
		femmes: ligne(t.femmes),
		hommes: ligne(t.hommes),
	};
}
const preparation = prepareProjection(
	population,
	B,
	{},
	{
		debut: 2012,
		fin: 2024,
		pyramides,
		champ: CHAMP_PRIVE,
		anneeEffet: 2100,
		comptes,
		pensionsReference: pensions,
		survie: SURVIE_SELON_PENSION,
	},
);

type Retraite = { k: number; c: Carriere; p: Pension; poids: number };
/** Retraités du privé d'une fin d'année, avec leur poids cette année-là. */
const stock = (annee: number, depuis = 0): Retraite[] => {
	const poids = poidsDeLAnnee(preparation, annee);
	const v: Retraite[] = [];
	population.forEach((individu, k) => {
		const p = pensions[k] as Pension;
		const w = poids[k] as number;
		if (
			pensionDuChamp(CHAMP_PRIVE, p) > 0 &&
			p.liquidation.annee <= annee &&
			p.liquidation.annee >= depuis &&
			w > 0
		)
			v.push({ k, c: individu.carriere, p, poids: w });
	});
	return v;
};
const moyenne = (groupe: Retraite[], f: (x: Retraite) => number) => {
	let total = 0;
	let poids = 0;
	for (const x of groupe) {
		total += x.poids * f(x);
		poids += x.poids;
	}
	return poids ? total / poids : Number.NaN;
};
const effectif = (groupe: Retraite[]) =>
	groupe.reduce((s, x) => s + x.poids, 0);
const n = (x: number, d = 0) =>
	Number.isNaN(x) ? "-".padStart(7) : x.toFixed(d).padStart(7);
const ecart = (modele: number, observe: number) =>
	`${modele >= observe ? "+" : ""}${((modele / observe - 1) * 100).toFixed(1)} %`;

// --- Pension de base : composantes ---
const cnav = (x: Retraite) => detail(x.p, "cnav");
/** Pension de base mensuelle hors majoration pour enfants, comme la statistique publiée. */
const base = (x: Retraite) =>
	cnav(x).pensionAnnuelle / (1 + cnav(x).majorationEnfants) / 12;
/** La même sans le minimum contributif, à départ inchangé : salaire moyen × taux × proratisation, avec la surcote. */
const baseCalculee = (x: Retraite) => {
	const d = cnav(x);
	return (
		(d.salaireAnnuelMoyen *
			d.tauxLiquidation *
			d.proratisation *
			(1 + B.cnav.surcoteParTrimestre * d.trimestresSurcote)) /
		12
	);
};
const BANDES: [string, number, number][] = [
	["nés avant 1935", 0, 1934],
	["1935-1939", 1935, 1939],
	["1940-1944", 1940, 1944],
	["1945-1949", 1945, 1949],
	["1950-1954", 1950, 1954],
	["1955 et après", 1955, 9999],
];
const ENTETE =
	"                    effectif  pension    SAM/12   taux  prorat  %MICO  gain MICO  sans MICO  au régime  autres  maj. enf.";
const ligneBase = (nom: string, g: Retraite[]) =>
	console.log(
		`  ${nom.padEnd(16)} ${n(effectif(g) / 1e6, 2)}M ${n(moyenne(g, base))} ${n(moyenne(g, (x) => cnav(x).salaireAnnuelMoyen / 12))} ${n(
			moyenne(g, (x) => cnav(x).tauxLiquidation * 100),
			1,
		)} ${n(
			moyenne(g, (x) => cnav(x).proratisation),
			2,
		)} ${n(
			moyenne(g, (x) => (cnav(x).minimumContributifApplique ? 100 : 0)),
			1,
		)} ${n(moyenne(g, (x) => Math.max(0, base(x) - baseCalculee(x))))} ${n(moyenne(g, (x) => Math.min(base(x), baseCalculee(x))))}     ${n(moyenne(g, (x) => cnav(x).trimestresValides - cnav(x).trimestresAutresRegimes))} ${n(moyenne(g, (x) => cnav(x).trimestresAutresRegimes))} ${n(
			moyenne(g, (x) => cnav(x).majorationEnfants * 100),
			1,
		)}`,
	);

console.log(
	"1. PENSION DE BASE DES RETRAITÉS FIN 2019 (euros de 2026 par mois, hors majoration pour enfants)",
);
console.log(
	"   gain MICO : ce que le minimum contributif ajoute, en moyenne sur tout le groupe ; au régime, autres : trimestres",
);
const s2019 = stock(2019);
const e = historique.effectifs;
const micoStock = minima.beneficiaires.stock;
for (const [sexe, cle] of SEXES) {
	const g = s2019.filter((x) => x.c.sexe === sexe);
	console.log(`\n ${cle}\n${ENTETE}`);
	for (const [nom, de, a] of BANDES)
		ligneBase(
			nom,
			g.filter((x) => x.c.anneeNaissance >= de && x.c.anneeNaissance <= a),
		);
	ligneBase("ensemble", g);
	const observe =
		lire(e.cnav.pensionMoyenne[cle] as Serie, 2019) * enEurosDeReference(2019);
	const modele = moyenne(g, base);
	const gain = moyenne(g, (x) => Math.max(0, base(x) - baseCalculee(x)));
	const part = moyenne(g, (x) =>
		cnav(x).minimumContributifApplique ? 100 : 0,
	);
	const partObservee = lire(micoStock.part[cle] as Serie, 2019);
	console.log(
		`  observé (Drees, EACR) : pension ${observe.toFixed(0)} (modèle ${ecart(modele, observe)}), ${(lire(e.cnav.retraitesDroitDirect[cle] as Serie, 2019) / 1e6).toFixed(2)} M de retraités, ${partObservee} % au minimum contributif (modèle ${part.toFixed(1)} %)`,
	);
	console.log(
		`  écart à expliquer : ${(modele - observe).toFixed(0)} € ; le minimum contributif du modèle pèse ${gain.toFixed(0)} € par retraité`,
	);
}

console.log(
	"\n2. NOUVEAUX RETRAITÉS : PENSION DE BASE ET MINIMUM CONTRIBUTIF (euros de 2026 par mois)",
);
const complement = minima.beneficiaires.montantComplement.flux.valeurs;
const partFlux = minima.beneficiaires.flux.part;
for (const [debut, fin] of [
	[2012, 2015],
	[2016, 2019],
	[2020, 2024],
] as const) {
	const flux = stock(fin, debut);
	console.log(`\n ${debut}-${fin}\n${ENTETE}`);
	for (const [sexe, cle] of SEXES) {
		const g = flux.filter((x) => x.c.sexe === sexe);
		ligneBase(cle, g);
		if (debut < 2020) {
			let observe = 0;
			for (let a = debut; a <= fin; a++)
				observe +=
					lire(e.cnav.pensionMoyenneNouveaux[cle] as Serie, a) *
					enEurosDeReference(a);
			observe /= fin - debut + 1;
			console.log(
				`     observé : pension ${observe.toFixed(0)} (modèle ${ecart(moyenne(g, base), observe)})`,
			);
		}
	}
	const beneficiaires = flux.filter((x) => cnav(x).minimumContributifApplique);
	let part = 0;
	let montant = 0;
	let annees = 0;
	for (let a = debut; a <= fin; a++) {
		part += lire(partFlux.ensemble as Serie, a);
		const m = (complement.ensemble as Serie)[a];
		if (m !== null && m !== undefined) {
			montant += m * enEurosDeReference(a);
			annees++;
		}
	}
	console.log(
		`     minimum contributif, ensemble : ${((100 * effectif(beneficiaires)) / effectif(flux)).toFixed(1)} % des départs (observé ${(part / (fin - debut + 1)).toFixed(1)} %), complément moyen des bénéficiaires ${moyenne(beneficiaires, (x) => base(x) - baseCalculee(x)).toFixed(0)} € (observé ${(montant / annees).toFixed(0)} €)`,
	);
}

console.log(
	"\n3. SANS LE MINIMUM CONTRIBUTIF (scénario minimumContributif = 0, départs recalculés), retraités fin 2019",
);
for (const [sexe, cle] of SEXES) {
	const g = s2019.filter((x) => x.c.sexe === sexe);
	const sans = moyenne(g, (x) => {
		const d = detail(sansMinimum[x.k] as Pension, "cnav");
		return d.pensionAnnuelle / (1 + d.majorationEnfants) / 12;
	});
	const observe =
		lire(e.cnav.pensionMoyenne[cle] as Serie, 2019) * enEurosDeReference(2019);
	console.log(
		`  ${cle.padEnd(8)} avec ${moyenne(g, base).toFixed(0)}, sans ${sans.toFixed(0)}, observé (avec) ${observe.toFixed(0)}`,
	);
}

// --- Par génération, face à l'EIR 2020 ---
console.log(
	"\n4. PAR GÉNÉRATION, RETRAITÉS FIN 2020 DONT LE RÉGIME GÉNÉRAL EST LE RÉGIME PRINCIPAL",
);
console.log(
	"   euros de 2020 par mois, majoration pour enfants comprise ; observé : Drees, EIR 2020, résidents en France,",
);
console.log(
	"   tous régimes de base et toutes complémentaires de la personne (le modèle n'a que Cnav, indépendants et Agirc-Arrco)",
);
const valeursDeService = {
	...(complementaireHistorique.rendements.arrco
		.valeurServiceMoyenneAnnuelle as Serie),
	...(complementaireHistorique.rendements.agircArrco
		.valeurServiceMoyenneAnnuelle as Serie),
};
const pointEn = (annee: number) =>
	lire(valeursDeService, annee) / B.agircArrco.valeurDeServiceDuPoint;
const s2020 = stock(2020).filter(
	(x) =>
		cnav(x).trimestresValides - cnav(x).trimestresAutresRegimes >
		cnav(x).trimestresAutresRegimes,
);
const baseEn2020 = (x: Retraite) =>
	(cnav(x).pensionAnnuelle + (x.p.parRegime.ssi?.pensionAnnuelle ?? 0)) /
	12 /
	enEurosDeReference(2020);
const complementaireEn2020 = (x: Retraite) =>
	(detail(x.p, "agircArrco").pensionAnnuelle / 12) * pointEn(2020) +
	(x.p.parRegime.rci?.pensionAnnuelle ?? 0) / 12 / enEurosDeReference(2020);
const generations = validation.distributionPensionsDrees.valeurs
	.d_parRegimeEtAnciensSalariesDuPrive
	.parGeneration_regimeGeneralATitrePrincipal_fiche06_tableau1
	.generations as Record<
	string,
	{ dontRegimesDeBase: number; dontRegimesComplementaires: number }
>;
console.log(
	"  génération   base modèle  observé    écart   | complém. modèle  observé    écart   | base F   base H   compl. F  compl. H (modèle)",
);
for (const [annee, o] of Object.entries(generations)) {
	const g = s2020.filter(
		(x) => Math.abs(x.c.anneeNaissance - Number(annee)) <= 1,
	);
	const f = g.filter((x) => x.c.sexe === "F");
	const h = g.filter((x) => x.c.sexe === "H");
	const b = moyenne(g, baseEn2020);
	const c = moyenne(g, complementaireEn2020);
	console.log(
		`  ${annee}        ${n(b)}     ${n(o.dontRegimesDeBase)}  ${ecart(b, o.dontRegimesDeBase).padStart(8)}  |        ${n(c)}  ${n(o.dontRegimesComplementaires)}  ${ecart(c, o.dontRegimesComplementaires).padStart(8)}  | ${n(moyenne(f, baseEn2020))}  ${n(moyenne(h, baseEn2020))}   ${n(moyenne(f, complementaireEn2020))}   ${n(moyenne(h, complementaireEn2020))}`,
	);
}

// --- Complémentaire ---
console.log(
	"\n5. COMPLÉMENTAIRE DES RETRAITÉS FIN 2018 (euros de 2018 par an, majorations comprises)",
);
/** Points d'une carrière avant le départ, par origine. */
function points(x: Retraite) {
	const r = { tranche1: 0, auDela: 0, annees: 0, salaire: 0, sousPlafond: 0 };
	for (const a of x.c.annees) {
		if (a.annee >= x.p.liquidation.annee) break;
		const mois = moisParEtat(a).emploi;
		if (mois === 0 || a.salaireBrut <= 0 || !estSalarie(a)) continue;
		const pass = valeur(B.cnav.pass, a.annee);
		const plein = (a.salaireBrut * 12) / mois;
		const total =
			(B.agircArrco.pointsAnnee(a.annee, plein, pass, x.c.cadre) * mois) / 12;
		// Les points d'un non-cadre sont tous des points Arrco, tranche 2 comprise.
		const tranche1 = x.c.cadre
			? Math.min(
					total,
					(B.agircArrco.pointsAnnee(
						a.annee,
						Math.min(plein, pass),
						pass,
						false,
					) *
						mois) /
						12,
				)
			: total;
		r.tranche1 += tranche1;
		r.auDela += total - tranche1;
		r.annees += mois / 12;
		r.salaire += (plein / pass) * (mois / 12);
		if (plein <= pass) r.sousPlafond += mois / 12;
	}
	return r;
}
const s2018 = stock(2018).filter(
	(x) => detail(x.p, "agircArrco").pensionAnnuelle > 0,
);
const detailPoints = new Map(s2018.map((x) => [x.k, points(x)]));
const pts = (x: Retraite) => detailPoints.get(x.k) as ReturnType<typeof points>;
const complementaire = (x: Retraite) =>
	detail(x.p, "agircArrco").pensionAnnuelle * pointEn(2018);
const partTranche1 = (x: Retraite) => {
	const r = pts(x);
	return r.tranche1 + r.auDela > 0 ? r.tranche1 / (r.tranche1 + r.auDela) : 1;
};
const publie = complementaireHistorique.pensionsParStatut;
for (const [sexe, cle] of SEXES) {
	const g = s2018.filter((x) => x.c.sexe === sexe);
	console.log(
		`\n ${cle}\n                    effectif  cadres %        Arrco    Agirc  années  pts Arrco/an  salaire/PASS  pts gratuits %  cadres : salaire/PASS  années sous le plafond %`,
	);
	const ligne = (nom: string, v: Retraite[]) => {
		const cadres = v.filter((x) => x.c.cadre);
		console.log(
			`  ${nom.padEnd(16)} ${n(effectif(v) / 1e6, 2)}M  ${n(
				moyenne(v, (x) => (x.c.cadre ? 100 : 0)),
				1,
			)}     ${n(moyenne(v, (x) => complementaire(x) * partTranche1(x)))}  ${n(moyenne(v, (x) => complementaire(x) * (1 - partTranche1(x))))} ${n(
				moyenne(v, (x) => pts(x).annees),
				1,
			)}    ${n(
				moyenne(v, (x) =>
					pts(x).annees ? pts(x).tranche1 / pts(x).annees : 0,
				),
				1,
			)}       ${n(
				moyenne(v, (x) => (pts(x).annees ? pts(x).salaire / pts(x).annees : 0)),
				2,
			)}         ${n(
				moyenne(
					v,
					(x) =>
						100 *
						Math.max(
							0,
							1 -
								(pts(x).tranche1 + pts(x).auDela) /
									Math.max(1, detail(x.p, "agircArrco").points),
						),
				),
				1,
			)}                ${n(
				moyenne(cadres, (x) =>
					pts(x).annees ? pts(x).salaire / pts(x).annees : 0,
				),
				2,
			)}                   ${n(
				moyenne(cadres, (x) =>
					pts(x).annees ? (100 * pts(x).sousPlafond) / pts(x).annees : 0,
				),
				1,
			)}`,
		);
	};
	for (const [nom, de, a] of BANDES)
		ligne(
			nom,
			g.filter((x) => x.c.anneeNaissance >= de && x.c.anneeNaissance <= a),
		);
	ligne("ensemble", g);
	const avecAgirc = g.filter((x) => partTranche1(x) < 0.999);
	const arrco = moyenne(g, (x) => complementaire(x) * partTranche1(x));
	const agirc = moyenne(
		avecAgirc,
		(x) => complementaire(x) * (1 - partTranche1(x)),
	);
	const part = effectif(avecAgirc) / effectif(g);
	const oArrco = lire(publie.arrco.pensionAnnuelleMoyenne[cle] as Serie, 2018);
	const oAgirc = lire(publie.agirc.pensionAnnuelleMoyenne[cle] as Serie, 2018);
	const oPart =
		lire(publie.agirc.effectifs[cle] as Serie, 2018) /
		lire(publie.arrco.effectifs[cle] as Serie, 2018);
	console.log(
		`  Arrco, tous : modèle ${arrco.toFixed(0)}, observé ${oArrco} (${ecart(arrco, oArrco)})`,
	);
	console.log(
		`  Agirc, ceux qui en ont : modèle ${agirc.toFixed(0)}, observé ${oAgirc} (${ecart(agirc, oAgirc)}) ; part des retraités qui en ont : modèle ${(part * 100).toFixed(1)} %, observé ${(oPart * 100).toFixed(1)} %`,
	);
	console.log(
		`  Agirc par retraité (part × montant) : modèle ${(agirc * part).toFixed(0)}, observé ${(oAgirc * oPart).toFixed(0)} (${ecart(agirc * part, oAgirc * oPart)})`,
	);
	console.log(
		`  total par retraité : modèle ${(arrco + agirc * part).toFixed(0)}, observé ${(oArrco + oAgirc * oPart).toFixed(0)} (${ecart(arrco + agirc * part, oArrco + oAgirc * oPart)}) ; retraités : modèle ${(effectif(g) / 1e6).toFixed(2)} M, observé ${(lire(publie.arrco.effectifs[cle] as Serie, 2018) / 1e6).toFixed(2)} M`,
	);
	// Répartition de la pension Agirc de ceux qui en ont : beaucoup de petites pensions dans la réalité ?
	const tries = avecAgirc
		.map((x) => ({
			v: complementaire(x) * (1 - partTranche1(x)),
			w: x.poids,
		}))
		.sort((a, b) => a.v - b.v);
	const total = tries.reduce((s, x) => s + x.w, 0);
	const quantile = (q: number) => {
		let cumul = 0;
		for (const x of tries) {
			cumul += x.w;
			if (cumul >= q * total) return x.v;
		}
		return Number.NaN;
	};
	console.log(
		`  pension Agirc de ceux qui en ont, modèle : D1 ${quantile(0.1).toFixed(0)}, Q1 ${quantile(0.25).toFixed(0)}, médiane ${quantile(0.5).toFixed(0)}, Q3 ${quantile(0.75).toFixed(0)}, D9 ${quantile(0.9).toFixed(0)}`,
	);
}

// Points acquis par les cotisants d'aujourd'hui : le barème d'après 2019 est exact, l'écart vient des salaires et de l'emploi.
console.log(
	"\n6. POINTS ACQUIS DANS L'ANNÉE PAR L'EMPLOI, EN MILLIONS (Agirc-Arrco, points acquis par nature : effectifs × points moyens)",
);
console.log(
	"   la source compte toute personne qui a eu des points dans l'année, le modèle une personne par emploi : seule la masse se compare",
);
const acquis = complementaireHistorique.pointsGratuitsEtGMP
	.pointsAcquisParNature as unknown as {
	emploi: Record<string, { pointsMoyens: Serie; effectifs: Serie }>;
};
for (const annee of [2019, 2022, 2024]) {
	const poids = poidsDeLAnnee(preparation, annee);
	for (const [sexe, cle] of SEXES) {
		let total = 0;
		let w = 0;
		let sousPlafond = 0;
		population.forEach((individu, k) => {
			const c = individu.carriere;
			if (c.sexe !== sexe) return;
			if ((pensions[k] as Pension).liquidation.annee <= annee) return;
			const a = c.annees[annee - (c.annees[0]?.annee ?? annee + 1)];
			if (!a || !estSalarie(a) || a.salaireBrut <= 0) return;
			const mois = moisParEtat(a).emploi;
			if (mois === 0) return;
			const pass = valeur(B.cnav.pass, annee);
			const plein = (a.salaireBrut * 12) / mois;
			const p = poids[k] as number;
			total +=
				(p * B.agircArrco.pointsAnnee(annee, plein, pass, c.cadre) * mois) / 12;
			sousPlafond +=
				(p *
					B.agircArrco.pointsAnnee(
						annee,
						Math.min(plein, pass),
						pass,
						c.cadre,
					) *
					mois) /
				12;
			w += (p * mois) / 12;
		});
		const o = acquis.emploi[cle] as { pointsMoyens: Serie; effectifs: Serie };
		const observe =
			(lire(o.pointsMoyens, annee) * lire(o.effectifs, annee)) / 1e6;
		console.log(
			`  ${annee}, ${cle.padEnd(7)} modèle ${(total / 1e6).toFixed(0)}, observé ${observe.toFixed(0)} (${ecart(total / 1e6, observe)}) ; dans le modèle ${((100 * sousPlafond) / total).toFixed(0)} % sous le plafond, ${(w / 1e6).toFixed(2)} M d'emplois en année pleine`,
		);
	}
}

// --- Le même champ que la Drees, par sexe ---
console.log(
	"\n7. PENSION TOTALE FIN 2024, RÉGIME GÉNÉRAL À TITRE PRINCIPAL (euros de 2024 par mois, majorations comprises)",
);
console.log(
	"   observé : Drees, fiche 05 tableau 4, résidents en France, tous régimes de la personne ; le modèle ne verse rien pour les années « autre »",
);
{
	const o = validation.distributionPensionsDrees.valeurs
		.d_parRegimeEtAnciensSalariesDuPrive
		.selonRegimePrincipal_fin2024_fiche05_tableau4.tousRetraites
		.regimeGeneralATitrePrincipal as Record<string, number>;
	const s2024 = stock(2024).filter(
		(x) =>
			cnav(x).trimestresValides - cnav(x).trimestresAutresRegimes >
			cnav(x).trimestresAutresRegimes,
	);
	const baseEn2024 = (x: Retraite) =>
		(cnav(x).pensionAnnuelle + (x.p.parRegime.ssi?.pensionAnnuelle ?? 0)) /
		12 /
		enEurosDeReference(2024);
	const complementaireEn2024 = (x: Retraite) =>
		(detail(x.p, "agircArrco").pensionAnnuelle / 12) * pointEn(2024) +
		(x.p.parRegime.rci?.pensionAnnuelle ?? 0) / 12 / enEurosDeReference(2024);
	for (const [sexe, cle] of SEXES) {
		const g = s2024.filter((x) => x.c.sexe === sexe);
		const b = moyenne(g, baseEn2024);
		const c = moyenne(g, complementaireEn2024);
		console.log(
			`  ${cle.padEnd(7)} modèle ${(b + c).toFixed(0)} (base ${b.toFixed(0)} + complémentaire ${c.toFixed(0)}), observé ${o[cle]} (${ecart(b + c, o[cle] as number)}) ; ${moyenne(g, (x) => cnav(x).trimestresAutresRegimes).toFixed(0)} trimestres en moyenne dans un régime non simulé, ${(effectif(g) / 1e6).toFixed(2)} M de retraités`,
		);
	}
}
