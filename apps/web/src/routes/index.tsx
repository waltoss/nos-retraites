import { createFileRoute, Link } from "@tanstack/react-router";
import {
	age,
	cumul,
	type Fige,
	figeDe,
	LOI,
	solde,
	trajectoire,
} from "../accueil";
import { Icon, type IconName } from "../components/Icons";
import { Courbe } from "../components/Trajectoires";
import { decimal, entier } from "../format";
import { ANNEE_EFFET, type Reglages } from "../leviers";
import { useOrdreProgrammes } from "../ordre";
import { useScenario } from "../scenario";
import { PISTES, PROGRAMMES, programmeDe } from "../scenarios";

export const Route = createFileRoute("/")({ component: Home });

/** L'année que l'accueil regarde : assez loin pour que les réformes aient pris effet. */
const REPERE = 2050;

const SUITES: {
	to: "/decisions" | "/carrieres" | "/modele";
	icone: IconName;
	titre: string;
	texte: string;
}[] = [
	{
		to: "/decisions",
		icone: "tableau",
		titre: "Chaque mesure, une par une",
		texte: "Ce que chacune déplace, et de combien.",
	},
	{
		to: "/carrieres",
		icone: "carriere",
		titre: "Des vies, année par année",
		texte: "Le calcul d'une pension, ligne à ligne.",
	},
	{
		to: "/modele",
		icone: "modele",
		titre: "Sous le capot",
		texte: "Les règles, les sources, ce qui manque.",
	},
];

/** « manque 45 Md€ » ou « excédent de 12 Md€ ». */
const manque = (md: number) =>
	md < -0.5
		? `manque ${entier(-md)} Md€`
		: md > 0.5
			? `excédent de ${entier(md)} Md€`
			: "à l'équilibre";

/** Ce qu'il manque dans un scénario, en barre : la plus longue est le plus grand manque de la liste. */
function Ligne({
	nom,
	parti,
	titre,
	fige,
	echelle,
	reglages,
}: {
	nom: string;
	parti?: string;
	titre: string;
	fige: Fige;
	echelle: number;
	/** Les réglages du programme : la ligne ouvre alors Simuler sur eux. */
	reglages?: Reglages;
}) {
	const { remplacer, setAnnee } = useScenario();
	const md = solde(fige, REPERE);
	const contenu = (
		<>
			<span className="qui">
				<strong>{nom}</strong>
				{parti && <small>{parti}</small>}
			</span>
			<span className="quoi">{titre}</span>
			<span className="barre" aria-hidden="true">
				<i
					className={md > 0 ? "plus" : ""}
					style={{ width: `${Math.max(2, (100 * Math.abs(md)) / echelle)}%` }}
				/>
			</span>
			<span className="combien num">
				<b>{manque(md)}</b>
				<small>départ moyen à {decimal(age(fige, REPERE))} ans</small>
			</span>
			{reglages && <Icon name="fleche" size={18} />}
		</>
	);
	return reglages ? (
		<li>
			<Link
				to="/simuler"
				// La même année que la liste : le chiffre retrouvé sur Simuler est celui qu'on a touché.
				search={{ ...reglages, annee: REPERE } as never}
				onClick={() => {
					remplacer(reglages);
					setAnnee(REPERE);
				}}
			>
				{contenu}
			</Link>
		</li>
	) : (
		<li className="loi">
			<div>{contenu}</div>
		</li>
	);
}

function Home() {
	const { modifies } = useScenario();
	const ordre = useOrdreProgrammes();
	const echelle = Math.max(
		...[LOI, ...PROGRAMMES.map((s) => figeDe(s.id) ?? LOI)].map((f) =>
			Math.abs(solde(f, REPERE)),
		),
	);
	return (
		<main className="wrap accueil">
			<section className="hero">
				<img
					src="/photos/generations.jpg"
					alt="Dans un parc, un grand-père accompagne un enfant qui apprend à faire du vélo"
				/>
				<div className="hero-texte">
					<h1>Retraites : que changerait chaque candidat de 2027 ?</h1>
					<p className="manque">
						Si rien ne change, il manquera{" "}
						<strong className="num">
							{entier(-solde(LOI, REPERE))} milliards d'euros
						</strong>{" "}
						par an en {REPERE}.
					</p>
					<div className="actions">
						<a href="#programmes" className="bouton plein">
							Comparer les programmes
						</a>
						<Link to="/simuler" search={(s) => s} className="bouton">
							{modifies > 0 ? "Reprendre ma réforme" : "Créer ma réforme"}
						</Link>
					</div>
				</div>
			</section>

			<section id="programmes">
				<h2>Ce qu'il manquerait en {REPERE}</h2>
				<p className="sub">
					Par an, pour tout le système de retraite. Ordre tiré au sort.
				</p>
				<ol className="candidats">
					<Ligne
						nom="Loi actuelle"
						titre="64 ans, 43 années"
						fige={LOI}
						echelle={echelle}
					/>
					{ordre
						? ordre.map((s) => {
								const p = programmeDe(s.id);
								const f = figeDe(s.id);
								if (!p || !f) return null;
								return (
									<Ligne
										key={s.id}
										reglages={s.reglages}
										nom={p.candidats.map((c) => c.nom).join(", ")}
										parti={p.candidats.map((c) => c.parti).join(" · ")}
										titre={s.titre}
										fige={f}
										echelle={echelle}
									/>
								);
							})
						: PROGRAMMES.map((s) => <li key={s.id} className="attente" />)}
				</ol>
				<p className="reserve">
					Seules les mesures que le simulateur sait régler sont comptées : ce
					n'est pas le chiffrage complet d'un programme. Touchez un candidat
					pour voir ce qui est repris, ce qui ne l'est pas, et l'ajuster.
				</p>
				<p className="suite-lien">
					<Link to="/scenarios" search={(s) => s}>
						Tout comparer, avec {PISTES.length} autres pistes
						<Icon name="fleche" size={16} />
					</Link>
				</p>
			</section>

			<section className="portes">
				<Link to="/simuler" search={(s) => s} className="porte sombre">
					<Icon name="curseurs" size={24} />
					<strong>
						{modifies > 0
							? "Reprendre ma réforme"
							: "Et vous, que feriez-vous ?"}
					</strong>
					<span>Réglez l'âge, les pensions, les cotisations.</span>
					<Icon name="fleche" size={18} />
				</Link>
				<Link to="/moi" search={(s) => s} className="porte">
					<Icon name="population" size={24} />
					<strong>Et ma retraite ?</strong>
					<span>
						Votre âge de départ et votre pension, programme par programme.
					</span>
					<Icon name="fleche" size={18} />
				</Link>
			</section>

			<section>
				<h2>Un trou qui se creuse</h2>
				<p className="sub">
					Avec la loi actuelle, il manque {entier(-cumul(LOI))} milliards d'ici
					2070.
				</p>
				<div className="courbes">
					<Courbe
						anneeEffet={ANNEE_EFFET}
						titre="Ressources moins dépenses de retraite, chaque année"
						aide="En milliards d'euros de 2026, tous régimes. Sous zéro, il manque de l'argent."
						reference={trajectoire(LOI)}
						courant={trajectoire(LOI)}
						couleur="var(--besoin)"
						format={(y) =>
							`${y > 0 ? "+" : y < 0 ? "−" : ""}${entier(Math.abs(y))} milliards`
						}
						depuisZero
					/>
				</div>
			</section>

			<section>
				<h2>Pour aller plus loin</h2>
				<div className="suites">
					{SUITES.map((s) => (
						<Link key={s.to} to={s.to} search={(p) => p} className="suite">
							<Icon name={s.icone} size={22} />
							<strong>{s.titre}</strong>
							<span>{s.texte}</span>
							<Icon name="fleche" size={18} />
						</Link>
					))}
				</div>
			</section>

			<aside className="note">
				<Icon name="attention" />
				<p>
					<strong>Des ordres de grandeur, pas une prévision.</strong> Les
					carrières sont simulées, pas observées : fiez-vous aux écarts entre
					scénarios plus qu'aux montants.{" "}
					<Link to="/modele" search={(s) => s}>
						Ce que le modèle sait faire
					</Link>
				</p>
			</aside>
		</main>
	);
}
