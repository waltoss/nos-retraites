import type { AnneeSysteme } from "@nos-retraites/engine";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Distributions } from "../components/Distributions";
import { Icon, type IconName } from "../components/Icons";
import { Courbe } from "../components/Trajectoires";
import { ageEnClair, entier } from "../format";
import { useScenario } from "../scenario";
import { SCENARIOS } from "../scenarios";

export const Route = createFileRoute("/")({ component: Home });

const AGE_MIN = 60 * 4;
const AGE_MAX = 67 * 4;
const AGE_REPOS = 64 * 4;

const SUITES: {
	to: "/scenarios" | "/simuler" | "/decisions" | "/carrieres" | "/modele";
	icone: IconName;
	titre: string;
	texte: string;
}[] = [
	{
		to: "/simuler",
		icone: "curseurs",
		titre: "Tous les leviers",
		texte:
			"Durée, calcul de la pension, cotisations, emploi, natalité, migrations.",
	},
	{
		to: "/decisions",
		icone: "tableau",
		titre: "Chaque décision, une par une",
		texte:
			"Le même tableau pour toutes : ce que chacune déplace, et de combien.",
	},
	{
		to: "/carrieres",
		icone: "carriere",
		titre: "Des vies, année par année",
		texte:
			"Ouvrez une carrière et suivez le calcul de sa pension ligne à ligne.",
	},
	{
		to: "/modele",
		icone: "modele",
		titre: "Sous le capot",
		texte: "Les règles, leurs sources, ce qui est supposé et ce qui manque.",
	},
];

const REPERES = [2030, 2050, 2070];
const milliards = (y: number) =>
	`${y > 0 ? "+" : y < 0 ? "−" : ""}${entier(Math.abs(y))} milliards`;

function Home() {
	const {
		reference,
		courant,
		reglages,
		annee,
		regler,
		remplacer,
		modifies,
		pret,
		demander,
		scenario,
	} = useScenario();
	const navigate = useNavigate();
	const ageLegal = reglages.ageLegal ?? null;
	const autres = modifies - (ageLegal === null ? 0 : 1);
	const [systeme, setSysteme] = useState<{
		reference: AnneeSysteme[];
		courant: AnneeSysteme[];
		anneeEffet: number;
	} | null>(null);

	useEffect(() => {
		if (!pret) return;
		let actif = true;
		const t = setTimeout(() => {
			demander({ type: "projection", scenario }).then((r) => {
				if (actif) setSysteme({ ...r.systeme, anneeEffet: r.anneeEffet });
			});
		}, 200);
		return () => {
			actif = false;
			clearTimeout(t);
		};
	}, [pret, demander, scenario]);

	const solde = (annees: AnneeSysteme[] | undefined, annee: number) =>
		(annees?.find((a) => a.annee === annee)?.solde ?? 0) / 1e9;
	const cumul = (annees: AnneeSysteme[]) =>
		annees.reduce((t, a) => t + a.solde, 0) / 1e9;

	return (
		<main className="wrap">
			<section className="hero">
				<img
					src="/photos/generations.jpg"
					alt="Dans un parc, un grand-père accompagne un enfant qui apprend à faire du vélo"
				/>
				<h1>Que laisse-t-on à ceux qui viennent après ?</h1>
				<p className="lede">
					Ceux qui travaillent paient la pension de ceux qui ont travaillé.
					Chaque choix fait en 2027 pèsera sur les uns ou sur les autres pendant
					quarante ans. Voici ce qui manque chaque année pour payer les
					retraites, tous régimes confondus.
				</p>
				<div className="glass" aria-live="polite">
					{REPERES.map((a) => {
						const c = solde(systeme?.courant, a);
						const r = solde(systeme?.reference, a);
						return (
							<Chiffre
								key={a}
								icone="pension"
								valeur={
									systeme
										? `${entier(Math.abs(c))} Md€${c > 0 ? " en trop" : ""}`
										: "…"
								}
								ecart={
									systeme && Math.abs(c - r) >= 1
										? `${c > r ? "+" : "−"}${entier(Math.abs(c - r))} Md€`
										: ""
								}
								legende={`${c > 0 ? "d'excédent" : "manquent"} en ${a}`}
							/>
						);
					})}
				</div>
			</section>

			<div className="control">
				<label htmlFor="age-legal">
					<Icon name="age" />
					<span>Âge légal</span>
				</label>
				<output htmlFor="age-legal" className="num">
					{ageLegal === null ? "Loi actuelle" : ageEnClair(ageLegal)}
					<small>
						{ageLegal === null
							? "62 à 64 ans selon la génération"
							: "par étapes, à partir de 2028"}
					</small>
				</output>
				<input
					id="age-legal"
					type="range"
					min={AGE_MIN}
					max={AGE_MAX}
					step={1}
					value={Math.min(AGE_MAX, ageLegal ?? AGE_REPOS)}
					className={ageLegal === null ? "neutre" : ""}
					onChange={(e) => regler("ageLegal", Number(e.target.value))}
					aria-valuetext={
						ageLegal === null ? "Loi actuelle" : ageEnClair(ageLegal)
					}
				/>
				<button
					type="button"
					className="reset"
					onClick={() => regler("ageLegal", null)}
					disabled={ageLegal === null}
				>
					<Icon name="retour" size={18} />
					<span>Loi actuelle</span>
				</button>
			</div>

			<section>
				<h2>
					{modifies > 0
						? "Votre scénario, année après année"
						: "La loi actuelle, année après année"}
				</h2>
				<p className="sub">
					Bougez l'âge légal ci-dessus : la réforme s'applique par étapes à
					partir de 2028 et son effet se lit sur quarante ans, pas sur un
					budget.
					{autres > 0 &&
						` Votre scénario modifie aussi ${autres} ${autres > 1 ? "autres réglages" : "autre réglage"}.`}
				</p>
				{systeme ? (
					<div className="courbes deux">
						<Courbe
							anneeEffet={systeme.anneeEffet}
							titre="Ressources moins dépenses de retraite, chaque année"
							aide="En milliards d'euros de 2026, tous régimes. Sous zéro, il manque de l'argent."
							reference={systeme.reference.map((a) => ({
								x: a.annee,
								y: a.solde / 1e9,
							}))}
							courant={systeme.courant.map((a) => ({
								x: a.annee,
								y: a.solde / 1e9,
							}))}
							couleur="var(--besoin)"
							format={milliards}
							depuisZero
						/>
						<div className="cumul">
							<small>
								Ce qu'il faut trouver d'ici 2070, avec la loi actuelle
							</small>
							<strong className="num">
								{entier(Math.abs(cumul(systeme.reference)))} milliards
							</strong>
							{modifies > 0 &&
								Math.abs(cumul(systeme.courant) - cumul(systeme.reference)) >=
									1 && (
									<>
										<small>Avec votre scénario</small>
										<strong
											className={
												cumul(systeme.courant) >= cumul(systeme.reference)
													? "num mieux"
													: "num pire"
											}
										>
											{cumul(systeme.courant) >= 0
												? `${entier(cumul(systeme.courant))} milliards d'excédent`
												: `${entier(Math.abs(cumul(systeme.courant)))} milliards`}
										</strong>
									</>
								)}
							<p>
								Somme des soldes de chaque année, en euros de 2026 et sans
								intérêts. Ce qui n'est pas trouvé aujourd'hui est laissé à ceux
								qui travailleront demain : dette, impôts, cotisations ou
								pensions plus basses.
							</p>
						</div>
					</div>
				) : (
					<div className="histo attente" style={{ height: 300 }} />
				)}
			</section>

			<section>
				<h2>Les grandes options du débat</h2>
				<p className="sub">
					Neuf réponses possibles, chiffrées de la même façon jusqu'en 2070.
				</p>
				<div className="options">
					{SCENARIOS.map((s) => (
						<button
							type="button"
							key={s.id}
							className="option"
							onClick={() => {
								remplacer(s.reglages);
								navigate({ to: "/simuler", search: s.reglages as never });
							}}
						>
							{s.titre}
						</button>
					))}
					<Link to="/scenarios" search={(p) => p} className="option toutes">
						Les comparer côte à côte
						<Icon name="fleche" size={16} />
					</Link>
				</div>
			</section>

			<section>
				<h2>Qui paie combien, qui touche combien en {annee}</h2>
				<p className="sub">
					Plus une barre est haute, plus il y a de monde à ce niveau.
					{modifies > 0 &&
						" Le trait noir rappelle la situation avec la loi actuelle."}
				</p>
				<Distributions
					reference={reference}
					courant={courant}
					compare={modifies > 0}
					photos
				/>
			</section>

			<section>
				<h2>L'âge n'est qu'un levier parmi d'autres</h2>
				<div className="suites">
					{SUITES.map((s) => (
						<Link key={s.to} to={s.to} search={(p) => p} className="suite">
							<Icon name={s.icone} size={26} />
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
					pensions sont calculées avec les vraies règles de 2026, sur des
					carrières inventées, réglées pour ressembler aux salaires et aux
					durées de carrière publiés. Seuls les salariés du privé sont simulés ;
					le reste du système suit les projections du Conseil d'orientation des
					retraites.
				</p>
			</aside>
		</main>
	);
}

function Chiffre(props: {
	icone: IconName;
	valeur: string;
	ecart: string;
	legende: string;
}) {
	return (
		<div>
			<div className="v num">
				<Icon name={props.icone} />
				<span>{props.valeur}</span>
				{props.ecart && <em>{props.ecart}</em>}
			</div>
			<div className="l">{props.legende}</div>
		</div>
	);
}
