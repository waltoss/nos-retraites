import { createFileRoute, Link } from "@tanstack/react-router";
import { Distributions } from "../components/Distributions";
import { Icon, type IconName } from "../components/Icons";
import { ageEnClair, decimal, ecart, entier, euros } from "../format";
import { useScenario } from "../scenario";

export const Route = createFileRoute("/")({ component: Home });

const AGE_MIN = 60 * 4;
const AGE_MAX = 67 * 4;
const AGE_REPOS = 64 * 4;

const SUITES: {
	to: "/simuler" | "/decisions" | "/carrieres" | "/modele";
	icone: IconName;
	titre: string;
	texte: string;
}[] = [
	{
		to: "/simuler",
		icone: "curseurs",
		titre: "Tous les leviers",
		texte:
			"Durée, décote, calcul de la pension, cotisations, emploi, droits liés aux enfants.",
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

function Home() {
	const { reference, courant, reglages, regler, modifies } = useScenario();
	const ageLegal = reglages.ageLegal ?? null;
	const autres = modifies - (ageLegal === null ? 0 : 1);

	return (
		<main className="wrap">
			<section className="hero">
				<img
					src="/photos/generations.jpg"
					alt="Dans un parc, un grand-père accompagne un enfant qui apprend à faire du vélo"
				/>
				<h1>
					Ceux qui travaillent paient la pension de ceux qui ont travaillé.
				</h1>
				<p className="lede">
					C'est tout le principe de la répartition. Changez l'âge légal de
					départ et regardez ce que ça déplace.
				</p>
				<div className="glass" aria-live="polite">
					<Chiffre
						icone="age"
						valeur={courant ? `${decimal(courant.ageMoyenDepart)} ans` : "…"}
						ecart={
							courant && reference
								? ecart(
										courant.ageMoyenDepart,
										reference.ageMoyenDepart,
										(n) => `${decimal(n)} ${n >= 2 ? "ans" : "an"}`,
										0.05,
									)
								: ""
						}
						legende="âge moyen de départ"
					/>
					<Chiffre
						icone="retraite"
						valeur={courant ? euros(courant.pensions.resume.mediane) : "…"}
						ecart={
							courant && reference
								? ecart(
										courant.pensions.resume.mediane,
										reference.pensions.resume.mediane,
										euros,
										5,
									)
								: ""
						}
						legende="pension médiane, par mois"
					/>
					<Chiffre
						icone="population"
						valeur={
							courant
								? `${entier(courant.partRetraitesSexagenaires * 100)} %`
								: "…"
						}
						ecart={
							courant && reference
								? ecart(
										courant.partRetraitesSexagenaires * 100,
										reference.partRetraitesSexagenaires * 100,
										(n) => `${entier(n)} points`,
										0.5,
									)
								: ""
						}
						legende="des 60 à 69 ans sont à la retraite"
					/>
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
							: "pour tout le monde"}
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
				<h2>Qui paie combien, qui touche combien</h2>
				<p className="sub">
					Plus une barre est haute, plus il y a de monde à ce niveau.
					{modifies > 0 &&
						" Le trait noir rappelle la situation avec la loi actuelle."}
					{autres > 0 &&
						` Votre scénario modifie aussi ${autres} ${autres > 1 ? "autres réglages" : "autre réglage"}.`}
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
					<strong>Ce n'est pas encore une prévision.</strong> Les pensions sont
					calculées avec les vraies règles de 2026, sur des carrières inventées,
					réglées pour ressembler aux salaires et aux durées de carrière
					publiés. Seuls les salariés du privé sont simulés, et la population ne
					vieillit pas d'une année sur l'autre.
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
