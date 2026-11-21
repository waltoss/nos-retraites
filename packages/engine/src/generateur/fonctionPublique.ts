import { type Baremes, valeur } from "../baremes/types.ts";
import type { Rng } from "../rng.ts";
import type {
	AnneeCarriere,
	Carriere,
	CategorieFonctionnaire,
	RegimeFonctionPublique,
	Sexe,
} from "../types.ts";
import type { HypothesesPubliques } from "./hypothesesPubliques.ts";

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
	const regime: RegimeFonctionPublique =
		rng.next() < h.partRegime.sre ? "sre" : "cnracl";
	const sexe: Sexe = rng.next() < h.partFemmes[regime] ? "F" : "H";
	const rang = rng.normal();
	const e = h.entree[regime];
	const ageEntree = Math.min(
		e.max,
		Math.round(e.min - e.delaiMoyen * Math.log(1 - rng.next() * 0.999999)),
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

	const parts = h.categories[regime];
	const partSuper = interpole(parts.superActif, anneeNaissance);
	const partActif = interpole(parts.actif, anneeNaissance);
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
		(regime === "cnracl"
			? h.primes.cnracl
			: enseignant
				? h.primes.enseignants
				: h.primes.autresSre) *
		(1 + h.primes.dispersion * (2 * tiragePrimes - 1));

	const retard =
		t.partAnciennete[regime] * Math.max(0, ageEntree - t.ageEntreeDeReference);
	const annees: AnneeCarriere[] = [];
	for (let age = debut; age < AGE_FIN; age++) {
		const annee = anneeNaissance + age;
		const tirage = rng.next();
		if (age < ageEntree) {
			const valide = tirage < h.partValideeAvantEntree;
			annees.push({
				annee,
				etat: valide ? "emploi" : "inactivite",
				salaireBrut: 0,
				moisEmploi: valide ? 12 : 0,
				moisChomage: 0,
				moisMaladie: 0,
				...(valide ? { autreRegime: true } : {}),
			});
			continue;
		}
		const traitement =
			niveau *
			interpole(t.profil[regime], age - retard) *
			indiceTraitement(annee, h, b);
		const primes = traitement * partPrimes;
		annees.push({
			annee,
			etat: "emploi",
			salaireBrut: traitement + primes,
			primes,
		});
	}
	return {
		anneeNaissance,
		sexe,
		enfants,
		cadre: false,
		annees,
		tirageDepart: (Math.abs(rang) * 7919.123) % 1,
		fonctionPublique: { regime, categorie },
	};
}
