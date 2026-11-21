import type { Carriere, Pension } from "@nos-retraites/engine";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Frise } from "../components/Frise";
import { Icon } from "../components/Icons";
import type {
	DetailPortrait,
	FiltrePortraits,
	ResumePortrait,
} from "../engine.worker";
import { ageEnClair, decimal, entier, euros, personnes } from "../format";
import { useScenario } from "../scenario";

export const Route = createFileRoute("/carrieres")({ component: Carrieres });

const SEXES: { id: FiltrePortraits["sexe"]; label: string }[] = [
	{ id: "tous", label: "Tout le monde" },
	{ id: "F", label: "Femmes" },
	{ id: "H", label: "Hommes" },
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
					.
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
				<div className="liste" role="listbox" aria-label="Carrières simulées">
					{liste ? (
						liste.portraits.map((p) => (
							<button
								type="button"
								key={p.id}
								role="option"
								aria-selected={p.id === choisi}
								className={p.id === choisi ? "portrait actif" : "portrait"}
								onClick={() => setChoisi(p.id)}
							>
								<span className="qui">
									{p.sexe === "F" ? "Née" : "Né"} en {p.anneeNaissance}
									<small>
										{p.enfants === 0
											? "sans enfant"
											: pluriel(p.enfants, "enfant")}
										{p.cadre ? ", cadre" : ""}
									</small>
								</span>
								<span className="num combien">
									{euros(p.scenario.mensuelle)}
									<small>
										{modifies > 0 &&
										Math.abs(p.scenario.mensuelle - p.reference.mensuelle) >= 5
											? `${euros(p.reference.mensuelle)} avec la loi actuelle`
											: `départ à ${ageEnClair(p.scenario.age)}`}
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
							pension à la plus grande. Elles sont tirées pour représenter à
							parts égales les {personnes(liste.total)} de personnes de 60 ans
							et plus concernées en 2026.
						</p>
					)}
				</div>

				<div className="fiche">
					{detail && detail.id === choisi ? (
						<Fiche detail={detail} compare={modifies > 0} />
					) : (
						<div className="histo attente" style={{ height: 520 }} />
					)}
				</div>
			</div>
		</main>
	);
}

function recit(c: Carriere, ageDepart: number): string {
	const avant = c.annees.filter(
		(a) => a.annee - c.anneeNaissance < Math.floor(ageDepart / 4),
	);
	const compte = (etat: string) => avant.filter((a) => a.etat === etat).length;
	const debut = (avant[0]?.annee ?? c.anneeNaissance) - c.anneeNaissance;
	const morceaux = [`${pluriel(compte("emploi"), "année")} en emploi`];
	if (compte("chomage")) morceaux.push(`${compte("chomage")} au chômage`);
	if (compte("maladieMaternite"))
		morceaux.push(`${compte("maladieMaternite")} en maladie ou maternité`);
	if (compte("inactivite"))
		morceaux.push(`${compte("inactivite")} sans activité`);
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
			{ nom: "Âge de départ", valeur: (p) => ageEnClair(p.liquidation.age) },
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
	compare,
}: {
	detail: DetailPortrait;
	compare: boolean;
}) {
	const { reference, scenario } = detail;
	return (
		<>
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
