/**
 * Calage du générateur de carrières sur la génération 1953 (Drees, EIR 2020).
 *
 *   bun scripts/calage.ts            mesure les hypothèses actuelles face aux cibles
 *   bun scripts/calage.ts --ajuste   cherche de meilleures hypothèses et les affiche
 *   bun scripts/calage.ts --ajuste --ecrit   les enregistre dans hypotheses.data.json
 *
 * Les cibles viennent de data/references/.
 */
import salaires from "../data/references/salaires.json" with { type: "json" };
import validation from "../data/references/validation.json" with {
	type: "json",
};
import {
	BAREMES_FRANCE,
	buildCompte,
	CHAMP_PRIVE,
	computePension,
	createRng,
	detail,
	generateCarriere,
	graineIndividu,
	HYPOTHESES,
	type Hypotheses,
	pensionDuChamp,
} from "../packages/engine/src/index.ts";

const b = BAREMES_FRANCE;
const GENERATION = 1953;
const TAILLE = 12000;
const GRAINE = 1953;

type ParSexe = { ensemble: number; femmes: number; hommes: number };
const drees = validation.distributionPensionsDrees.valeurs
	.generation1953_EIR2020.pensionDroitDirectBruteYcMajorationsEnfants as Record<
	string,
	ParSexe
>;
const durees =
	validation.dureesValidees.valeurs.generation1953_EIR2020_classeur;
/** Les montants Drees sont en euros de 2020 : on les porte en euros de l'année de référence. */
const coefficient = b.cnav.coefficientsRevalorisation[2020] ?? 1;

const TRANCHES = [
	"moinsDe10ans",
	"de10a20ans",
	"de20a30ans",
	"de30a40ans",
	"40ansOuPlus",
] as const;

export interface Mesure {
	nom: string;
	modele: number;
	cible: number;
	/** Écart toléré : l'unité de la perte. */
	echelle: number;
}

function quantile(tri: number[], p: number): number {
	return tri[Math.floor(p * (tri.length - 1))] ?? 0;
}

export function mesurer(h: Hypotheses, generation = GENERATION): Mesure[] {
	const groupes = {
		femmes: {
			pensions: [] as number[],
			cotisee: [] as number[],
			validee: [] as number[],
			complete: 0,
			age: 0,
		},
		hommes: {
			pensions: [] as number[],
			cotisee: [] as number[],
			validee: [] as number[],
			complete: 0,
			age: 0,
		},
	};
	for (let id = 0; id < TAILLE; id++) {
		const carriere = generateCarriere(
			generation,
			createRng(graineIndividu(GRAINE, id)),
			h,
			b,
		);
		const p = computePension(carriere, b, { compte: buildCompte(carriere, b) });
		// Champ Drees : retraités de droit direct. Sans aucun droit, on n'est pas dans le champ.
		if (pensionDuChamp(CHAMP_PRIVE, p) <= 0) continue;
		const g = groupes[carriere.sexe === "F" ? "femmes" : "hommes"];
		g.pensions.push(pensionDuChamp(CHAMP_PRIVE, p));
		// La cible de la Drees porte sur tous les régimes.
		g.cotisee.push(
			(detail(p, "cnav").trimestresCotises +
				detail(p, "cnav").trimestresAutresRegimes) /
				4,
		);
		g.validee.push(detail(p, "cnav").trimestresValides / 4);
		if (detail(p, "cnav").trimestresValides >= detail(p, "cnav").dureeRequise)
			g.complete++;
		g.age += p.liquidation.age / 4;
	}
	const mesures: Mesure[] = [];
	for (const sexe of ["femmes", "hommes"] as const) {
		const g = groupes[sexe];
		const n = g.pensions.length;
		const tri = [...g.pensions].sort((x, y) => x - y);
		const moyenne = (v: number[]) => v.reduce((t, x) => t + x, 0) / v.length;
		const pension = (
			nom: string,
			valeur: number,
			cle: string,
			echelle: number,
		) =>
			mesures.push({
				nom: `${sexe} pension ${nom}`,
				modele: valeur,
				cible: (drees[cle]?.[sexe] ?? 0) * coefficient,
				echelle: Number.POSITIVE_INFINITY,
			});
		pension("D1", quantile(tri, 0.1), "D1", 0.1);
		pension("Q1", quantile(tri, 0.25), "Q1", 0.05);
		pension("médiane", quantile(tri, 0.5), "mediane", 0.05);
		pension("Q3", quantile(tri, 0.75), "Q3", 0.05);
		pension("D9", quantile(tri, 0.9), "D9", 0.05);
		pension("moyenne", moyenne(g.pensions), "moyenne", 0.05);
		for (const [nom, valeurs, cibles] of [
			["cotisée", g.cotisee, durees.repartitionDureeCotisee_pct],
			["validée", g.validee, durees.repartitionDureeValidee_pct],
		] as const) {
			TRANCHES.forEach((t, k) => {
				const part =
					(valeurs.filter((d) => Math.min(4, Math.floor(d / 10)) === k).length /
						n) *
					100;
				mesures.push({
					nom: `${sexe} durée ${nom} ${t} (%)`,
					modele: part,
					cible: cibles[t][sexe],
					echelle: 2,
				});
			});
		}
		mesures.push({
			nom: `${sexe} durée cotisée moyenne (ans)`,
			modele: moyenne(g.cotisee),
			cible: durees.dureeCotiseeMoyenne_annees[sexe],
			echelle: 1,
		});
		mesures.push({
			nom: `${sexe} durée validée moyenne (ans)`,
			modele: moyenne(g.validee),
			cible: durees.dureeValideeMoyenne_annees[sexe],
			echelle: 1,
		});
		mesures.push({
			nom: `${sexe} carrière complète (%)`,
			modele: (g.complete / n) * 100,
			cible: durees.partCarriereComplete_pct[sexe],
			echelle: 3,
		});
		// Hors perte : le modèle n'a ni carrières longues ni départs anticipés.
		mesures.push({
			nom: `${sexe} âge moyen de départ (ans)`,
			modele: g.age / n,
			cible:
				validation.agesDepart.valeurs.generation1953_ageLiquidation_EIR2020
					.ageMoyen[sexe],
			echelle: Number.POSITIVE_INFINITY,
		});
	}
	const tous = [...groupes.femmes.pensions, ...groupes.hommes.pensions].sort(
		(x, y) => x - y,
	);
	for (const [nom, cle, p] of [
		["D1", "D1", 0.1],
		["médiane", "mediane", 0.5],
		["D9", "D9", 0.9],
	] as const) {
		mesures.push({
			nom: `ensemble pension ${nom}`,
			modele: quantile(tous, p),
			cible: (drees[cle]?.ensemble ?? 0) * coefficient,
			echelle: Number.POSITIVE_INFINITY,
		});
	}
	return mesures;
}

const insee = salaires.distributionSalaires.salairesEqtpSecteurPrive2025;
const SMIC_NET = salaires.distributionSalaires.smic.annee2025.netMensuel;
const ANNEE_SALAIRES = 2025;

/**
 * Salaires en équivalent temps plein des individus en emploi en 2025, en multiples du SMIC,
 * face aux déciles Insee du secteur privé (nets, eux aussi rapportés au SMIC net).
 */
export function mesurerSalaires(h: Hypotheses): Mesure[] {
	const smic = (b.cnav.smicHoraire[ANNEE_SALAIRES] ?? 0) * h.heuresAnnuelles;
	const groupes = { femmes: [] as number[], hommes: [] as number[] };
	for (let id = 0; id < TAILLE; id++) {
		const generation = 1961 + (id % 43);
		const carriere = generateCarriere(
			generation,
			createRng(graineIndividu(GRAINE + 1, id)),
			h,
			b,
		);
		const a = carriere.annees.find((x) => x.annee === ANNEE_SALAIRES);
		if (
			!a ||
			a.affiliation !== "prive" ||
			a.salaireBrut <= 0 ||
			!a.moisEmploi ||
			a.alternance
		)
			continue;
		groupes[carriere.sexe === "F" ? "femmes" : "hommes"].push(
			(a.salaireBrut * 12) / a.moisEmploi / (a.quotite ?? 1) / smic,
		);
	}
	const mesures: Mesure[] = [];
	for (const sexe of ["femmes", "hommes"] as const) {
		const tri = groupes[sexe].sort((x, y) => x - y);
		const cibles = insee.distributionNetMensuelEqtp[sexe];
		for (const [cle, p] of [
			["d1", 0.1],
			["d2", 0.2],
			["d3", 0.3],
			["d5Mediane", 0.5],
			["d7", 0.7],
			["d8", 0.8],
			["d9", 0.9],
			["c95", 0.95],
			["c99", 0.99],
		] as const) {
			const cible = cibles[cle] / SMIC_NET;
			mesures.push({
				nom: `${sexe} salaire ${cle} (SMIC)`,
				modele: quantile(tri, p),
				cible,
				echelle: 0.05 * cible,
			});
		}
		const cible = cibles.moyenne / SMIC_NET;
		mesures.push({
			nom: `${sexe} salaire moyenne (SMIC)`,
			modele: tri.reduce((t, x) => t + x, 0) / tri.length,
			cible,
			echelle: 0.05 * cible,
		});
	}
	return mesures;
}

export function perte(mesures: Mesure[]): number {
	return mesures.reduce(
		(t, m) => t + ((m.modele - m.cible) / m.echelle) ** 2,
		0,
	);
}

const tout = (h: Hypotheses) => [...mesurer(h), ...mesurerSalaires(h)];

/** Paramètres libres : lecture et écriture dans les hypothèses, avec leurs bornes. */
const LIBRES: {
	nom: string;
	lit: (h: Hypotheses) => number;
	ecrit: (h: Hypotheses, v: number) => Hypotheses;
	min: number;
	max: number;
}[] = [
	{
		nom: "carrierePartielle.part.F",
		lit: (h) => h.carrierePartielle.part.F,
		ecrit: (h, v) => ({
			...h,
			carrierePartielle: {
				...h.carrierePartielle,
				part: { ...h.carrierePartielle.part, F: v },
			},
		}),
		min: 0,
		max: 0.3,
	},
	{
		nom: "carrierePartielle.part.H",
		lit: (h) => h.carrierePartielle.part.H,
		ecrit: (h, v) => ({
			...h,
			carrierePartielle: {
				...h.carrierePartielle,
				part: { ...h.carrierePartielle.part, H: v },
			},
		}),
		min: 0,
		max: 0.3,
	},
	{
		nom: "carrierePartielle.dureeMax",
		lit: (h) => h.carrierePartielle.dureeMax,
		ecrit: (h, v) => ({
			...h,
			carrierePartielle: { ...h.carrierePartielle, dureeMax: v },
		}),
		min: 10,
		max: 40,
	},
	{
		nom: "depuisEmploi.chomage",
		lit: (h) => h.depuisEmploi.chomage,
		ecrit: (h, v) => ({
			...h,
			depuisEmploi: { ...h.depuisEmploi, chomage: v },
		}),
		min: 0.005,
		max: 0.4,
	},
	{
		nom: "depuisEmploi.inactivite",
		lit: (h) => h.depuisEmploi.inactivite,
		ecrit: (h, v) => ({
			...h,
			depuisEmploi: { ...h.depuisEmploi, inactivite: v },
		}),
		min: 0.001,
		max: 0.08,
	},
	{
		nom: "dureeMois.chomage",
		lit: (h) => h.dureeMois.chomage,
		ecrit: (h, v) => ({ ...h, dureeMois: { ...h.dureeMois, chomage: v } }),
		min: 3,
		max: 30,
	},
	{
		nom: "dureeMois.inactivite",
		lit: (h) => h.dureeMois.inactivite,
		ecrit: (h, v) => ({ ...h, dureeMois: { ...h.dureeMois, inactivite: v } }),
		min: 12,
		max: 400,
	},
	{
		nom: "seniors.multiplicateurDurees",
		lit: (h) => h.seniors.multiplicateurDurees,
		ecrit: (h, v) => ({
			...h,
			seniors: { ...h.seniors, multiplicateurDurees: v },
		}),
		min: 1,
		max: 10,
	},
	{
		nom: "interruptionNaissance.dureeMois",
		lit: (h) => h.interruptionNaissance.dureeMois,
		ecrit: (h, v) => ({
			...h,
			interruptionNaissance: { ...h.interruptionNaissance, dureeMois: v },
		}),
		min: 6,
		max: 400,
	},
	{
		nom: "risqueRang",
		lit: (h) => h.risqueRang,
		ecrit: (h, v) => ({ ...h, risqueRang: v }),
		min: 1,
		max: 3,
	},
	{
		nom: "seniors.multiplicateurSorties",
		lit: (h) => h.seniors.multiplicateurSorties,
		ecrit: (h, v) => ({
			...h,
			seniors: { ...h.seniors, multiplicateurSorties: v },
		}),
		min: 1,
		max: 5,
	},
	{
		nom: "interruptionNaissance.probabilite",
		lit: (h) => h.interruptionNaissance.probabilite,
		ecrit: (h, v) => ({
			...h,
			interruptionNaissance: { ...h.interruptionNaissance, probabilite: v },
		}),
		min: 0,
		max: 0.6,
	},
	{
		nom: "interruptionNaissance.partDefinitive",
		lit: (h) => h.interruptionNaissance.partDefinitive,
		ecrit: (h, v) => ({
			...h,
			interruptionNaissance: { ...h.interruptionNaissance, partDefinitive: v },
		}),
		min: 0,
		max: 0.6,
	},
	{
		nom: "avpf.part",
		lit: (h) => h.avpf.part,
		ecrit: (h, v) => ({ ...h, avpf: { part: v } }),
		min: 0,
		max: 1,
	},
	{
		nom: "ecartSalaireFemmes",
		lit: (h) => h.ecartSalaireFemmes,
		ecrit: (h, v) => ({ ...h, ecartSalaireFemmes: v }),
		min: 0.6,
		max: 1,
	},
	{
		nom: "sigmaPermanent",
		lit: (h) => h.sigmaPermanent,
		ecrit: (h, v) => ({ ...h, sigmaPermanent: v }),
		min: 0.25,
		max: 0.7,
	},
	{
		nom: "etalementSmic",
		lit: (h) => h.etalementSmic,
		ecrit: (h, v) => ({ ...h, etalementSmic: v }),
		min: 0.02,
		max: 0.5,
	},
	{
		nom: "niveauSalaire",
		lit: (h) => h.niveauSalaire,
		ecrit: (h, v) => ({ ...h, niveauSalaire: v }),
		min: 0.7,
		max: 1.4,
	},
];

function affiche(mesures: Mesure[]) {
	for (const m of mesures) {
		const ecart = (m.modele - m.cible) / m.echelle;
		const rel = ((m.modele / m.cible - 1) * 100).toFixed(0);
		console.log(
			`${m.nom.padEnd(46)} modèle ${m.modele.toFixed(2).padStart(8)}  cible ${m.cible.toFixed(2).padStart(8)}  ${Number.isFinite(m.echelle) ? `${ecart >= 0 ? "+" : ""}${ecart.toFixed(1)} tol.` : `${rel} %`}`,
		);
	}
	console.log(`Perte : ${perte(mesures).toFixed(1)}`);
}

/** Recoupement : durée validée moyenne par génération, face à la projection du COR (figure 3.22). */
function recoupe(h: Hypotheses) {
	const cor =
		validation.dureesValidees.valeurs.parGenerationEtSexe_COR_figure3_22;
	console.log(
		"\nDurée validée moyenne en trimestres, modèle et COR (figure 3.22) :",
	);
	for (const generation of [1953, 1960, 1970, 1980, 1990, 2000]) {
		const m = mesurer(h, generation);
		const lit = (nom: string) => m.find((x) => x.nom === nom)?.modele ?? 0;
		const f = lit("femmes durée validée moyenne (ans)") * 4;
		const hm = lit("hommes durée validée moyenne (ans)") * 4;
		const c = (s: "femmes" | "hommes") =>
			(cor[s] as Record<string, number>)[String(generation)] ?? 0;
		console.log(
			`  ${generation}  femmes ${f.toFixed(0)} (COR ${c("femmes").toFixed(0)})  hommes ${hm.toFixed(0)} (COR ${c("hommes").toFixed(0)})`,
		);
	}
}

if (import.meta.main) {
	let h = HYPOTHESES;
	const t = process.argv.find((a) => a.startsWith("--tendance="));
	if (t) h = { ...h, tendanceInterruption: Number(t.split("=")[1]) };
	if (process.argv.includes("--ajuste")) {
		let meilleure = perte(tout(h));
		let pas = 0.25;
		for (let tour = 0; tour < 14; tour++) {
			for (const p of LIBRES) {
				for (const sens of [1, -1]) {
					const v = Math.min(
						p.max,
						Math.max(
							p.min,
							p.lit(h) * (1 + sens * pas) + (p.lit(h) === 0 ? sens * 0.01 : 0),
						),
					);
					const essai = p.ecrit(h, v);
					const l = perte(tout(essai));
					if (l < meilleure - 1e-9) {
						meilleure = l;
						h = essai;
						break;
					}
				}
			}
			console.error(
				`tour ${tour} pas ${pas.toFixed(3)} perte ${meilleure.toFixed(1)}`,
			);
			pas *= 0.75;
		}
		for (const p of LIBRES) console.log(`${p.nom} = ${p.lit(h).toFixed(4)}`);
	}
	// Les valeurs publiées sont arrondies : on mesure ce qui sera réellement enregistré.
	h = JSON.parse(
		JSON.stringify(h, (_, v) =>
			typeof v === "number" ? Number(v.toPrecision(4)) : v,
		),
	) as Hypotheses;
	const mesures = tout(h);
	affiche(mesures);
	recoupe(h);
	if (process.argv.includes("--ecrit")) {
		await Bun.write(
			new URL(
				"../packages/engine/src/generateur/hypotheses.data.json",
				import.meta.url,
			),
			`${JSON.stringify(h, null, "\t")}\n`,
		);
		await Bun.write(
			new URL("../apps/web/src/calage.json", import.meta.url),
			`${JSON.stringify(
				mesures.map((m) => ({
					nom: m.nom,
					modele: Number(m.modele.toPrecision(4)),
					cible: Number(m.cible.toPrecision(4)),
					cale: Number.isFinite(m.echelle),
				})),
				null,
				"\t",
			)}\n`,
		);
		console.log("\nhypotheses.data.json et apps/web/src/calage.json réécrits.");
	}
}
