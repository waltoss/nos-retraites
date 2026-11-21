import { createFileRoute } from "@tanstack/react-router";
import { Distributions } from "../components/Distributions";
import { Equation } from "../components/Equation";
import { GainsPertes } from "../components/GainsPertes";
import { Icon } from "../components/Icons";
import { PanneauLeviers } from "../components/PanneauLeviers";
import type { ResultatLeger } from "../engine.worker";
import { decimal, ecart, entier, euros } from "../format";
import { useScenario } from "../scenario";

export const Route = createFileRoute("/simuler")({ component: Simuler });

const points = (n: number) => `${entier(n)} ${n >= 2 ? "points" : "point"}`;
const annees = (n: number) => `${decimal(n)} ${n >= 2 ? "ans" : "an"}`;

function Simuler() {
	const { reference, courant, ecarts, reglages, modifies } = useScenario();
	return (
		<main className="atelier">
			<PanneauLeviers />
			<div className="etabli">
				<div className="titre-page">
					<h1>Simuler</h1>
					<p className="sub">
						Chaque réglage part du droit en vigueur en 2026. Tout ce qui
						s'affiche à droite est comparé à cette situation.
					</p>
				</div>

				{reference && courant ? (
					<>
						<section className="bloc">
							<h2>Ce que votre scénario déplace dans l'équation</h2>
							<p className="sub">
								D'un côté ceux qui cotisent, de l'autre ceux qui perçoivent. Les
								termes encadrés sont ceux que vos réglages visent.
							</p>
							<Equation
								reference={reference}
								courant={courant}
								reglages={reglages}
							/>
							<p className="reserve">
								Ces totaux portent sur les{" "}
								{entier(
									courant.effectifs.cotisants +
										courant.effectifs.retraites +
										courant.effectifs.autres,
								)}{" "}
								personnes simulées, nées de 1955 à 2003. Les retraités plus âgés
								n'y sont pas : lisez les écarts, pas les niveaux.
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
								<h3>Qui gagne, qui perd parmi les retraités</h3>
								{ecarts && <GainsPertes ecarts={ecarts} />}
							</section>
							<section className="bloc card pleine">
								<h3>Femmes et hommes</h3>
								<TableSexe reference={reference} courant={courant} />
							</section>
						</div>

						<section className="bloc">
							<h2>Comment les gens partent</h2>
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
						<strong>Ce n'est pas encore une prévision.</strong> Les carrières
						sont inventées, réglées sur les salaires et les durées publiés. La
						natalité et l'immigration ne sont pas simulées : elles demandent de
						suivre la population année après année, ce que le modèle ne fait pas
						encore.
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
