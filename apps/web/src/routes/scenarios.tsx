import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { DEBUT, FIN, type Fige, figeDe, LOI, solde } from "../accueil";
import { Icon } from "../components/Icons";
import { Info } from "../components/Info";
import { dateEnClair, entier } from "../format";
import { useOrdreProgrammes } from "../ordre";
import { useScenario } from "../scenario";
import {
	DATE_PROGRAMMES,
	PISTES,
	PROGRAMMES,
	programmeDe,
	SANS_SCENARIO,
	type ScenarioType,
} from "../scenarios";

export const Route = createFileRoute("/scenarios")({ component: Scenarios });

/** L'année mise en avant sur chaque carte, la même que sur l'accueil. */
const REPERE = 2050;
/** « manque 45 Md€ » ou « excédent de 12 Md€ ». */
const manque = (md: number) =>
	md < -0.5
		? `manque ${entier(-md)} Md€`
		: md > 0.5
			? `excédent de ${entier(md)} Md€`
			: "à l'équilibre";

const L = 320;
const H = 72;

/** Le solde de tous les régimes d'ici 2070 : le scénario en trait plein, la loi actuelle en pointillé. */
function Solde({ fige }: { fige: Fige }) {
	const tous = [...LOI.soldes, ...fige.soldes];
	const y0 = Math.min(0, ...tous);
	const y1 = Math.max(0, ...tous);
	const px = (i: number) => 2 + (i / (fige.soldes.length - 1)) * (L - 4);
	const py = (y: number) => 6 + (1 - (y - y0) / (y1 - y0 || 1)) * (H - 22);
	const trace = (soldes: number[]) =>
		soldes
			.map((y, i) => `${i ? "L" : "M"}${px(i).toFixed(1)} ${py(y).toFixed(1)}`)
			.join(" ");
	return (
		<svg
			viewBox={`0 0 ${L} ${H}`}
			role="img"
			aria-label={`Solde de tous les régimes de retraite, de ${DEBUT} à ${FIN}`}
		>
			<line x1={2} x2={L - 2} y1={py(0)} y2={py(0)} className="zero" />
			<path d={trace(LOI.soldes)} className="reference" />
			<path d={trace(fige.soldes)} className="scenario" />
			<text x={2} y={H - 2} className="axe">
				{DEBUT}
			</text>
			<text x={L - 2} y={H - 2} className="axe" textAnchor="end">
				{FIN}
			</text>
		</svg>
	);
}

function Carte({ s }: { s: ScenarioType }) {
	const { remplacer, setAnnee } = useScenario();
	const p = programmeDe(s.id);
	const fige = figeDe(s.id);
	const navigate = useNavigate();
	const [copie, setCopie] = useState(false);
	const ouvrir = () => {
		// La même année que la carte : le chiffre retrouvé sur Simuler est celui qu'on a touché.
		remplacer(s.reglages);
		setAnnee(REPERE);
		navigate({
			to: "/simuler",
			search: { ...s.reglages, annee: REPERE } as never,
		});
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
	if (!fige) return null;
	const md = solde(fige, REPERE);
	const ecart = md - solde(LOI, REPERE);
	return (
		<article className="scenario-type" id={s.id}>
			<header>
				{p && (
					<p className="qui">
						{p.candidats.map((c, i) => (
							<span key={c.nom}>
								{i > 0 && " · "}
								<strong>{c.nom}</strong> <small>{c.parti}</small>
							</span>
						))}
					</p>
				)}
				<h3>{s.titre}</h3>
			</header>
			<p className="chiffre num">
				<small>En {REPERE}</small>
				<strong>{manque(md)}</strong>
				{Math.abs(ecart) >= 0.5 && (
					<em className={ecart > 0 ? "mieux" : "pire"}>
						{entier(Math.abs(ecart))} Md€ de {ecart > 0 ? "moins" : "plus"} que
						la loi actuelle
					</em>
				)}
			</p>
			<figure>
				<Solde fige={fige} />
			</figure>
			<footer>
				<button type="button" className="lien" onClick={ouvrir}>
					{p ? "Détail, sources, ajuster" : "Détail, ajuster"}
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
	const ordre = useOrdreProgrammes();
	return (
		<main className="wrap large">
			<div className="titre-page">
				<div className="titre-info">
					<h1>Les programmes de 2027, côte à côte</h1>
					<Info label="Comment lire ces cartes">
						Chaque programme est appliqué à partir de 2028 et suivi jusqu'en{" "}
						{FIN}. Seules les mesures que le simulateur sait régler sont
						comptées : ouvrez un programme pour voir ce qui est repris ou non.
						Ordre tiré au sort sur votre appareil.
					</Info>
				</div>
				<p className="sub">
					Courbes : le solde par an. En pointillé, la loi actuelle (manque{" "}
					{entier(-solde(LOI, REPERE))} Md€ en {REPERE}).
				</p>
			</div>
			<section className="rubrique" aria-label="Programmes de 2027">
				<div className="scenarios-types">
					{ordre
						? ordre.map((s) => <Carte key={s.id} s={s} />)
						: PROGRAMMES.map((s) => (
								<div
									key={s.id}
									className="histo attente"
									style={{ height: 330 }}
								/>
							))}
				</div>
				<details className="sans-scenario">
					<summary>
						{SANS_SCENARIO.length} candidats sans scénario, et pourquoi
					</summary>
					<ul>
						{SANS_SCENARIO.map((c) => (
							<li key={c.nom}>
								<strong>{c.nom}</strong> ({c.parti}) : {c.raison}{" "}
								<a href={c.url} rel="noreferrer">
									Source
								</a>
							</li>
						))}
					</ul>
				</details>
				<p className="reserve">
					Sources lues le {dateEnClair(DATE_PROGRAMMES)}. Une erreur, un
					programme qui a changé ?{" "}
					<a href="https://github.com/waltoss/nos-retraites/issues">
						Signalez-le
					</a>
					.
				</p>
			</section>
			<section className="rubrique">
				<h2>Autres pistes du débat</h2>
				<p className="sub">
					Le programme de personne : chacune pousse un seul terme de l'équation.
				</p>
				<div className="scenarios-types">
					{PISTES.map((s) => (
						<Carte key={s.id} s={s} />
					))}
				</div>
			</section>
			<aside className="note">
				<Icon name="attention" />
				<p>
					<strong>Des ordres de grandeur, pas des chiffrages.</strong> Les
					salariés du privé et les fonctionnaires sont simulés ; les autres
					régimes suivent les règles communes à tous. Le modèle ne dit rien de
					l'effet d'une hausse de cotisations sur l'emploi, ni de ce que
					coûteraient les politiques qui feraient reculer le chômage.
				</p>
			</aside>
		</main>
	);
}
