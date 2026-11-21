import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Histogram } from "../components/Histogram";
import { Icon } from "../components/Icons";
import { ageEnClair, decimal, ecart, entier, euros } from "../format";
import { useSimulation } from "../useSimulation";

export const Route = createFileRoute("/")({ component: Home });

const AGE_MIN = 60 * 4;
const AGE_MAX = 67 * 4;
const AGE_DEPART_CURSEUR = 64 * 4;
const TAILLE = 20000;

function Home() {
	const sim = useSimulation(TAILLE);
	const [ageLegal, setAgeLegal] = useState<number | null>(null);
	const { reference, courant } = sim;

	const choisir = (age: number | null) => {
		setAgeLegal(age);
		sim.run(age === null ? {} : { ageLegal: age });
	};

	return (
		<div className="wrap">
			<header className="top">
				<div className="mark">
					nos-retraites<span>.app</span>
				</div>
				<div className="indep">Un projet citoyen, indépendant de l'État</div>
			</header>

			<section className="hero">
				<img
					src="/photos/generations.jpg"
					alt="Dans un parc, un grand-père accompagne un enfant qui apprend à faire du vélo"
				/>
				<div className="pill">
					Version de travail. Le modèle n'est pas encore calé sur les chiffres
					officiels.
				</div>
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
					value={ageLegal ?? AGE_DEPART_CURSEUR}
					className={ageLegal === null ? "neutre" : ""}
					onChange={(e) => choisir(Number(e.target.value))}
					aria-valuetext={
						ageLegal === null ? "Loi actuelle" : ageEnClair(ageLegal)
					}
				/>
				<button
					type="button"
					className="reset"
					onClick={() => choisir(null)}
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
					{ageLegal !== null &&
						" Le trait noir rappelle la situation avec la loi actuelle."}
				</p>
				<div className={ageLegal === null ? "grid sans-reference" : "grid"}>
					<article className="card">
						<img
							src="/photos/cotisants.jpg"
							alt="Une boulangère surveille la cuisson du pain dans un four professionnel"
							style={{ objectPosition: "50% 55%" }}
						/>
						<div className="body">
							<h3 style={{ color: "var(--cotisants)" }}>
								<Icon name="cotisant" size={26} />
								Ceux qui cotisent
							</h3>
							<p className="unit">
								Cotisation retraite par an, part salariale et patronale
								{courant && (
									<span className="effectif num">
										{", "}
										{entier(courant.effectifs.cotisants)} personnes
									</span>
								)}
							</p>
							{courant && reference ? (
								<Histogram
									courant={courant.cotisations.histogramme}
									reference={reference.cotisations.histogramme}
									mediane={courant.cotisations.resume.mediane}
									couleur="var(--cotisants)"
									description="Répartition des cotisations retraite annuelles des salariés du privé"
								/>
							) : (
								<div className="histo attente" />
							)}
						</div>
					</article>
					<article className="card">
						<img
							src="/photos/retraites.jpg"
							alt="Une femme âgée lance sa boule de pétanque, entourée de deux autres joueurs"
							style={{ objectPosition: "50% 30%" }}
						/>
						<div className="body">
							<h3 style={{ color: "var(--retraites-text)" }}>
								<Icon name="retraite" size={26} />
								Ceux qui perçoivent
							</h3>
							<p className="unit">
								Pension brute par mois, base et complémentaire
								{courant && (
									<span className="effectif num">
										{", "}
										{entier(courant.effectifs.retraites)} personnes
									</span>
								)}
							</p>
							{courant && reference ? (
								<Histogram
									courant={courant.pensions.histogramme}
									reference={reference.pensions.histogramme}
									mediane={courant.pensions.resume.mediane}
									couleur="var(--retraites)"
									description="Répartition des pensions mensuelles brutes des retraités du privé"
								/>
							) : (
								<div className="histo attente" />
							)}
						</div>
					</article>
				</div>
			</section>

			<aside className="note">
				<Icon name="attention" />
				<p>
					<strong>Ce n'est pas encore une prévision.</strong> Les pensions sont
					calculées avec les vraies règles de 2026, mais sur des carrières
					inventées qui ne sont pas encore calées sur les statistiques
					publiques. Seuls les salariés du privé sont simulés.
				</p>
			</aside>

			<footer>
				<p>
					Ce site n'est pas un service public et ne remplace pas votre relevé de
					carrière. Le code est libre :{" "}
					<a href="https://github.com/waltoss/nos-retraites">
						github.com/waltoss/nos-retraites
					</a>
					.
				</p>
			</footer>
		</div>
	);
}

function Chiffre(props: {
	icone: "age" | "retraite" | "population";
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
