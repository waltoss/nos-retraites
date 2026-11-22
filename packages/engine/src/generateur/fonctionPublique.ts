import { type Baremes, valeur } from "../baremes/types.ts";
import type { Rng } from "../rng.ts";
import {
	type AnneeCarriere,
	type Carriere,
	type CategorieFonctionnaire,
	profilDepuis,
	type RegimeFonctionPublique,
	type Sexe,
} from "../types.ts";
import type { HypothesesPubliques } from "./hypothesesPubliques.ts";
import tempsPartielData from "./tempsPartielPublic.data.json" with {
	type: "json",
};

type TempsPartiel = Record<"F" | "H", { part: number; quotite: number }>;

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

/**
 * Niveau des traitements d'une année, rapporté à l'année de niveau des hypothèses.
 * Jusqu'à l'année de référence : la valeur du point d'indice, plus le glissement des grilles.
 * Ensuite, en euros constants : hypothèse que les traitements suivent les salaires du privé,
 * donc le plafond de la Sécurité sociale.
 */
export function indiceTraitement(
	annee: number,
	h: HypothesesPubliques,
	b: Baremes,
): number {
	const fp = b.fonctionPublique;
	if (!fp) return 1;
	const t = h.traitement;
	const passe = (a: number) =>
		(valeur(fp.valeurPoint, a) / valeur(fp.valeurPoint, t.anneeDeNiveau)) *
		(1 + t.glissementDesGrilles) ** (a - t.anneeDeNiveau);
	if (annee <= b.anneeReference) return passe(annee);
	return (
		(passe(b.anneeReference) * valeur(b.cnav.pass, annee)) /
		valeur(b.cnav.pass, b.anneeReference)
	);
}

/**
 * Génère la carrière d'un fonctionnaire : quelques années dans un autre régime, puis un emploi
 * continu dans la fonction publique jusqu'au départ. Le traitement suit l'âge et un rang permanent ;
 * les primes sont une part du traitement propre à l'individu.
 * Simplifications : ni temps partiel, ni interruption, ni invalidité, ni sortie de la fonction publique.
 */
export function generateCarriereFonctionPublique(
	anneeNaissance: number,
	rng: Rng,
	h: HypothesesPubliques,
	b: Baremes,
): Carriere {
	const tirageRegime = rng.next();
	const regime: RegimeFonctionPublique =
		tirageRegime < h.partRegime.sre
			? "sre"
			: tirageRegime < h.partRegime.sre + h.partRegime.cnracl
				? "cnracl"
				: "militaire";
	const sexe: Sexe = rng.next() < h.partFemmes[regime] ? "F" : "H";
	const rang = rng.normal();
	const e = h.entree[regime];
	const ageEntree = Math.min(
		e.max,
		Math.round(
			e.min -
				interpole(e.delaiMoyen, anneeNaissance) *
					Math.log(1 - rng.next() * 0.999999),
		),
	);
	const debut = Math.min(
		ageEntree,
		Math.max(
			h.debutVieActive[regime].min,
			Math.round(
				h.debutVieActive[regime].moyenne +
					h.debutVieActive[regime].ecartType * rng.normal(),
			),
		),
	);
	const tirageCategorie = rng.next();
	const enseignant = regime === "sre" && rng.next() < h.enseignants.part;
	const tiragePrimes = rng.next();
	// Tirages dérivés du rang : la population reste la même qu'avant l'ajout de l'invalidité.
	const derive = (k: number) => (Math.abs(rang) * k) % 1;
	const inv = h.invalidite[regime];
	const tirageInvalidite =
		derive(15485.863) < inv.part
			? Math.floor(inv.ageMin + derive(32452.843) * (inv.ageMax - inv.ageMin))
			: undefined;
	// Sans objet pour qui n'est pas encore entré dans la fonction publique à cet âge.
	const ageInvalidite =
		tirageInvalidite !== undefined && tirageInvalidite > ageEntree
			? tirageInvalidite
			: undefined;
	// Enfants : mêmes lois simples que le privé, sans effet sur la carrière.
	const tirageEnfants = rng.next();
	const nbEnfants =
		tirageEnfants < 0.17
			? 0
			: tirageEnfants < 0.35
				? 1
				: tirageEnfants < 0.75
					? 2
					: tirageEnfants < 0.93
						? 3
						: 4;
	const enfants: number[] = [];
	let ageNaissance = Math.max(18, Math.round(27 + 4 * rng.normal()));
	for (let i = 0; i < nbEnfants; i++) {
		enfants.push(anneeNaissance + ageNaissance);
		ageNaissance += Math.max(1, Math.round(3 + rng.normal()));
	}

	const parts = regime === "militaire" ? null : h.categories[regime];
	const partSuper = parts ? interpole(parts.superActif, anneeNaissance) : 0;
	const partActif = parts ? interpole(parts.actif, anneeNaissance) : 0;
	// Militaire : il quitte l'armée après un nombre d'années de services tiré une fois pour toutes.
	const mil = h.militaires;
	const ageRadiation =
		regime === "militaire"
			? ageEntree +
				Math.min(
					mil.servicesMax,
					Math.round(
						mil.servicesMin -
							mil.delaiMoyen * Math.log(1 - derive(49979.687) * 0.999999),
					),
				)
			: undefined;
	// Les enseignants d'aujourd'hui sont sédentaires ; les instituteurs d'hier sont dans la part des actifs.
	const categorie: CategorieFonctionnaire =
		tirageCategorie < partSuper
			? "superActif"
			: tirageCategorie < partSuper + partActif
				? "actif"
				: "sedentaire";

	const t = h.traitement;
	const niveau =
		t.niveau[regime] *
		Math.exp(t.sigma[regime] * rang) *
		(sexe === "F" ? interpole(t.ecartFemmes[regime], anneeNaissance) : 1) *
		(regime === "sre"
			? enseignant
				? h.enseignants.traitement
				: h.enseignants.autres
			: 1);
	const partPrimes =
		(regime === "militaire"
			? h.primes.militaire
			: regime === "cnracl"
				? h.primes.cnracl
				: enseignant
					? h.primes.enseignants
					: h.primes.autresSre) *
		(1 + h.primes.dispersion * (2 * tiragePrimes - 1));

	// Temps partiel : les mêmes agents pendant toute la période où il se prend.
	const tp =
		regime === "militaire"
			? null
			: (tempsPartielData[regime] as TempsPartiel)[sexe];
	const aTempsPartiel =
		tp !== null && derive(22801.763) < tp.part * h.tempsPartiel.facteur;
	const retard =
		t.partAnciennete[regime] * Math.max(0, ageEntree - t.ageEntreeDeReference);
	const annees: AnneeCarriere[] = [];
	for (let age = debut; age < AGE_FIN; age++) {
		const annee = anneeNaissance + age;
		const tirage = rng.next();
		if (age < ageEntree) {
			const valide = tirage < h.partValideeAvantEntree;
			// Avant l'entrée : un autre régime, que le modèle ne simule pas.
			annees.push({
				annee,
				affiliation: "autre",
				etat: valide ? "emploi" : "inactivite",
				salaireBrut: 0,
				moisEmploi: valide ? 12 : 0,
				moisChomage: 0,
				moisMaladie: 0,
			});
			continue;
		}
		if (
			(ageInvalidite !== undefined && age >= ageInvalidite) ||
			(ageRadiation !== undefined && age >= ageRadiation)
		) {
			annees.push({
				annee,
				affiliation: regime,
				etat: "inactivite",
				salaireBrut: 0,
				moisEmploi: 0,
				moisChomage: 0,
				moisMaladie: 0,
			});
			continue;
		}
		const traitement =
			niveau *
			interpole(t.profil[regime], age - retard) *
			indiceTraitement(annee, h, b);
		const quotite =
			tp !== null &&
			aTempsPartiel &&
			age >= h.tempsPartiel.ageMin &&
			age < h.tempsPartiel.ageMax
				? tp.quotite
				: 1;
		const primes = traitement * partPrimes * quotite;
		annees.push({
			annee,
			affiliation: regime,
			etat: "emploi",
			salaireBrut: traitement * quotite + primes,
			primes,
			...(quotite < 1 ? { quotite } : {}),
		});
	}
	return {
		anneeNaissance,
		sexe,
		enfants,
		cadre: false,
		annees,
		profil: profilDepuis((Math.abs(rang) * 7919.123) % 1),
		fonctionPublique: {
			regime,
			categorie,
			...(ageInvalidite !== undefined ? { ageInvalidite } : {}),
			...(ageRadiation !== undefined
				? {
						ageRadiation,
						bonifications: Math.round(derive(67867.979) * mil.bonificationsMax),
					}
				: {}),
		},
	};
}
