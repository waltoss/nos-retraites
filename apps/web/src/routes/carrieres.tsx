import {
	BAREMES_FRANCE,
	type Carriere,
	detail,
	detailFonctionPublique,
	estIndependant,
	moisParEtat,
	type Pension,
} from "@nos-retraites/engine";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Avatar } from "../components/Avatar";
import { Frise } from "../components/Frise";
import { Icon } from "../components/Icons";
import type {
	ChampSimule,
	DetailPortrait,
	FiltrePortraits,
	ResumePortrait,
} from "../engine.worker";
import {
	ageEnClair,
	decimal,
	ecart,
	entier,
	euros,
	personnes,
} from "../format";
import { persona } from "../personas";
import { useScenario } from "../scenario";

export const Route = createFileRoute("/carrieres")({ component: Carrieres });

const CHAMPS: { id: ChampSimule; label: string }[] = [
	{ id: "prive", label: "Salariés du privé" },
	{ id: "public", label: "Fonctionnaires et militaires" },
];
/** Habillage d'un portrait : pour un fonctionnaire, le métier se déduit de sa catégorie et de ses primes. */
function habillage(p: ResumePortrait): {
	prenom: string;
	metier: string | null;
} {
	const qui = persona(p);
	const f = p.fonctionPublique;
	if (!f) return qui;
	const femme = p.sexe === "F";
	const metier =
		f.regime === "militaire"
			? "militaire"
			: f.categorie === "superActif"
				? femme
					? "policière"
					: "policier"
				: f.regime === "cnracl"
					? f.categorie === "actif"
						? femme
							? "aide-soignante à l'hôpital"
							: "aide-soignant à l'hôpital"
						: femme
							? "agente d'une collectivité"
							: "agent d'une collectivité"
					: f.categorie === "actif"
						? femme
							? "institutrice ou douanière"
							: "instituteur ou douanier"
						: f.partPrimes < 0.3
							? femme
								? "professeure"
								: "professeur"
							: femme
								? "agente d'un ministère"
								: "agent d'un ministère";
	return { prenom: qui.prenom, metier };
}

const SEXES: { id: FiltrePortraits["sexe"]; label: string }[] = [
	{ id: "tous", label: "Tout le monde" },
	{ id: "F", label: "Femmes" },
	{ id: "H", label: "Hommes" },
];
const AGES: { id: FiltrePortraits["ages"]; label: string; texte: string }[] = [
	{ id: "seniors", label: "60 ans et plus", texte: "de 60 ans et plus" },
	{ id: "actifs", label: "40 à 59 ans", texte: "de 40 à 59 ans" },
	{ id: "jeunes", label: "20 à 39 ans", texte: "de 20 à 39 ans" },
];
const NIVEAUX: { id: FiltrePortraits["niveau"]; label: string }[] = [
	{ id: "tous", label: "Toutes les pensions" },
	{ id: "bas", label: "Petites" },
	{ id: "milieu", label: "Moyennes" },
	{ id: "haut", label: "Hautes" },
	{ id: "touches", label: "Les plus touchées par votre scénario" },
];

const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? "s" : ""}`;

function Carrieres() {
	const { pret, demander, scenario, modifies } = useScenario();
	const [filtre, setFiltre] = useState<FiltrePortraits>({
		champ: "prive",
		sexe: "tous",
		niveau: "tous",
		ages: "seniors",
	});
	const [liste, setListe] = useState<{
		portraits: ResumePortrait[];
		total: number;
	} | null>(null);
	const [choisi, setChoisi] = useState<number | null>(null);
	const [detail, setDetail] = useState<DetailPortrait | null>(null);

	useEffect(() => {
		if (!pret) return;
		let actif = true;
		demander({ type: "portraits", scenario, filtre, nombre: 12 }).then((r) => {
			if (!actif) return;
			setListe({ portraits: r.portraits, total: r.total });
			setChoisi((c) =>
				c !== null && r.portraits.some((p) => p.id === c)
					? c
					: (r.portraits[0]?.id ?? null),
			);
		});
		return () => {
			actif = false;
		};
	}, [pret, demander, scenario, filtre]);

	useEffect(() => {
		if (!pret || choisi === null) return;
		let actif = true;
		demander({
			type: "portrait",
			scenario,
			individu: choisi,
			champ: filtre.champ,
		}).then((r) => {
			if (actif) setDetail(r.detail);
		});
		return () => {
			actif = false;
		};
	}, [pret, demander, scenario, choisi, filtre.champ]);

	return (
		<main className="wrap large">
			<div className="titre-page">
				<h1>Des vies, année par année</h1>
				<p className="sub">
					Ces personnes n'existent pas : le modèle les a inventées, avec leurs
					emplois, leurs enfants et leurs salaires. Ouvrez-en une pour suivre le
					calcul de sa pension
					{modifies > 0
						? ", avec la loi actuelle puis avec votre scénario"
						: ""}
					. Un scénario ne change rien pour ceux qui sont partis avant 2028.
				</p>
			</div>

			<div className="filtres">
				<fieldset>
					<legend>Statut</legend>
					{CHAMPS.map((c) => (
						<button
							type="button"
							key={c.id}
							className={filtre.champ === c.id ? "puce actif" : "puce"}
							onClick={() => {
								setChoisi(null);
								setDetail(null);
								setFiltre({ ...filtre, champ: c.id });
							}}
						>
							{c.label}
						</button>
					))}
				</fieldset>
				<fieldset>
					<legend>Qui</legend>
					{SEXES.map((s) => (
						<button
							type="button"
							key={s.id}
							className={filtre.sexe === s.id ? "puce actif" : "puce"}
							onClick={() => setFiltre({ ...filtre, sexe: s.id })}
						>
							{s.label}
						</button>
					))}
				</fieldset>
				<fieldset>
					<legend>Âge en 2026</legend>
					{AGES.map((a) => (
						<button
							type="button"
							key={a.id}
							className={filtre.ages === a.id ? "puce actif" : "puce"}
							onClick={() => setFiltre({ ...filtre, ages: a.id })}
						>
							{a.label}
						</button>
					))}
				</fieldset>
				<fieldset>
					<legend>Pension</legend>
					{NIVEAUX.filter((n) => n.id !== "touches" || modifies > 0).map(
						(n) => (
							<button
								type="button"
								key={n.id}
								className={filtre.niveau === n.id ? "puce actif" : "puce"}
								onClick={() => setFiltre({ ...filtre, niveau: n.id })}
							>
								{n.label}
							</button>
						),
					)}
				</fieldset>
			</div>

			<div className="portraits">
				<div className="liste">
					{liste ? (
						liste.portraits.map((p) => (
							<button
								type="button"
								key={p.id}
								aria-pressed={p.id === choisi}
								className={p.id === choisi ? "portrait actif" : "portrait"}
								onClick={() => setChoisi(p.id)}
							>
								<Avatar
									id={p.id}
									sexe={p.sexe}
									age={BAREMES_FRANCE.anneeReference - p.anneeNaissance}
								/>
								<span className="qui">
									<span className="nom">
										{habillage(p).prenom},{" "}
										{BAREMES_FRANCE.anneeReference - p.anneeNaissance} ans
									</span>
									<small>
										{habillage(p).metier ?? "a peu travaillé en France"}
									</small>
									{p.represente !== null && (
										<small
											className="represente"
											title={`Environ ${personnes(Math.round(p.represente / 1e5) * 1e5)} personnes de sa tranche d'âge ont une situation voisine`}
										>
											<Icon name="population" size={14} />
											{personnes(Math.round(p.represente / 1e5) * 1e5)}
											<span className="sr">
												{" "}
												personnes dans une situation voisine
											</span>
										</small>
									)}
								</span>
								<span className="num combien">
									{modifies > 0 &&
										ecart(
											p.scenario.mensuelle,
											p.reference.mensuelle,
											euros,
											5,
										) && (
											<em title="Écart avec la loi actuelle">
												{ecart(
													p.scenario.mensuelle,
													p.reference.mensuelle,
													euros,
													5,
												)}
											</em>
										)}
									<span className="montant">{euros(p.scenario.mensuelle)}</span>
									<small title="Âge de départ à la retraite">
										<Icon name="age" size={14} />
										<span className="sr">départ à </span>
										{ageEnClair(p.scenario.age)}
									</small>
								</span>
							</button>
						))
					) : (
						<div className="histo attente" style={{ height: 400 }} />
					)}
					{liste && (
						<p className="reserve">
							{entier(liste.portraits.length)} carrières, de la plus petite
							pension à la plus grande. Sous chaque métier, le nombre de
							personnes dans une situation voisine ; sous la pension, l'âge de
							départ. Chacune tient lieu d'une part égale des{" "}
							{personnes(liste.total)}{" "}
							{filtre.champ === "public"
								? "de fonctionnaires et anciens fonctionnaires"
								: "de salariés et anciens salariés du privé"}{" "}
							{AGES.find((a) => a.id === filtre.ages)?.texte}. Pour ceux qui ne
							sont pas encore partis, c'est la pension qu'ils auront, en euros
							de 2026. Les prénoms et les métiers sont des exemples : le modèle
							ne connaît que les salaires et les périodes d'emploi.
						</p>
					)}
				</div>

				<div className="fiche">
					{detail &&
					detail.id === choisi &&
					detail.champ === (filtre.champ ?? "prive") ? (
						<Fiche
							detail={detail}
							resume={liste?.portraits.find((p) => p.id === choisi)}
							compare={modifies > 0}
						/>
					) : (
						<div className="histo attente" style={{ height: 520 }} />
					)}
				</div>
			</div>
		</main>
	);
}

const duree = (mois: number) =>
	mois >= 12 ? pluriel(Math.round(mois / 12), "an") : `${mois} mois`;

function recit(c: Carriere, ageDepart: number): string {
	const regime = c.fonctionPublique?.regime;
	if (c.fonctionPublique?.regime === "militaire") {
		const entree = c.annees.find((a) => a.affiliation === regime);
		const ageEntree = (entree?.annee ?? c.anneeNaissance) - c.anneeNaissance;
		return `${c.sexe === "F" ? "Née" : "Né"} en ${c.anneeNaissance}, ${c.enfants.length === 0 ? "sans enfant" : pluriel(c.enfants.length, "enfant")}. ${c.sexe === "F" ? "Engagée" : "Engagé"} à ${ageEntree} ans, quitte l'armée à ${c.fonctionPublique.ageRadiation} ans avec une pension versée tout de suite. La suite de sa vie active, dans le civil, n'est pas simulée.`;
	}
	if (c.fonctionPublique) {
		const entree = c.annees.find((a) => a.affiliation === regime);
		const ageEntree = (entree?.annee ?? c.anneeNaissance) - c.anneeNaissance;
		const avantEntree = c.annees.filter(
			(a) =>
				a.affiliation === "autre" &&
				a.etat === "emploi" &&
				a.annee < (entree?.annee ?? 0),
		).length;
		const categorie =
			c.fonctionPublique.categorie === "sedentaire" || ageEntree > 40
				? ""
				: " Son emploi est classé en catégorie active : départ possible plus tôt.";
		return `${c.sexe === "F" ? "Née" : "Né"} en ${c.anneeNaissance}, ${c.enfants.length === 0 ? "sans enfant" : pluriel(c.enfants.length, "enfant")}. ${c.sexe === "F" ? "Entrée" : "Entré"} dans la fonction publique à ${ageEntree} ans${avantEntree > 0 ? `, après ${pluriel(avantEntree, "an")} dans un autre régime` : ""}, puis en poste sans interruption jusqu'au départ.${categorie}`;
	}
	const avant = c.annees.filter(
		(a) => a.annee - c.anneeNaissance < Math.floor(ageDepart / 4),
	);
	const mois = { emploi: 0, chomage: 0, maladie: 0, inactivite: 0 };
	for (const a of avant) {
		const m = moisParEtat(a);
		mois.emploi += m.emploi;
		mois.chomage += m.chomage;
		mois.maladie += m.maladie;
		mois.inactivite += 12 - m.emploi - m.chomage - m.maladie;
	}
	const debut = (avant[0]?.annee ?? c.anneeNaissance) - c.anneeNaissance;
	const metier = avant.find(estIndependant)?.affiliation;
	const anneesIndependant = avant.filter(estIndependant).length;
	const morceaux = [
		`${duree(mois.emploi)} en emploi${metier ? `, dont ${pluriel(anneesIndependant, "an")} comme ${metier === "artisan" ? "artisan" : "commerçant"}` : ""}`,
	];
	if (mois.chomage) morceaux.push(`${duree(mois.chomage)} au chômage`);
	if (mois.maladie)
		morceaux.push(`${duree(mois.maladie)} en maladie ou maternité`);
	if (mois.inactivite) morceaux.push(`${duree(mois.inactivite)} sans activité`);
	return `${c.sexe === "F" ? "Née" : "Né"} en ${c.anneeNaissance}, ${c.enfants.length === 0 ? "sans enfant" : pluriel(c.enfants.length, "enfant")}. Premier emploi à ${debut} ans. Avant son départ : ${morceaux.join(", ")}.`;
}

interface Ligne {
	nom: string;
	aide?: string;
	valeur: (p: Pension) => string;
	fort?: boolean;
}

interface Bloc {
	titre: string;
	lignes: Ligne[];
	/** Absent, le bloc s'affiche toujours. */
	si?: (p: Pension) => boolean;
}

const LIGNES: Bloc[] = [
	{
		titre: "Le départ",
		lignes: [
			{
				nom: "Âge de départ",
				valeur: (p) =>
					`${ageEnClair(p.liquidation.age)}${detail(p, "cnav").motif === "carriereLongue" ? ", carrière longue" : detail(p, "cnav").motif === "inaptitude" ? ", inaptitude" : ""}`,
			},
			{
				nom: "Trimestres cotisés",
				aide: "par le travail dans le privé",
				valeur: (p) => entier(detail(p, "cnav").trimestresCotises),
			},
			{
				nom: "Trimestres dans d'autres régimes",
				aide: "fonction publique, indépendants, agriculture",
				valeur: (p) => entier(detail(p, "cnav").trimestresAutresRegimes),
			},
			{
				nom: "Trimestres assimilés",
				aide: "chômage, maladie, maternité",
				valeur: (p) =>
					entier(
						detail(p, "cnav").trimestresValides -
							detail(p, "cnav").trimestresCotises -
							detail(p, "cnav").trimestresAutresRegimes -
							detail(p, "cnav").trimestresMda,
					),
			},
			{
				nom: "Trimestres pour enfants",
				valeur: (p) => entier(detail(p, "cnav").trimestresMda),
			},
			{
				nom: "Durée validée sur durée requise",
				valeur: (p) =>
					`${entier(detail(p, "cnav").trimestresValides)} sur ${entier(detail(p, "cnav").dureeRequise)}`,
			},
		],
	},
	{
		titre: "La pension de base",
		lignes: [
			{
				nom: "Salaire annuel moyen",
				aide: "meilleures années, plafonnées et revalorisées",
				valeur: (p) => euros(detail(p, "cnav").salaireAnnuelMoyen),
			},
			{
				nom: "Taux",
				aide: "après décote éventuelle",
				valeur: (p) =>
					`${decimal(detail(p, "cnav").tauxLiquidation * 100)} %${detail(p, "cnav").trimestresDecote ? ` (${detail(p, "cnav").trimestresDecote} trimestres manquants)` : ""}`,
			},
			{
				nom: "Part de carrière validée",
				aide: "proratisation",
				valeur: (p) => `${entier(detail(p, "cnav").proratisation * 100)} %`,
			},
			{
				nom: "Minimum contributif",
				valeur: (p) =>
					detail(p, "cnav").minimumContributifApplique ? "appliqué" : "non",
			},
			{
				nom: "Majoration pour enfants",
				valeur: (p) =>
					detail(p, "cnav").majorationEnfants
						? `+${entier(detail(p, "cnav").majorationEnfants * 100)} %`
						: "aucune",
			},
			{
				nom: "Pension de base",
				aide: "par mois",
				valeur: (p) => euros(detail(p, "cnav").pensionAnnuelle / 12),
				fort: true,
			},
		],
	},
	{
		titre: "La pension complémentaire",
		lignes: [
			{
				nom: "Points acquis",
				valeur: (p) => entier(detail(p, "agircArrco").points),
			},
			{
				nom: "Minoration pour départ anticipé",
				valeur: (p) =>
					detail(p, "agircArrco").coefficientAnticipation < 1
						? `−${decimal((1 - detail(p, "agircArrco").coefficientAnticipation) * 100)} %`
						: "aucune",
			},
			{
				nom: "Pension complémentaire",
				aide: "par mois",
				valeur: (p) => euros(detail(p, "agircArrco").pensionAnnuelle / 12),
				fort: true,
			},
		],
	},
	{
		titre: "Les années d'artisan ou de commerçant",
		si: (p) => p.parRegime.ssi !== undefined,
		lignes: [
			{
				nom: "Trimestres comme indépendant",
				valeur: (p) => entier(p.parRegime.ssi?.trimestresCotises ?? 0),
			},
			{
				nom: "Retraite de base des indépendants",
				aide: "par mois, calculée comme au régime général",
				valeur: (p) => euros((p.parRegime.ssi?.pensionAnnuelle ?? 0) / 12),
				fort: true,
			},
			{
				nom: "Points de retraite complémentaire",
				valeur: (p) => entier(p.parRegime.rci?.points ?? 0),
			},
			{
				nom: "Retraite complémentaire des indépendants",
				aide: "par mois ; un capital versé une fois sous 40 points",
				valeur: (p) =>
					p.parRegime.rci?.versementUnique
						? "capital"
						: euros((p.parRegime.rci?.pensionAnnuelle ?? 0) / 12),
				fort: true,
			},
		],
	},
	{
		titre: "Au total",
		lignes: [
			{
				nom: "Pension brute",
				aide: "par mois",
				valeur: (p) => euros(p.mensuelleBrute),
				fort: true,
			},
		],
	},
];

const LIGNES_PUBLIC: Bloc[] = [
	{
		titre: "Le départ",
		lignes: [
			{
				nom: "Âge de départ",
				valeur: (p) => ageEnClair(p.liquidation.age),
			},
			{
				nom: "Trimestres de services",
				aide: "dans la fonction publique",
				valeur: (p) => entier(detailFonctionPublique(p)?.services ?? 0),
			},
			{
				nom: "Bonifications",
				aide: "pour enfants",
				valeur: (p) => entier(detailFonctionPublique(p)?.bonifications ?? 0),
			},
			{
				nom: "Durée tous régimes sur durée requise",
				aide: "avec les années passées ailleurs",
				valeur: (p) =>
					`${entier(detailFonctionPublique(p)?.trimestresValides ?? 0)} sur ${entier(detailFonctionPublique(p)?.dureeRequise ?? 0)}`,
			},
		],
	},
	{
		titre: "La pension de fonctionnaire",
		lignes: [
			{
				nom: "Traitement de référence",
				aide: "par mois, sans les primes sauf si votre scénario les compte",
				valeur: (p) =>
					euros((detailFonctionPublique(p)?.traitementDeReference ?? 0) / 12),
			},
			{
				nom: "Taux",
				aide: "75 % × services et bonifications sur durée requise",
				valeur: (p) =>
					`${decimal((detailFonctionPublique(p)?.tauxLiquidation ?? 0) * 100)} %`,
			},
			{
				nom: "Décote ou surcote",
				valeur: (p) => {
					const d = detailFonctionPublique(p);
					if (d?.trimestresDecote)
						return `décote, ${d.trimestresDecote} trimestres manquants`;
					if (d?.trimestresSurcote)
						return `surcote, ${d.trimestresSurcote} trimestres en plus`;
					return "aucune";
				},
			},
			{
				nom: "Minimum garanti",
				valeur: (p) =>
					detailFonctionPublique(p)?.minimumGarantiApplique
						? "appliqué"
						: "non",
			},
			{
				nom: "Majoration pour enfants",
				valeur: (p) => {
					const majoration = detailFonctionPublique(p)?.majorationEnfants;
					return majoration ? `+${entier(majoration * 100)} %` : "aucune";
				},
			},
			{
				nom: "Pension de fonctionnaire",
				aide: "par mois",
				valeur: (p) =>
					euros((detailFonctionPublique(p)?.pensionAnnuelle ?? 0) / 12),
				fort: true,
			},
		],
	},
	{
		titre: "La retraite additionnelle sur les primes",
		lignes: [
			{
				nom: "Rente",
				aide: "par mois ; un capital versé une fois quand les points sont trop peu nombreux",
				valeur: (p) => {
					const rafp = detailFonctionPublique(p)?.rafp;
					return rafp ? euros(rafp / 12) : "capital";
				},
				fort: true,
			},
		],
	},
	{
		titre: "Au total",
		lignes: [
			{
				nom: "Pension brute",
				aide: "par mois, hors pension du privé pour les années passées ailleurs",
				valeur: (p) => euros(p.mensuelleBrute),
				fort: true,
			},
		],
	},
];

function Fiche({
	detail,
	resume,
	compare,
}: {
	detail: DetailPortrait;
	resume: ResumePortrait | undefined;
	compare: boolean;
}) {
	const { reference, scenario } = detail;
	const qui = resume ? habillage(resume) : null;
	const lignes = scenario.carriere.fonctionPublique ? LIGNES_PUBLIC : LIGNES;
	const c = scenario.carriere;
	return (
		<>
			{resume && qui && (
				<div className="identite">
					<Avatar
						id={resume.id}
						sexe={c.sexe}
						age={BAREMES_FRANCE.anneeReference - c.anneeNaissance}
						size={72}
					/>
					<div>
						<h2>
							{qui.prenom}, {BAREMES_FRANCE.anneeReference - c.anneeNaissance}{" "}
							ans
						</h2>
						<p>
							{qui.metier
								? `Par exemple ${qui.metier}${c.cadre && !qui.metier.startsWith("cadre") ? ", cadre" : ""}.`
								: "A peu travaillé en France."}{" "}
							{resume.represente !== null &&
								`Dans la population, environ ${personnes(Math.round(resume.represente / 1e5) * 1e5)} de personnes de sa tranche d'âge ont une situation voisine.`}
						</p>
					</div>
				</div>
			)}
			<p className="recit">
				{recit(scenario.carriere, scenario.pension.liquidation.age)}
			</p>
			<Frise
				carriere={scenario.carriere}
				ageDepart={scenario.pension.liquidation.age}
				autreAgeDepart={compare ? reference.pension.liquidation.age : undefined}
			/>
			{compare &&
				scenario.pension.liquidation.age !==
					reference.pension.liquidation.age && (
					<p className="reserve">
						Le trait plein marque le départ dans votre scénario (
						{ageEnClair(scenario.pension.liquidation.age)}), le trait pointillé
						le départ avec la loi actuelle (
						{ageEnClair(reference.pension.liquidation.age)}).
					</p>
				)}
			<table className="table calcul">
				<thead>
					<tr>
						<th />
						{compare && <th>Loi actuelle</th>}
						<th>{compare ? "Votre scénario" : "Loi actuelle"}</th>
					</tr>
				</thead>
				{lignes
					.filter((bloc) => !bloc.si || bloc.si(scenario.pension))
					.map((bloc) => (
						<tbody key={bloc.titre}>
							<tr className="groupe">
								<th colSpan={compare ? 3 : 2}>{bloc.titre}</th>
							</tr>
							{bloc.lignes.map((l) => {
								const a = l.valeur(reference.pension);
								const b = l.valeur(scenario.pension);
								return (
									<tr
										key={l.nom}
										className={`${l.fort ? "fort" : ""}${compare && a !== b ? " change" : ""}`}
									>
										<th>
											{l.nom}
											{l.aide && <small>{l.aide}</small>}
										</th>
										{compare && <td className="num">{a}</td>}
										<td className="num">{b}</td>
									</tr>
								);
							})}
						</tbody>
					))}
			</table>
			<p className="reserve">
				<Icon name="attention" size={16} /> Montants bruts en euros de 2026. Le
				comportement de départ est simplifié : un tirage propre à chacun décide
				s'il part avec une décote, au taux plein, ou un peu après.
			</p>
		</>
	);
}
