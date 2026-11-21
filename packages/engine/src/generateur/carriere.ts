import { type Baremes, valeur } from "../baremes/types.ts";
import type { Rng } from "../rng.ts";
import type { AnneeCarriere, Carriere, Etat, Sexe } from "../types.ts";
import type { Hypotheses } from "./hypotheses.ts";

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

/**
 * Génère la carrière d'un individu, année par année, par transitions entre états.
 * Tous les tirages viennent du générateur fourni : même graine, même carrière.
 */
export function generateCarriere(
	anneeNaissance: number,
	rng: Rng,
	h: Hypotheses,
	b: Baremes,
): Carriere {
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
	const tempsPartiel =
		sexe === "F" && nbEnfants > 0 && rng.next() < h.tempsPartielMeres.part;
	const droitAvpf = rng.next() < h.avpf.part;
	const sansRetour = rng.next() < h.interruptionNaissance.partDefinitive;
	const pInterruption =
		h.interruptionNaissance.probabilite *
		Math.max(0, 1 + h.tendanceInterruption * (anneeNaissance - 1953));
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

	// Le risque de sortie de l'emploi décroît avec le rang de salaire.
	const risque = h.risqueRang ** -rang;
	const annees: AnneeCarriere[] = [];
	let etat: Etat = "emploi";
	let interruptionFamiliale = false;

	for (let age = ageEntree; age < AGE_FIN; age++) {
		const annee = anneeNaissance + age;
		const u = rng.next();
		const choc = rng.normal();
		const senior = age >= h.seniors.age;
		const sorties = senior ? h.seniors.multiplicateurSorties : 1;
		const retours = senior ? 1 / h.seniors.diviseurRetours : 1;
		const naissance = sexe === "F" && enfants.includes(annee);

		if (!present(age)) {
			annees.push({ annee, etat: "inactivite", salaireBrut: 0 });
			if (naissance) rng.next();
			etat = "emploi";
			continue;
		}

		if (age > ageEntree) {
			if (etat === "emploi") {
				const pChomage = Math.min(
					0.5,
					h.depuisEmploi.chomage * risque * sorties,
				);
				const pMaladie = h.depuisEmploi.maladie * sorties;
				const pInactivite = h.depuisEmploi.inactivite * sorties;
				if (u < pChomage) etat = "chomage";
				else if (u < pChomage + pMaladie) etat = "maladieMaternite";
				else if (u < pChomage + pMaladie + pInactivite) etat = "inactivite";
			} else if (etat === "chomage") {
				const pEmploi = h.depuisChomage.emploi * retours;
				if (u < pEmploi) etat = "emploi";
				else if (u < pEmploi + h.depuisChomage.inactivite) etat = "inactivite";
			} else if (etat === "maladieMaternite") {
				const pEmploi = h.depuisMaladie.emploi * retours;
				if (u < pEmploi) etat = "emploi";
				else if (u < pEmploi + h.depuisMaladie.inactivite) etat = "inactivite";
			} else if (etat === "inactivite") {
				const p = interruptionFamiliale
					? sansRetour
						? 0
						: h.interruptionNaissance.retourAnnuel
					: h.depuisInactivite.emploi * retours;
				if (u < p) {
					etat = "emploi";
					interruptionFamiliale = false;
				}
			}
		}
		// Une naissance : congé maternité l'année même, puis interruption possible.
		if (naissance) {
			if (rng.next() < pInterruption * Math.min(2, risque)) {
				etat = "inactivite";
				interruptionFamiliale = true;
			} else if (etat === "emploi") {
				etat = "maladieMaternite";
			}
		} else if (
			etat === "maladieMaternite" &&
			sexe === "F" &&
			enfants.includes(annee - 1)
		) {
			etat = "emploi";
		}

		let salaireBrut = 0;
		let quotiteAnnee = 1;
		if (etat === "emploi") {
			const jeuneEnfant = enfants.some((n) => annee >= n && annee - n < 12);
			const quotite =
				tempsPartiel && jeuneEnfant ? h.tempsPartielMeres.quotite : 1;
			const niveau =
				interpole(h.profilSalaire, age) *
				h.niveauSalaire *
				Math.exp(
					h.sigmaPermanent * rang +
						h.penteRang * rang * (Math.min(age, 55) - 30) +
						h.sigmaTransitoire * choc,
				) *
				(sexe === "F" ? h.ecartSalaireFemmes : 1);
			const smicAnnuel = valeur(b.cnav.smicHoraire, annee) * h.heuresAnnuelles;
			const brut = niveau * valeur(b.cnav.pass, annee);
			// Plancher au SMIC, étalé juste au-dessus pour ne pas empiler tous les bas salaires au même euro.
			salaireBrut =
				(brut >= smicAnnuel * (1 + h.etalementSmic)
					? brut
					: smicAnnuel *
						(1 + h.etalementSmic * Math.min(1, Math.abs(choc) / 2))) * quotite;
			quotiteAnnee = quotite;
		}
		// AVPF : mère au foyer avec un enfant de moins de 3 ans, ou de moins de 21 ans à partir de 3 enfants.
		let avpf = false;
		if (interruptionFamiliale && etat === "inactivite" && droitAvpf) {
			const nes = enfants.filter((n) => n <= annee);
			const benjamin = annee - Math.max(...nes);
			avpf =
				annee >= 1972 && (benjamin < 3 || (nes.length >= 3 && benjamin < 21));
		}
		const ligne: AnneeCarriere = { annee, etat, salaireBrut };
		if (avpf) ligne.avpf = true;
		if (quotiteAnnee < 1) ligne.quotite = quotiteAnnee;
		annees.push(ligne);
	}

	return { anneeNaissance, sexe, enfants, cadre: rang > h.seuilCadre, annees };
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
