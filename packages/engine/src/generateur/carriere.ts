import { type Baremes, valeur } from "../baremes/types.ts";
import { quantileNormal, type Rng } from "../rng.ts";
import type { AnneeCarriere, Carriere, Etat, Sexe } from "../types.ts";
import ecartSalaire from "./ecartSalaire.data.json" with { type: "json" };
import emploiSeniors from "./emploiSeniors.data.json" with { type: "json" };
import type { Hypotheses } from "./hypotheses.ts";
import salaireMoyen from "./salaireMoyen.data.json" with { type: "json" };
import tempsPartielData from "./tempsPartiel.data.json" with { type: "json" };

/** Le salaire des femmes rapporté à celui des hommes, en indice de la dernière année connue (Insee). */
const INDICE_ECART = ecartSalaire.indice as Record<string, number>;
const PREMIERE_ANNEE_ECART = Math.min(...Object.keys(INDICE_ECART).map(Number));
/** Part du chemin parcouru par le taux d'emploi des 55-59 ans depuis la première année connue. */
const PROGRESSION_SENIORS = emploiSeniors.progression as Record<string, number>;
const progressionSeniors = (annee: number): number =>
	annee <= emploiSeniors.debut
		? 0
		: annee >= emploiSeniors.fin
			? 1
			: (PROGRESSION_SENIORS[annee] ?? 1);

/** Part des salariés à temps partiel par sexe et par année, et quotité moyenne (Dares, Insee). */
const PARTS_TEMPS_PARTIEL = {
	F: tempsPartielData.femmes as Record<string, number>,
	H: tempsPartielData.hommes as Record<string, number>,
};
const ANNEES_TEMPS_PARTIEL = Object.keys(PARTS_TEMPS_PARTIEL.F).map(Number);
const BORNES_TEMPS_PARTIEL = [
	Math.min(...ANNEES_TEMPS_PARTIEL),
	Math.max(...ANNEES_TEMPS_PARTIEL),
] as const;
const partTempsPartiel = (sexe: Sexe, annee: number): number =>
	PARTS_TEMPS_PARTIEL[sexe][
		Math.max(BORNES_TEMPS_PARTIEL[0], Math.min(BORNES_TEMPS_PARTIEL[1], annee))
	] ?? 0;
const QUOTITE_TEMPS_PARTIEL = tempsPartielData.quotite as Record<Sexe, number>;

/** Le salaire moyen rapporté au plafond de la Sécurité sociale, en indice de l'année des salaires calés. */
const INDICE_SALAIRE = salaireMoyen.indice as Record<string, number>;
const PREMIERE_ANNEE_SALAIRE = Math.min(
	...Object.keys(INDICE_SALAIRE).map(Number),
);
const indiceSalaire = (annee: number): number =>
	annee >= salaireMoyen.derniereAnnee
		? 1
		: (INDICE_SALAIRE[Math.max(PREMIERE_ANNEE_SALAIRE, annee)] ?? 1);
const indiceEcart = (annee: number): number =>
	annee >= ecartSalaire.derniereAnnee
		? 1
		: (INDICE_ECART[Math.max(PREMIERE_ANNEE_ECART, annee)] ?? 1);

const AGE_FIN = 70;

function interpole(
	points: ReadonlyArray<readonly [number, number]>,
	x: number,
): number {
	const premier = points[0];
	const dernier = points[points.length - 1];
	if (!premier || !dernier) return 0;
	if (x <= premier[0]) return premier[1];
	for (let i = 1; i < points.length; i++) {
		const a = points[i - 1] as readonly [number, number];
		const b = points[i] as readonly [number, number];
		if (x <= b[0]) return a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0]);
	}
	return dernier[1];
}

function tire(repartition: ReadonlyArray<number>, u: number): number {
	let cumul = 0;
	for (let i = 0; i < repartition.length; i++) {
		cumul += repartition[i] as number;
		if (u < cumul) return i;
	}
	return repartition.length - 1;
}

/** Hypothèses qui changent à partir d'une année : les effets d'un scénario sur l'emploi et les carrières. */
export interface Bascule {
	annee: number;
	hypotheses: Hypotheses;
}

/** Période hors emploi en cours, qui peut déborder sur les années suivantes. */
interface Periode {
	etat: "chomage" | "maladie" | "inactivite";
	/** Mois restants ; Infinity pour un arrêt définitif. */
	reste: number;
	familiale: boolean;
}

const MOIS = 12;

/**
 * Génère la carrière d'un individu, année par année. Dans une année, les mois se partagent
 * entre emploi, chômage, maladie ou maternité, et inactivité.
 * Tous les tirages viennent du générateur fourni, en nombre fixe par année : même graine, même carrière,
 * et deux scénarios restent comparables personne par personne.
 */
export function generateCarriere(
	anneeNaissance: number,
	rng: Rng,
	h: Hypotheses,
	b: Baremes,
	bascule?: Bascule,
): Carriere {
	const pour = (annee: number) =>
		bascule && annee >= bascule.annee ? bascule.hypotheses : h;
	const sexe: Sexe = rng.next() < h.partFemmes ? "F" : "H";
	const rang = rng.normal();
	const ageEntree = Math.round(
		Math.min(
			h.ageEntree.max,
			Math.max(
				h.ageEntree.min,
				h.ageEntree.moyenne +
					interpole(h.decalageEntree, anneeNaissance) +
					h.ageEntree.effetRang * rang +
					h.ageEntree.ecartType * rng.normal(),
			),
		),
	);

	const nbEnfants = tire(h.repartitionEnfants, rng.next());
	const enfants: number[] = [];
	let ageNaissance = Math.max(
		17,
		Math.round(
			h.agePremierEnfant.moyenne +
				h.agePremierEnfant.ecartType * rng.normal() +
				rang,
		),
	);
	for (let i = 0; i < nbEnfants; i++) {
		enfants.push(anneeNaissance + ageNaissance + (sexe === "H" ? 2 : 0));
		ageNaissance += Math.max(1, Math.round(h.ecartEntreEnfants + rng.normal()));
	}
	const tirageTempsPartiel = rng.next();
	const droitAvpf = rng.next() < h.avpf.part;
	const tirageSansRetour = rng.next();
	const tendance = Math.max(
		0,
		1 + h.tendanceInterruption * (anneeNaissance - 1953),
	);
	// Carrière partielle : une fenêtre de présence tirée au hasard dans la vie active.
	const partielle = rng.next() < h.carrierePartielle.part[sexe];
	const dureePresence = Math.round(
		h.carrierePartielle.dureeMin +
			rng.next() *
				(h.carrierePartielle.dureeMax - h.carrierePartielle.dureeMin),
	);
	const debutPresence = Math.round(
		ageEntree + rng.next() * Math.max(0, 62 - dureePresence - ageEntree),
	);
	const present = (age: number) =>
		!partielle || (age >= debutPresence && age < debutPresence + dureePresence);

	// Polypensionné : une partie de la vie active se passe dans un autre régime.
	// Tirages dérivés du rang, pour ne consommer aucun tirage du générateur.
	const derive = (k: number) => (Math.abs(rang) * k) % 1;
	const ailleurs = derive(15485.863) < h.autreRegime.part[sexe];
	const partAilleurs =
		h.autreRegime.dureeMin +
		derive(32452.843) * (h.autreRegime.dureeMax - h.autreRegime.dureeMin);
	const ailleursDabord = derive(49979.687) < 0.5;
	const anneesAilleurs = Math.round(partAilleurs * (62 - ageEntree));
	const dansUnAutreRegime = (age: number) =>
		ailleurs &&
		(ailleursDabord
			? age < ageEntree + anneesAilleurs
			: age >= 62 - anneesAilleurs);

	const annees: AnneeCarriere[] = [];
	let periode: Periode | null = null;
	/** Durée d'une période en mois : loi exponentielle de moyenne donnée, un mois au moins. */
	const duree = (moyenne: number, u: number) =>
		Math.max(1, Math.round(-moyenne * Math.log(1 - Math.min(u, 0.999999))));

	for (let age = ageEntree; age < AGE_FIN; age++) {
		const annee = anneeNaissance + age;
		const hy = pour(annee);
		const tirageEvenement = rng.next();
		const tirageMoment = rng.next();
		const tirageDuree = rng.next();
		const choc = rng.normal();
		const naissance = sexe === "F" && enfants.includes(annee);
		const tirageInterruption = naissance ? rng.next() : 1;

		if (!present(age)) {
			annees.push({
				annee,
				etat: "inactivite",
				salaireBrut: 0,
				moisEmploi: 0,
				moisChomage: 0,
				moisMaladie: 0,
			});
			periode = null;
			continue;
		}

		// Le risque de sortie de l'emploi décroît avec le rang de salaire.
		const risque = hy.risqueRang ** -rang;
		const senior = age >= hy.seniors.age;
		// L'emploi des seniors a beaucoup monté depuis 2010 : l'effet de l'âge recule d'autant.
		const reste = 1 - (1 - hy.seniors.effetFinal) * progressionSeniors(annee);
		const sorties = senior
			? 1 + (hy.seniors.multiplicateurSorties - 1) * reste
			: 1;
		const durees = senior
			? 1 + (hy.seniors.multiplicateurDurees - 1) * reste
			: 1;
		const mois = { emploi: 0, chomage: 0, maladie: 0, inactivite: 0 };
		let moisFamiliaux = 0;
		let curseur = 0;
		const ecoule = (p: Periode) => {
			const k = Math.min(MOIS - curseur, p.reste);
			mois[p.etat] += k;
			if (p.familiale) moisFamiliaux += k;
			curseur += k;
			p.reste -= k;
			return p.reste > 0 ? p : null;
		};
		if (periode) periode = ecoule(periode);

		if (naissance && curseur < MOIS && !periode?.familiale) {
			// Emploi jusqu'à la naissance, congé maternité, puis reprise ou interruption.
			const debut = Math.max(curseur, Math.floor(tirageMoment * MOIS));
			mois.emploi += debut - curseur;
			curseur = debut;
			periode = ecoule({
				etat: "maladie",
				reste: hy.dureeMois.maternite,
				familiale: false,
			});
			if (
				tirageInterruption <
				hy.interruptionNaissance.probabilite * tendance * Math.min(2, risque)
			) {
				const definitive =
					tirageSansRetour < hy.interruptionNaissance.partDefinitive;
				const suite: Periode = {
					etat: "inactivite",
					reste: definitive
						? Number.POSITIVE_INFINITY
						: duree(hy.interruptionNaissance.dureeMois, tirageDuree),
					familiale: true,
				};
				// Si le congé déborde sur l'année suivante, ses derniers mois sont comptés dans l'interruption.
				periode = periode
					? { ...suite, reste: suite.reste + periode.reste, etat: "inactivite" }
					: ecoule(suite);
			}
		} else if (curseur < MOIS && !periode) {
			const pChomage = Math.min(
				0.6,
				hy.depuisEmploi.chomage * risque * sorties,
			);
			const pMaladie = hy.depuisEmploi.maladie * sorties;
			const pInactivite = hy.depuisEmploi.inactivite * sorties;
			let nouvelle: Periode | null = null;
			if (tirageEvenement < pChomage)
				nouvelle = {
					etat: "chomage",
					reste: duree(hy.dureeMois.chomage * durees, tirageDuree),
					familiale: false,
				};
			else if (tirageEvenement < pChomage + pMaladie)
				nouvelle = {
					etat: "maladie",
					reste: duree(hy.dureeMois.maladie * durees, tirageDuree),
					familiale: false,
				};
			else if (tirageEvenement < pChomage + pMaladie + pInactivite)
				nouvelle = {
					etat: "inactivite",
					reste: duree(hy.dureeMois.inactivite * durees, tirageDuree),
					familiale: false,
				};
			if (nouvelle && age > ageEntree) {
				const debut = curseur + Math.floor(tirageMoment * (MOIS - curseur));
				mois.emploi += debut - curseur;
				curseur = debut;
				periode = ecoule(nouvelle);
			}
		}
		mois.emploi += MOIS - curseur;

		let salaireBrut = 0;
		let quotite = 1;
		if (mois.emploi > 0) {
			const jeuneEnfant = enfants.some((n) => annee >= n && annee - n < 12);
			// Temps partiel : les mêmes personnes d'une année sur l'autre, de plus en plus nombreuses
			// à mesure que la part publiée monte ; les mères de jeunes enfants y sont plus exposées.
			const propension =
				sexe === "F"
					? jeuneEnfant
						? hy.tempsPartielFemmes.meres
						: hy.tempsPartielFemmes.autres
					: 1;
			const tempsPartiel =
				tirageTempsPartiel < partTempsPartiel(sexe, annee) * propension;
			quotite = tempsPartiel ? QUOTITE_TEMPS_PARTIEL[sexe] : 1;
			const niveau =
				interpole(hy.profilSalaire, age) *
				hy.niveauSalaire *
				Math.exp(
					hy.sigmaPermanent * rang +
						hy.queueSalaire.pente[sexe] *
							Math.max(0, rang - hy.queueSalaire.seuil) +
						hy.penteRang * rang * (Math.min(age, 55) - 30) +
						hy.sigmaTransitoire * choc,
				) *
				(sexe === "F" ? hy.ecartSalaireFemmes * indiceEcart(annee) : 1);
			const smicAnnuel = valeur(b.cnav.smicHoraire, annee) * hy.heuresAnnuelles;
			const brut = niveau * valeur(b.cnav.pass, annee) * indiceSalaire(annee);
			// Plancher au SMIC, étalé juste au-dessus pour ne pas empiler tous les bas salaires au même euro.
			const pleinTemps =
				brut >= smicAnnuel * (1 + hy.etalementSmic)
					? brut
					: smicAnnuel *
						(1 + hy.etalementSmic * Math.min(1, Math.abs(choc) / 2));
			salaireBrut = (pleinTemps * quotite * mois.emploi) / MOIS;
		}
		// AVPF : mère au foyer avec un enfant de moins de 3 ans, ou de moins de 21 ans à partir de 3 enfants.
		let avpf = false;
		if (moisFamiliaux >= MOIS / 2 && droitAvpf) {
			const nes = enfants.filter((n) => n <= annee);
			const benjamin = annee - Math.max(...nes);
			avpf =
				annee >= 1972 && (benjamin < 3 || (nes.length >= 3 && benjamin < 21));
		}
		const etat: Etat =
			mois.emploi >= Math.max(mois.chomage, mois.maladie, mois.inactivite)
				? "emploi"
				: mois.chomage >= Math.max(mois.maladie, mois.inactivite)
					? "chomage"
					: mois.maladie >= mois.inactivite
						? "maladieMaternite"
						: "inactivite";
		const ligne: AnneeCarriere = {
			annee,
			etat,
			salaireBrut,
			moisEmploi: mois.emploi,
			moisChomage: mois.chomage,
			moisMaladie: mois.maladie,
		};
		if (dansUnAutreRegime(age) && mois.emploi > 0) {
			ligne.salaireBrut = 0;
			ligne.autreRegime = true;
		}
		if (avpf) ligne.avpf = true;
		if (quotite < 1 && !ligne.autreRegime) ligne.quotite = quotite;
		annees.push(ligne);
	}

	return {
		anneeNaissance,
		sexe,
		enfants,
		cadre:
			rang > quantileNormal(1 - interpole(h.partCadres[sexe], anneeNaissance)),
		annees,
		// Dérivé du rang pour ne consommer aucun tirage : la population reste la même qu'avant.
		tirageDepart: (Math.abs(rang) * 7919.123) % 1,
	};
}

/** Carrière type : emploi continu entre deux âges, à un salaire constant en part du PASS. */
export function carriereType(
	anneeNaissance: number,
	ageDebut: number,
	ageFin: number,
	partDuPass: number,
	b: Baremes,
	cadre = partDuPass > 1,
): Carriere {
	const annees: AnneeCarriere[] = [];
	for (let age = ageDebut; age < ageFin; age++) {
		const annee = anneeNaissance + age;
		annees.push({
			annee,
			etat: "emploi",
			salaireBrut: partDuPass * valeur(b.cnav.pass, annee),
		});
	}
	return { anneeNaissance, sexe: "H", enfants: [], cadre, annees };
}
