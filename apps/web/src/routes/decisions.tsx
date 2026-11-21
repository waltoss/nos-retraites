import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ChoixAnnee } from "../components/ChoixAnnee";
import { Icon } from "../components/Icons";
import type { ResultatLeger } from "../engine.worker";
import { decimal, entier, euros } from "../format";
import { DECISIONS, GROUPES, LEVIER, TERMES, versScenario } from "../leviers";
import { useScenario } from "../scenario";

export const Route = createFileRoute("/decisions")({ component: Decisions });

interface Colonne {
	titre: string;
	aide: string;
	valeur: (r: ResultatLeger) => number;
	/** Écart affiché : en unités absolues ou en pourcentage de la référence. */
	mode: "absolu" | "relatif";
	format: (ecart: number) => string;
	/** Écart qui remplit toute la jauge. */
	plein: number;
	/** Écart en dessous duquel on n'affiche rien. */
	seuil: number;
}

const pct = (n: number) => `${decimal(Math.abs(n))} %`;
const COLONNES: Colonne[] = [
	{
		titre: "Âge moyen de départ",
		aide: "en années",
		valeur: (r) => r.ageMoyenDepart,
		mode: "absolu",
		format: (e) => `${decimal(Math.abs(e))} an`,
		plein: 1.5,
		seuil: 0.05,
	},
	{
		titre: "60 à 69 ans à la retraite",
		aide: "en points",
		valeur: (r) => r.partRetraitesSexagenaires * 100,
		mode: "absolu",
		format: (e) => `${decimal(Math.abs(e))} pt`,
		plein: 10,
		seuil: 0.25,
	},
	{
		titre: "Petites pensions",
		aide: "1er décile, par mois",
		valeur: (r) => r.pensions.resume.deciles[0] ?? 0,
		mode: "absolu",
		format: (e) => euros(Math.abs(e)),
		plein: 150,
		seuil: 5,
	},
	{
		titre: "Pension médiane",
		aide: "par mois",
		valeur: (r) => r.pensions.resume.mediane,
		mode: "absolu",
		format: (e) => euros(Math.abs(e)),
		plein: 150,
		seuil: 5,
	},
	{
		titre: "Hautes pensions",
		aide: "9e décile, par mois",
		valeur: (r) => r.pensions.resume.deciles[8] ?? 0,
		mode: "absolu",
		format: (e) => euros(Math.abs(e)),
		plein: 150,
		seuil: 5,
	},
	{
		titre: "Pensions versées",
		aide: "total, en %",
		valeur: (r) => r.masses.pensions,
		mode: "relatif",
		format: pct,
		plein: 12,
		seuil: 0.05,
	},
	{
		titre: "Cotisations versées",
		aide: "total, en %",
		valeur: (r) => r.masses.cotisations,
		mode: "relatif",
		format: pct,
		plein: 12,
		seuil: 0.05,
	},
	{
		titre: "Équilibre",
		aide: "cotisations moins pensions, en milliards cette année-là",
		valeur: (r) => (r.masses.cotisations - r.masses.pensions) / 1e9,
		mode: "absolu",
		format: (e) => `${decimal(Math.abs(e))} Md€`,
		plein: 25,
		seuil: 0.1,
	},
	{
		titre: "Cumul d'ici 2070",
		aide: "en milliards d'euros de 2026",
		valeur: (r) => r.cumulEquilibre / 1e9,
		mode: "absolu",
		format: (e) => `${entier(Math.abs(e))} Md€`,
		plein: 800,
		seuil: 1,
	},
];

function Decisions() {
	const { pret, demander, remplacer, annee } = useScenario();
	const navigate = useNavigate();
	const [donnees, setDonnees] = useState<{
		reference: ResultatLeger;
		resultats: ResultatLeger[];
	} | null>(null);

	useEffect(() => {
		if (!pret) return;
		let actif = true;
		demander({
			type: "decisions",
			scenarios: DECISIONS.map((d) => versScenario({ [d.levier]: d.valeur })),
			annee,
		}).then((r) => {
			if (actif) setDonnees({ reference: r.reference, resultats: r.resultats });
		});
		return () => {
			actif = false;
		};
	}, [pret, demander, annee]);

	const essayer = (i: number) => {
		const d = DECISIONS[i];
		if (!d) return;
		remplacer({ [d.levier]: d.valeur });
		navigate({ to: "/simuler", search: { [d.levier]: d.valeur } as never });
	};

	return (
		<main className="wrap large">
			<div className="titre-page">
				<h1>Chaque décision, une par une</h1>
				<p className="sub">
					Chaque ligne applique une seule décision à partir de 2028 et mesure ce
					qui a bougé en {annee}, face à la loi actuelle la même année. Une
					jauge vers la droite est une hausse, vers la gauche une baisse. Aucune
					n'est « bonne » ou « mauvaise » en soi : tout dépend de ce qu'on
					cherche.
				</p>
				<ChoixAnnee />
			</div>

			{donnees ? (
				<div className="defile">
					<table className="table decisions">
						<thead>
							<tr>
								<th>Décision</th>
								{COLONNES.map((c) => (
									<th key={c.titre}>
										{c.titre}
										<small>{c.aide}</small>
									</th>
								))}
								<th />
							</tr>
						</thead>
						{GROUPES.map((g) => {
							const lignes = DECISIONS.map((d, i) => ({ d, i })).filter(
								({ d }) => LEVIER[d.levier].groupe === g.id,
							);
							if (lignes.length === 0) return null;
							return (
								<tbody key={g.id}>
									<tr className="groupe">
										<th colSpan={COLONNES.length + 2}>
											<Icon name={g.icone} size={18} />
											{g.label}
										</th>
									</tr>
									{lignes.map(({ d, i }) => {
										const r = donnees.resultats[i];
										if (!r) return null;
										return (
											<tr key={d.label}>
												<th>
													{d.label}
													<span className="termes">
														{LEVIER[d.levier].termes.map((t) => (
															<span
																key={t}
																className={`terme ${TERMES[t].cote}`}
															>
																<Icon name={TERMES[t].icone} size={14} />
																{TERMES[t].label.toLowerCase()}
															</span>
														))}
													</span>
												</th>
												{COLONNES.map((c) => {
													const ref = c.valeur(donnees.reference);
													const e =
														c.mode === "relatif"
															? (c.valeur(r) / ref - 1) * 100
															: c.valeur(r) - ref;
													const nul = Math.abs(e) < c.seuil;
													const largeur = Math.min(
														50,
														(Math.abs(e) / c.plein) * 50,
													);
													return (
														<td key={c.titre} className="jauge">
															<div className="piste">
																{!nul && (
																	<i
																		className={e > 0 ? "hausse" : "baisse"}
																		style={{ width: `${largeur}%` }}
																	/>
																)}
															</div>
															<span className="num">
																{nul
																	? ""
																	: `${e > 0 ? "+" : "−"}${c.format(e)}`}
															</span>
														</td>
													);
												})}
												<td>
													<button
														type="button"
														className="lien"
														onClick={() => essayer(i)}
													>
														Essayer
														<Icon name="fleche" size={16} />
													</button>
												</td>
											</tr>
										);
									})}
								</tbody>
							);
						})}
					</table>
				</div>
			) : (
				<div className="histo attente" style={{ height: 480 }} />
			)}

			<aside className="note">
				<Icon name="attention" />
				<p>
					<strong>À lire comme des ordres de grandeur.</strong> Les décisions
					sur l'emploi ne changent les carrières qu'à partir de 2028 : leur
					effet sur les pensions est donc lent. Les cotisations en plus ne
					changent aucune pension ici, et le modèle ne dit rien de leur effet
					sur les salaires ou l'emploi. Les totaux portent sur les salariés du
					privé.
				</p>
			</aside>
		</main>
	);
}
