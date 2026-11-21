import type { AnneeSysteme, Projection } from "@nos-retraites/engine";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Icon } from "../components/Icons";
import { decimal, entier, euros } from "../format";
import {
	coutPolitiquesFamiliales,
	LEVIER,
	type LevierId,
	versScenario,
} from "../leviers";
import { useScenario } from "../scenario";
import { SCENARIOS, type ScenarioType } from "../scenarios";

export const Route = createFileRoute("/scenarios")({ component: Scenarios });

interface Donnees {
	reference: Projection;
	courant: Projection;
	systeme: { reference: AnneeSysteme[]; courant: AnneeSysteme[] };
}

const REPERES = [2030, 2050, 2070];
const GENERATIONS = [1975, 2000];
const signe = (n: number, format: (n: number) => string, seuil: number) =>
	Math.abs(n) < seuil ? "pareil" : `${n > 0 ? "+" : "−"}${format(Math.abs(n))}`;
const milliards = (n: number) => `${entier(n / 1e9)} Md€`;

/** Moyenne sur cinq générations voisines : chacune ne compte que quelques centaines de personnes simulées. */
function generation(p: Projection, annee: number) {
	const voisines = p.generations.filter(
		(g) => Math.abs(g.generation - annee) <= 2,
	);
	const moyenne = (f: (g: (typeof voisines)[number]) => number) =>
		voisines.reduce((t, g) => t + f(g), 0) / Math.max(1, voisines.length);
	return {
		age: moyenne((g) => g.ageMoyenDepart),
		pension: moyenne((g) => g.pensionMoyenne),
	};
}

const L = 320;
const H = 96;

/** Le solde de tous les régimes d'ici 2070 : le scénario en trait plein, la loi actuelle en pointillé. */
function Solde({ systeme }: { systeme: Donnees["systeme"] }) {
	const tous = [...systeme.reference, ...systeme.courant].map((a) => a.solde);
	const y0 = Math.min(0, ...tous);
	const y1 = Math.max(0, ...tous);
	const x0 = systeme.courant[0]?.annee ?? 2026;
	const x1 = systeme.courant.at(-1)?.annee ?? 2070;
	const px = (x: number) => 2 + ((x - x0) / (x1 - x0)) * (L - 4);
	const py = (y: number) => 6 + (1 - (y - y0) / (y1 - y0 || 1)) * (H - 22);
	const trace = (annees: AnneeSysteme[]) =>
		annees
			.map(
				(a, i) =>
					`${i ? "L" : "M"}${px(a.annee).toFixed(1)} ${py(a.solde).toFixed(1)}`,
			)
			.join(" ");
	return (
		<svg
			viewBox={`0 0 ${L} ${H}`}
			role="img"
			aria-label="Solde de tous les régimes de retraite, de 2026 à 2070"
		>
			<line x1={2} x2={L - 2} y1={py(0)} y2={py(0)} className="zero" />
			<path d={trace(systeme.reference)} className="reference" />
			<path d={trace(systeme.courant)} className="scenario" />
			<text x={2} y={H - 2} className="axe">
				{x0}
			</text>
			<text x={L - 2} y={H - 2} className="axe" textAnchor="end">
				{x1}
			</text>
		</svg>
	);
}

function Carte({ s, donnees }: { s: ScenarioType; donnees: Donnees | null }) {
	const { remplacer } = useScenario();
	const navigate = useNavigate();
	const [copie, setCopie] = useState(false);
	const ouvrir = () => {
		remplacer(s.reglages);
		navigate({ to: "/simuler", search: s.reglages as never });
	};
	const copier = async () => {
		const parametres = new URLSearchParams(
			Object.entries(s.reglages).map(([k, v]) => [k, String(v)]),
		);
		await navigator.clipboard.writeText(
			`${window.location.origin}/simuler?${parametres}`,
		);
		setCopie(true);
		setTimeout(() => setCopie(false), 2000);
	};
	const annee = (annees: AnneeSysteme[], a: number) =>
		annees.find((x) => x.annee === a)?.solde ?? 0;
	const cumul = (annees: AnneeSysteme[]) =>
		annees.reduce((t, a) => t + a.solde, 0);
	return (
		<article className="scenario-type">
			<header>
				<h2>{s.titre}</h2>
				<p>{s.texte}</p>
				<ul>
					{(Object.entries(s.reglages) as [LevierId, number][]).map(
						([id, v]) => (
							<li key={id}>
								{LEVIER[id].label} : <strong>{LEVIER[id].affiche(v)}</strong>
							</li>
						),
					)}
				</ul>
				{coutPolitiquesFamiliales(s.reglages) > 0 && (
					<p className="cout">
						Ces politiques coûtent environ{" "}
						{entier(coutPolitiquesFamiliales(s.reglages))} Md€ par an dès 2028,
						payés hors du système de retraite. Ce coût n'est pas déduit du solde
						ci-dessous.
					</p>
				)}
			</header>
			{donnees ? (
				<>
					<figure>
						<figcaption>
							Solde de tous les régimes. En pointillé, la loi actuelle.
						</figcaption>
						<Solde systeme={donnees.systeme} />
					</figure>
					<table className="num">
						<thead>
							<tr>
								<th>Solde annuel</th>
								<th>Ce scénario</th>
								<th>Écart à la loi</th>
							</tr>
						</thead>
						<tbody>
							{REPERES.map((a) => {
								const c = annee(donnees.systeme.courant, a);
								const r = annee(donnees.systeme.reference, a);
								return (
									<tr key={a}>
										<th>en {a}</th>
										<td>{signe(c, milliards, 5e8)}</td>
										<td
											className={
												c - r >= 5e8 ? "mieux" : c - r <= -5e8 ? "pire" : ""
											}
										>
											{signe(c - r, milliards, 5e8)}
										</td>
									</tr>
								);
							})}
							<tr className="total">
								<th>Cumul d'ici 2070</th>
								<td>{signe(cumul(donnees.systeme.courant), milliards, 5e8)}</td>
								<td>
									{signe(
										cumul(donnees.systeme.courant) -
											cumul(donnees.systeme.reference),
										milliards,
										5e8,
									)}
								</td>
							</tr>
						</tbody>
					</table>
					<table className="num">
						<thead>
							<tr>
								<th>Pour ceux nés en</th>
								<th>Âge de départ</th>
								<th>Pension au départ</th>
							</tr>
						</thead>
						<tbody>
							{GENERATIONS.map((g) => {
								const c = generation(donnees.courant, g);
								const r = generation(donnees.reference, g);
								return (
									<tr key={g}>
										<th>{g}</th>
										<td>
											{decimal(c.age)} ans
											<small>
												{signe(c.age - r.age, (n) => `${decimal(n)} an`, 0.05)}
											</small>
										</td>
										<td>
											{euros(c.pension)}
											<small>{signe(c.pension - r.pension, euros, 5)}</small>
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				</>
			) : (
				<div className="histo attente" style={{ height: 300 }} />
			)}
			<footer>
				<button type="button" className="lien" onClick={ouvrir}>
					Ouvrir et ajuster
					<Icon name="fleche" size={16} />
				</button>
				<button type="button" className="lien discret" onClick={copier}>
					{copie ? "Lien copié" : "Copier le lien"}
				</button>
			</footer>
		</article>
	);
}

function Scenarios() {
	const { pret, demander } = useScenario();
	const [donnees, setDonnees] = useState<Record<string, Donnees>>({});

	useEffect(() => {
		if (!pret) return;
		let actif = true;
		// Un scénario après l'autre : les cartes se remplissent au fil du calcul.
		(async () => {
			for (const s of SCENARIOS) {
				const r = await demander({
					type: "projection",
					scenario: versScenario(s.reglages),
				});
				if (!actif) return;
				setDonnees((d) => ({
					...d,
					[s.id]: {
						reference: r.reference,
						courant: r.courant,
						systeme: r.systeme,
					},
				}));
			}
		})();
		return () => {
			actif = false;
		};
	}, [pret, demander]);

	const premiere = Object.values(donnees)[0];
	const loi = premiere?.systeme.reference;
	return (
		<main className="wrap large">
			<div className="titre-page">
				<h1>Les grandes options, côte à côte</h1>
				<p className="sub">
					Neuf façons de répondre à la même question, appliquées à partir de
					2028 et suivies jusqu'en 2070. Aucune n'est la bonne : chacune déplace
					l'effort vers quelqu'un d'autre, ceux qui travaillent, ceux qui sont à
					la retraite, ou ceux qui ne sont pas encore nés.
				</p>
				{loi && (
					<p className="repere num">
						<strong>Avec la loi actuelle</strong>, il manque{" "}
						{REPERES.map((a, i) => (
							<span key={a}>
								{i > 0 && (i === REPERES.length - 1 ? " et " : ", ")}
								{entier(
									Math.abs((loi.find((x) => x.annee === a)?.solde ?? 0) / 1e9),
								)}{" "}
								milliards en {a}
							</span>
						))}
						, tous régimes confondus et en euros de 2026.
					</p>
				)}
			</div>
			<div className="scenarios-types">
				{SCENARIOS.map((s) => (
					<Carte key={s.id} s={s} donnees={donnees[s.id] ?? null} />
				))}
			</div>
			<aside className="note">
				<Icon name="attention" />
				<p>
					<strong>Des ordres de grandeur, pas des chiffrages.</strong> Les
					salariés du privé et les fonctionnaires sont simulés ; les autres
					régimes suivent les règles communes à tous, comme l'âge légal ou la
					revalorisation. Le modèle ne dit rien de l'effet d'une hausse de
					cotisations sur l'emploi, ni de ce que coûteraient les politiques qui
					feraient reculer le chômage.
				</p>
			</aside>
		</main>
	);
}
