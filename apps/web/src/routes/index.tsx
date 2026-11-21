import type { AnneeSysteme, Projection } from "@nos-retraites/engine";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Avatar } from "../components/Avatar";
import { Distributions } from "../components/Distributions";
import { Icon, type IconName } from "../components/Icons";
import { Courbe } from "../components/Trajectoires";
import type { ProfilMoi, ResultatMoi } from "../engine.worker";
import { ageEnClair, decimal, ecart, entier, euros } from "../format";
import type { Reglages } from "../leviers";
import { useScenario } from "../scenario";
import { SCENARIOS } from "../scenarios";

export const Route = createFileRoute("/")({ component: Home });

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
const LOI = "loi";
const PERSONNALISE = "personnalise";
const cle = (r: Reglages) =>
	JSON.stringify(Object.entries(r).sort(([a], [b]) => a.localeCompare(b)));

/** Trois personnes d'exemple, une par génération : le prénom n'est qu'un habillage. */
const PERSONNES: (ProfilMoi & { id: number; prenom: string })[] = [
	{
		id: 11,
		prenom: "Nathalie",
		anneeNaissance: 1968,
		sexe: "F",
		salaireMensuel: 2400,
	},
	{
		id: 23,
		prenom: "Julien",
		anneeNaissance: 1985,
		sexe: "H",
		salaireMensuel: 3000,
	},
	{
		id: 37,
		prenom: "Léa",
		anneeNaissance: 2000,
		sexe: "F",
		salaireMensuel: 2200,
	},
];

interface Projections {
	reference: Projection;
	courant: Projection;
	systeme: { reference: AnneeSysteme[]; courant: AnneeSysteme[] };
	anneeEffet: number;
}

function Home() {
	const {
		reference,
		courant,
		reglages,
		annee,
		remplacer,
		modifies,
		pret,
		demander,
		scenario,
	} = useScenario();
	const [donnees, setDonnees] = useState<Projections | null>(null);
	const [repere, setRepere] = useState(2050);
	const [personnes, setPersonnes] = useState<(ResultatMoi | null)[]>([]);

	useEffect(() => {
		if (!pret) return;
		let actif = true;
		const t = setTimeout(async () => {
			const r = await demander({ type: "projection", scenario });
			if (!actif) return;
			setDonnees({
				reference: r.reference,
				courant: r.courant,
				systeme: r.systeme,
				anneeEffet: r.anneeEffet,
			});
			const resultats: (ResultatMoi | null)[] = [];
			for (const profil of PERSONNES) {
				const m = await demander({
					type: "moi",
					scenario,
					profil: {
						anneeNaissance: profil.anneeNaissance,
						sexe: profil.sexe,
						salaireMensuel: profil.salaireMensuel,
					},
				});
				if (!actif) return;
				resultats.push(m.resultat);
			}
			setPersonnes(resultats);
		}, 200);
		return () => {
			actif = false;
			clearTimeout(t);
		};
	}, [pret, demander, scenario]);

	const systeme = donnees?.systeme ?? null;
	const cumul = (annees: AnneeSysteme[]) =>
		annees.reduce((t, a) => t + a.solde, 0) / 1e9;
	const choisi =
		modifies === 0
			? LOI
			: (SCENARIOS.find((s) => cle(s.reglages) === cle(reglages))?.id ??
				PERSONNALISE);

	/** Les quatre grandeurs qu'un choix déplace, une année donnée. */
	const lire = (p: Projection, s: AnneeSysteme[]) => {
		const a = p.annees.find((x) => x.annee === repere);
		const y = s.find((x) => x.annee === repere);
		if (!a || !y) return null;
		return {
			age: a.ageMoyenDepart,
			pension: (100 * a.pensionMoyenne * 12) / a.salaireMoyen,
			cotisation: (100 * a.cotisations) / (a.cotisants * a.salaireMoyen),
			solde: (100 * y.solde) / y.pib,
			milliards: y.solde / 1e9,
		};
	};
	const c = donnees ? lire(donnees.courant, donnees.systeme.courant) : null;
	const r = donnees ? lire(donnees.reference, donnees.systeme.reference) : null;
	const pointsDe = (n: number) =>
		`${decimal(n)} ${n >= 2 ? "points" : "point"}`;
	const ansDe = (n: number) => `${decimal(n)} ${n >= 2 ? "ans" : "an"}`;

	return (
		<main className="wrap">
			<section className="hero">
				<img
					src="/photos/generations.jpg"
					alt="Dans un parc, un grand-père accompagne un enfant qui apprend à faire du vélo"
				/>
				<h1>Que laisse‑t‑on à ceux qui viennent après ?</h1>
				<p className="lede">
					Ceux qui travaillent paient la pension de ceux qui ont travaillé.
					Chaque choix fait en 2027 déplace au moins une de ces quatre
					grandeurs, pendant quarante ans. Aucune n'est la bonne à elle seule.
				</p>
				<div className="reperes">
					{REPERES.map((a) => (
						<button
							type="button"
							key={a}
							className={a === repere ? "actif" : ""}
							aria-pressed={a === repere}
							onClick={() => setRepere(a)}
						>
							En {a}
						</button>
					))}
				</div>
				<div className="glass quatre" aria-live="polite">
					<Chiffre
						valeur={c ? `${decimal(c.age)} ans` : "…"}
						ecart={c && r ? ecart(c.age, r.age, ansDe, 0.05) : ""}
						legende="l'âge moyen de départ à la retraite"
					/>
					<Chiffre
						valeur={c ? `${entier(c.pension)} %` : "…"}
						ecart={c && r ? ecart(c.pension, r.pension, pointsDe, 0.5) : ""}
						legende="du salaire brut moyen : la pension moyenne"
					/>
					<Chiffre
						valeur={c ? `${entier(c.cotisation)} %` : "…"}
						ecart={
							c && r ? ecart(c.cotisation, r.cotisation, pointsDe, 0.1) : ""
						}
						legende="du salaire brut part en cotisations de retraite, employeur compris"
					/>
					<Chiffre
						valeur={c ? `${decimal(Math.abs(c.solde))} %` : "…"}
						// L'écart suit ce qui est affiché : ce qui manque, donc l'opposé du solde.
						ecart={
							c && r
								? c.solde > 0
									? ecart(c.solde, r.solde, pointsDe, 0.05)
									: ecart(-c.solde, -r.solde, pointsDe, 0.05)
								: ""
						}
						legende={
							c
								? c.solde > 0
									? `de la richesse du pays en trop, environ ${entier(c.milliards)} milliards d'euros`
									: `de la richesse du pays manque, environ ${entier(-c.milliards)} milliards d'euros`
								: "de la richesse du pays"
						}
					/>
				</div>
				<p className="hero-note">
					Âge, pension et cotisations : salariés du privé. Ce qui manque : tous
					les régimes. Ordres de grandeur.
				</p>
			</section>

			<div className="control choix">
				<label htmlFor="option">
					<span>Et si on choisissait</span>
				</label>
				<select
					id="option"
					value={choisi}
					onChange={(e) => {
						const s = SCENARIOS.find((x) => x.id === e.target.value);
						remplacer(s ? s.reglages : {});
					}}
				>
					<option value={LOI}>De ne rien changer à la loi</option>
					{SCENARIOS.map((s) => (
						<option key={s.id} value={s.id}>
							{s.titre}
						</option>
					))}
					{choisi === PERSONNALISE && (
						<option value={PERSONNALISE}>Votre scénario</option>
					)}
				</select>
				<Link to="/simuler" search={(p) => p} className="reset">
					<Icon name="curseurs" size={18} />
					<span>Régler moi-même</span>
				</Link>
			</div>

			<section>
				<h2>Trois générations, la même question</h2>
				<p className="sub">
					Ce que {choisi === LOI ? "la loi actuelle" : "ce choix"} donne à trois
					salariés du privé. Les chiffres sont ceux des carrières simulées qui
					leur ressemblent, pas une promesse.
				</p>
				<div className="personnes">
					{PERSONNES.map((p, i) => {
						const m = personnes[i];
						return (
							<Link key={p.id} to="/moi" search={(x) => x} className="personne">
								<header>
									<Avatar
										id={p.id}
										sexe={p.sexe}
										age={2026 - p.anneeNaissance}
										size={52}
									/>
									<div>
										<strong>{p.prenom}</strong>
										<small>
											{p.sexe === "F" ? "née" : "né"} en {p.anneeNaissance},{" "}
											{euros(p.salaireMensuel)} bruts par mois
										</small>
									</div>
								</header>
								{m ? (
									<dl>
										<div>
											<dt>Départ à</dt>
											<dd className="num">
												{ageEnClair(m.scenario.age[1])}
												{m.ecart.age !== 0 && (
													<em>
														{m.ecart.age > 0 ? "+" : "−"}
														{Math.abs(m.ecart.age) * 3} mois
													</em>
												)}
											</dd>
										</div>
										<div>
											<dt>Pension</dt>
											<dd className="num">
												{euros(m.scenario.pension[1])}
												{Math.abs(m.ecart.pension) >= 5 && (
													<em>
														{m.ecart.pension > 0 ? "+" : "−"}
														{euros(Math.abs(m.ecart.pension))}
													</em>
												)}
											</dd>
										</div>
									</dl>
								) : (
									<div className="histo attente" style={{ height: 64 }} />
								)}
							</Link>
						);
					})}
					<Link to="/moi" search={(x) => x} className="personne vous">
						<header>
							<span className="rond">
								<Icon name="population" size={26} />
							</span>
							<div>
								<strong>Et vous ?</strong>
								<small>
									Année de naissance, sexe, salaire : rien ne quitte votre
									navigateur.
								</small>
							</div>
						</header>
						<span className="aller">
							Voir ce que chaque choix vous ferait
							<Icon name="fleche" size={16} />
						</span>
					</Link>
				</div>
			</section>

			<section>
				<h2>Ce qui manque, année après année</h2>
				<p className="sub">
					Une réforme s'applique par étapes à partir de 2028 et son effet se lit
					sur quarante ans, pas sur un budget. Ce solde compte comme une
					ressource ce que l'État verse pour les retraites de ses agents : sans
					cela, il manquerait davantage.
				</p>
				{systeme ? (
					<div className="courbes deux">
						<Courbe
							anneeEffet={donnees?.anneeEffet ?? 2028}
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
										<small>Avec ce choix</small>
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
				<p className="suite-lien">
					<Link to="/scenarios" search={(p) => p}>
						Comparer les {SCENARIOS.length} grandes options côte à côte
						<Icon name="fleche" size={16} />
					</Link>
				</p>
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
				<h2>Pour aller plus loin</h2>
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
					durées de carrière publiés. Les salariés du privé et les
					fonctionnaires sont simulés ; le reste du système suit les projections
					du Conseil d'orientation des retraites.
				</p>
			</aside>
		</main>
	);
}

function Chiffre(props: { valeur: string; ecart: string; legende: string }) {
	return (
		<div>
			<div className="v num">
				<span>{props.valeur}</span>
				{props.ecart && <em>{props.ecart}</em>}
			</div>
			<div className="l">{props.legende}</div>
		</div>
	);
}
