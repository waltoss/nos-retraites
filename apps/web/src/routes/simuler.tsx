import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ChoixAnnee } from "../components/ChoixAnnee";
import { Distributions } from "../components/Distributions";
import { Equation } from "../components/Equation";
import { GainsPertes } from "../components/GainsPertes";
import { Icon } from "../components/Icons";
import { Info } from "../components/Info";
import { PanneauLeviers } from "../components/PanneauLeviers";
import { Trajectoires } from "../components/Trajectoires";
import type { ResultatLeger } from "../engine.worker";
import { decimal, ecart, entier, euros } from "../format";
import { LECTURE_OFFICIELLE, type Lecture } from "../lecture";
import { useScenario } from "../scenario";

export const Route = createFileRoute("/simuler")({ component: Simuler });

const points = (n: number) => `${entier(n)} ${n >= 2 ? "points" : "point"}`;
const annees = (n: number) => `${decimal(n)} ${n >= 2 ? "ans" : "an"}`;

/**
 * Sur téléphone les résultats sont loin sous les curseurs : ce bandeau reste en bas de l'écran et
 * dit tout de suite ce que le réglage change, ou que le calcul tourne. Un appui mène aux résultats.
 */
function Bilan() {
	const { reference, courant, annee, calcul, modifies } = useScenario();
	const md = courant ? courant.systeme.solde / 1e9 : null;
	const loi = reference ? reference.systeme.solde / 1e9 : null;
	const d = md !== null && loi !== null ? md - loi : 0;
	return (
		<a href="#solde" className="bilan" aria-live="polite">
			{calcul && <span className="tourne" aria-hidden="true" />}
			<span className="num">
				{md === null ? (
					"Calcul en cours…"
				) : (
					<>
						<small>
							En {annee}
							{calcul ? ", calcul en cours…" : ""}
						</small>
						<strong>
							{md < -0.5
								? `manque ${entier(-md)} Md€`
								: md > 0.5
									? `excédent de ${entier(md)} Md€`
									: "à l'équilibre"}
						</strong>
						{modifies > 0 && !calcul && (
							<em className={d >= 0.5 ? "mieux" : d <= -0.5 ? "pire" : ""}>
								{Math.abs(d) < 0.5
									? "comme la loi actuelle"
									: `${entier(Math.abs(d))} Md€ de ${d > 0 ? "moins" : "plus"} que la loi`}
							</em>
						)}
					</>
				)}
			</span>
			<span className="voir">
				Résultats
				<Icon name="fleche" size={16} />
			</span>
		</a>
	);
}

function Simuler() {
	const { reference, courant, ecarts, reglages, modifies, annee, calcul } =
		useScenario();
	// Une seule lecture du solde pour toute la page : courbes, cumul et équilibre de l'année.
	const [lecture, setLecture] = useState<Lecture>(LECTURE_OFFICIELLE);
	return (
		<main className="atelier">
			<PanneauLeviers />
			<Bilan />
			<div className={calcul ? "etabli calcul" : "etabli"} id="resultats">
				{calcul && (
					<output className="en-calcul">
						<span className="tourne" aria-hidden="true" />
						Calcul en cours…
					</output>
				)}
				<div className="titre-page titre-info">
					<h1>Simuler</h1>
					<Info label="Ce que montre cette page">
						Votre scénario s'applique à partir de 2028, à ceux qui ne sont pas
						encore partis à la retraite. Tout est comparé à ce que donnerait la
						loi actuelle la même année.
					</Info>
				</div>

				{reference && courant ? (
					<>
						<section className="bloc">
							<div className="titre-info">
								<h2>Dans le temps, jusqu'en 2070</h2>
								<Info label="Les hypothèses de la projection">
									La population suit les projections de l'Insee, les salaires
									progressent de 0,7 % par an au-dessus des prix. Tous les
									montants sont en euros de 2026. Le trait vertical marque 2028
									{modifies > 0 ? ", le pointillé la loi actuelle" : ""}.
								</Info>
							</div>
							<Trajectoires lecture={lecture} onLecture={setLecture} />
						</section>

						<div className="detail-annee">
							<h2>Une année en détail</h2>
							<ChoixAnnee />
						</div>

						<section className="bloc">
							<h2>L'équation des retraites en {annee}</h2>
							<p className="sub">
								D'un côté ceux qui cotisent, de l'autre ceux qui perçoivent. Les
								termes encadrés sont ceux que vos réglages visent.
							</p>
							<Equation
								reference={reference}
								courant={courant}
								reglages={reglages}
								lecture={lecture}
							/>
							<p className="reserve">
								Les cases du haut ne portent que sur le régime général et
								l'Agirc-Arrco, pensions de droit direct : les salariés du privé,
								et les fonctionnaires pour leurs années de salarié. Le total
								tous régimes vient des projections du Conseil d'orientation des
								retraites. Dans un scénario, les fonctionnaires suivent leurs
								propres règles ; les autres régimes suivent les règles communes
								à tous (âge, durée, revalorisation).
							</p>
						</section>

						<section className="bloc">
							<h2>Les deux distributions</h2>
							<p className="sub">
								Plus une barre est haute, plus il y a de monde à ce niveau.
								{modifies > 0 && " Le trait noir rappelle la loi actuelle."}
							</p>
							<Distributions
								reference={reference}
								courant={courant}
								compare={modifies > 0}
								photos={false}
							/>
						</section>

						<div className="duo">
							<section className="bloc card pleine">
								<h3>Qui gagne, qui perd parmi les retraités de {annee}</h3>
								{ecarts && <GainsPertes ecarts={ecarts} />}
							</section>
							<section className="bloc card pleine">
								<h3>Femmes et hommes</h3>
								<TableSexe reference={reference} courant={courant} />
							</section>
						</div>

						<section className="bloc">
							<h2>Les fonctionnaires en {annee}</h2>
							<p className="sub">
								Agents de l'État, des collectivités et des hôpitaux, militaires
								compris pour la pension moyenne. Leur pension se calcule sur le
								traitement des six derniers mois, sans les primes. Seule leur
								pension de fonctionnaire est comptée ici ; celle qu'une partie
								d'entre eux touche du privé est dans les distributions
								ci-dessus.
							</p>
							<div className="faits">
								<Fait
									valeur={euros(courant.fonctionPublique.pensionMoyenne)}
									ecart={ecart(
										courant.fonctionPublique.pensionMoyenne,
										reference.fonctionPublique.pensionMoyenne,
										euros,
										5,
									)}
									legende="pension moyenne des fonctionnaires retraités, par mois"
								/>
								<Fait
									valeur={euros(courant.fonctionPublique.nouveaux.peuDePrimes)}
									ecart={ecart(
										courant.fonctionPublique.nouveaux.peuDePrimes,
										reference.fonctionPublique.nouveaux.peuDePrimes,
										euros,
										5,
									)}
									legende="première pension de ceux qui ont peu de primes, les enseignants surtout"
								/>
								<Fait
									valeur={euros(
										courant.fonctionPublique.nouveaux.beaucoupDePrimes,
									)}
									ecart={ecart(
										courant.fonctionPublique.nouveaux.beaucoupDePrimes,
										reference.fonctionPublique.nouveaux.beaucoupDePrimes,
										euros,
										5,
									)}
									legende="première pension de ceux dont les primes dépassent 30 % du traitement"
								/>
								<Fait
									valeur={`${decimal(courant.fonctionPublique.ageMoyenDepart)} ans`}
									ecart={ecart(
										courant.fonctionPublique.ageMoyenDepart,
										reference.fonctionPublique.ageMoyenDepart,
										annees,
										0.05,
									)}
									legende="âge moyen de départ des civils, hors invalidité, autour de cette année-là"
								/>
							</div>
						</section>

						<section className="bloc">
							<h2>Les retraités de {annee}</h2>
							<div className="faits">
								<Fait
									valeur={`${decimal(courant.ageMoyenDepart)} ans`}
									ecart={ecart(
										courant.ageMoyenDepart,
										reference.ageMoyenDepart,
										annees,
										0.05,
									)}
									legende="âge moyen de départ"
								/>
								<Fait
									valeur={`${entier(courant.partRetraitesSexagenaires * 100)} %`}
									ecart={ecart(
										courant.partRetraitesSexagenaires * 100,
										reference.partRetraitesSexagenaires * 100,
										points,
										0.5,
									)}
									legende="des 60 à 69 ans sont à la retraite"
								/>
								<Fait
									valeur={`${entier(courant.parts.tauxPleinParAge * 100)} %`}
									ecart={ecart(
										courant.parts.tauxPleinParAge * 100,
										reference.parts.tauxPleinParAge * 100,
										points,
										0.5,
									)}
									legende="attendent l'âge du taux plein automatique, faute de durée"
								/>
								<Fait
									valeur={`${entier(courant.parts.minimumContributif * 100)} %`}
									ecart={ecart(
										courant.parts.minimumContributif * 100,
										reference.parts.minimumContributif * 100,
										points,
										0.5,
									)}
									legende="touchent le minimum contributif"
								/>
							</div>
						</section>
					</>
				) : (
					<div className="histo attente" style={{ height: 320 }} />
				)}

				<aside className="note">
					<Icon name="attention" />
					<p>
						<strong>Des ordres de grandeur, pas une prévision.</strong> Les
						carrières sont inventées, réglées sur les salaires et les durées
						publiés. Les salariés du privé et les fonctionnaires sont simulés,
						les autres régimes suivent les projections officielles. La natalité
						et le solde migratoire se règlent entre les variantes basse et haute
						de l'Insee.
					</p>
				</aside>
			</div>
		</main>
	);
}

function Fait(props: { valeur: string; ecart: string; legende: string }) {
	return (
		<div className="fait">
			<strong className="num">
				{props.valeur}
				{props.ecart && <em>{props.ecart}</em>}
			</strong>
			<span>{props.legende}</span>
		</div>
	);
}

function TableSexe({
	reference,
	courant,
}: {
	reference: ResultatLeger;
	courant: ResultatLeger;
}) {
	const lignes = [
		{ nom: "Femmes", c: courant.parSexe.F, r: reference.parSexe.F },
		{ nom: "Hommes", c: courant.parSexe.H, r: reference.parSexe.H },
	];
	const rapport = (x: ResultatLeger) =>
		x.parSexe.H.pensionMoyenne
			? (x.parSexe.F.pensionMoyenne / x.parSexe.H.pensionMoyenne) * 100
			: 0;
	return (
		<>
			<table className="table">
				<thead>
					<tr>
						<th />
						<th>Pension moyenne</th>
						<th>Pension médiane</th>
						<th>Âge de départ</th>
					</tr>
				</thead>
				<tbody>
					{lignes.map((l) => (
						<tr key={l.nom}>
							<th>{l.nom}</th>
							<Cellule
								valeur={euros(l.c.pensionMoyenne)}
								ecart={ecart(l.c.pensionMoyenne, l.r.pensionMoyenne, euros, 5)}
							/>
							<Cellule
								valeur={euros(l.c.pensionMediane)}
								ecart={ecart(l.c.pensionMediane, l.r.pensionMediane, euros, 5)}
							/>
							<Cellule
								valeur={`${decimal(l.c.ageMoyenDepart)} ans`}
								ecart={ecart(
									l.c.ageMoyenDepart,
									l.r.ageMoyenDepart,
									annees,
									0.05,
								)}
							/>
						</tr>
					))}
				</tbody>
			</table>
			<p className="gains-note">
				La pension moyenne des femmes vaut{" "}
				<strong className="num">{entier(rapport(courant))} %</strong> de celle
				des hommes
				{Math.abs(rapport(courant) - rapport(reference)) >= 0.5 &&
					`, contre ${entier(rapport(reference))} % avec la loi actuelle`}
				.
			</p>
		</>
	);
}

function Cellule({ valeur, ecart: e }: { valeur: string; ecart: string }) {
	return (
		<td className="num">
			{valeur}
			{e && <em>{e}</em>}
		</td>
	);
}
