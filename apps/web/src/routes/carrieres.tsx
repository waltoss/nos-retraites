import {
	BAREMES_FRANCE,
	type Carriere,
	moisParEtat,
	type Pension,
} from "@nos-retraites/engine";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Avatar } from "../components/Avatar";
import { Frise } from "../components/Frise";
import { Icon } from "../components/Icons";
import type {
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
		demander({ type: "portrait", scenario, individu: choisi }).then((r) => {
			if (actif) setDetail(r.detail);
		});
		return () => {
			actif = false;
		};
	}, [pret, demander, scenario, choisi]);

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
										{persona(p).prenom},{" "}
										{BAREMES_FRANCE.anneeReference - p.anneeNaissance} ans
									</span>
									<small>
										{persona(p).metier ?? "a peu travaillé en France"}
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
							{personnes(liste.total)} de salariés et anciens salariés du privé{" "}
							{AGES.find((a) => a.id === filtre.ages)?.texte}. Pour ceux qui ne
							sont pas encore partis, c'est la pension qu'ils auront, en euros
							de 2026. Les prénoms et les métiers sont des exemples : le modèle
							ne connaît que les salaires et les périodes d'emploi.
						</p>
					)}
				</div>

				<div className="fiche">
					{detail && detail.id === choisi ? (
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
	const morceaux = [`${duree(mois.emploi)} en emploi`];
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

const LIGNES: { titre: string; lignes: Ligne[] }[] = [
	{
		titre: "Le départ",
		lignes: [
			{
				nom: "Âge de départ",
				valeur: (p) =>
					`${ageEnClair(p.liquidation.age)}${p.cnav.motif === "carriereLongue" ? ", carrière longue" : p.cnav.motif === "inaptitude" ? ", inaptitude" : ""}`,
			},
			{
				nom: "Trimestres cotisés",
				aide: "par le travail",
				valeur: (p) => entier(p.cnav.trimestresCotises),
			},
			{
				nom: "Trimestres assimilés",
				aide: "chômage, maladie, maternité",
				valeur: (p) =>
					entier(
						p.cnav.trimestresValides -
							p.cnav.trimestresCotises -
							p.cnav.trimestresMda,
					),
			},
			{
				nom: "Trimestres pour enfants",
				valeur: (p) => entier(p.cnav.trimestresMda),
			},
			{
				nom: "Durée validée sur durée requise",
				valeur: (p) =>
					`${entier(p.cnav.trimestresValides)} sur ${entier(p.cnav.dureeRequise)}`,
			},
		],
	},
	{
		titre: "La pension de base",
		lignes: [
			{
				nom: "Salaire annuel moyen",
				aide: "meilleures années, plafonnées et revalorisées",
				valeur: (p) => euros(p.cnav.salaireAnnuelMoyen),
			},
			{
				nom: "Taux",
				aide: "après décote éventuelle",
				valeur: (p) =>
					`${decimal(p.cnav.tauxLiquidation * 100)} %${p.cnav.trimestresDecote ? ` (${p.cnav.trimestresDecote} trimestres manquants)` : ""}`,
			},
			{
				nom: "Part de carrière validée",
				aide: "proratisation",
				valeur: (p) => `${entier(p.cnav.proratisation * 100)} %`,
			},
			{
				nom: "Minimum contributif",
				valeur: (p) => (p.cnav.minimumContributifApplique ? "appliqué" : "non"),
			},
			{
				nom: "Majoration pour enfants",
				valeur: (p) =>
					p.cnav.majorationEnfants
						? `+${entier(p.cnav.majorationEnfants * 100)} %`
						: "aucune",
			},
			{
				nom: "Pension de base",
				aide: "par mois",
				valeur: (p) => euros(p.cnav.pensionAnnuelle / 12),
				fort: true,
			},
		],
	},
	{
		titre: "La pension complémentaire",
		lignes: [
			{ nom: "Points acquis", valeur: (p) => entier(p.agircArrco.points) },
			{
				nom: "Minoration pour départ anticipé",
				valeur: (p) =>
					p.agircArrco.coefficientAnticipation < 1
						? `−${decimal((1 - p.agircArrco.coefficientAnticipation) * 100)} %`
						: "aucune",
			},
			{
				nom: "Pension complémentaire",
				aide: "par mois",
				valeur: (p) => euros(p.agircArrco.pensionAnnuelle / 12),
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
	const qui = resume ? persona(resume) : null;
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
				{LIGNES.map((bloc) => (
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
				comportement de départ est simplifié : chacun part dès qu'il a le taux
				plein, par la durée ou par l'âge.
			</p>
		</>
	);
}
