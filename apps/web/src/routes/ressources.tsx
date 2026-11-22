import {
	type AnneeSysteme,
	ASSIETTES,
	POSTES_RESSOURCES,
	type ProjectionCapitalisation,
	RENDEMENTS_CAPITALISATION,
	SOURCE_RESSOURCES,
	SOURCES_CAPITALISATION,
} from "@nos-retraites/engine";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ChoixAnnee } from "../components/ChoixAnnee";
import { PanneauLeviers } from "../components/PanneauLeviers";
import { Courbe } from "../components/Trajectoires";
import { decimal, entier, euros } from "../format";
import { useScenario } from "../scenario";

export const Route = createFileRoute("/ressources")({ component: Ressources });

interface Donnees {
	systeme: { reference: AnneeSysteme[]; courant: AnneeSysteme[] };
	capitalisation: ProjectionCapitalisation | null;
	anneeEffet: number;
}

const md = (x: number) => x / 1e9;
const milliards = (y: number) => `${entier(y)} milliards`;
const signe = (y: number) =>
	`${y > 0 ? "+" : y < 0 ? "−" : ""}${decimal(Math.abs(y))}`;
const relatif = (y: number) => `${y < -0.05 ? "−" : ""}${decimal(Math.abs(y))}`;
const pourcent = (y: number) => `${decimal(y)} %`;
const totalObserve =
	SOURCE_RESSOURCES.cotisationsMilliards +
	POSTES_RESSOURCES.reduce((t, p) => t + p.milliards, 0);

/** Une ligne de la structure observée : montant, part du total, barre. */
function Ligne({
	nom,
	milliards: montant,
	suit,
	fort = false,
}: {
	nom: string;
	milliards: number;
	suit: string;
	fort?: boolean;
}) {
	const part = (100 * montant) / totalObserve;
	return (
		<tr className={fort ? "fort" : ""}>
			<th scope="row">{nom}</th>
			<td className="num">{decimal(montant)}</td>
			<td className="num barre">
				<span style={{ width: `${part}%` }} />
				{decimal(part)} %
			</td>
			<td>{suit}</td>
		</tr>
	);
}

function Ressources() {
	const { pret, demander, scenario, annee, modifies } = useScenario();
	const [donnees, setDonnees] = useState<Donnees | null>(null);

	useEffect(() => {
		if (!pret) return;
		let actif = true;
		const t = setTimeout(() => {
			demander({ type: "projection", scenario }).then((r) => {
				if (actif)
					setDonnees({
						systeme: r.systeme,
						capitalisation: r.capitalisation,
						anneeEffet: r.anneeEffet,
					});
			});
		}, 200);
		return () => {
			actif = false;
			clearTimeout(t);
		};
	}, [pret, demander, scenario]);

	const c = scenario.capitalisation;
	return (
		<main className="atelier">
			<PanneauLeviers />
			<div className="etabli">
				<div className="titre-page">
					<h1>Ressources et capitalisation</h1>
					<p className="sub">
						D'où vient l'argent des retraites en dehors des cotisations, ce
						qu'un scénario y ajoute, et ce que donnerait un étage par
						capitalisation. Les réglages correspondants sont dans « Cotisations
						et autres ressources » et « Capitalisation ».
					</p>
				</div>

				<section className="bloc">
					<h2>D'où vient l'argent, en {SOURCE_RESSOURCES.annee}</h2>
					<p className="sub">
						Tous régimes, en milliards d'euros. Un tiers des ressources ne vient
						pas des cotisations : l'État employeur, des impôts affectés, des
						transferts d'autres caisses.
					</p>
					<div className="defile">
						<table className="table ressources num">
							<thead>
								<tr>
									<th>Poste</th>
									<th>Milliards</th>
									<th>Part</th>
									<th>Dans un scénario, il suit</th>
								</tr>
							</thead>
							<tbody>
								<Ligne
									nom="Cotisations"
									milliards={SOURCE_RESSOURCES.cotisationsMilliards}
									suit="les salaires, les taux et l'emploi simulés"
									fort
								/>
								{POSTES_RESSOURCES.map((p) => (
									<Ligne
										key={p.id}
										nom={p.libelle}
										milliards={p.milliards}
										suit={ASSIETTES[p.assiette].libelle}
									/>
								))}
							</tbody>
						</table>
					</div>
					<p className="reserve">
						Source :{" "}
						<a href={SOURCE_RESSOURCES.url}>
							Conseil d'orientation des retraites, rapport de juin 2026, tableau
							2.2
						</a>
						, hors produits financiers. Aujourd'hui chaque poste suit la masse
						des salaires du privé : plus de monde au travail, c'est plus
						d'impôts et de transferts. C'est une hypothèse simple, la même pour
						tous les postes. Le moteur est construit pour donner à chacun sa
						propre règle : une CSG qui suivrait les pensions, par exemple, ou
						une contribution de l'État qui suivrait ses propres retraités.
					</p>
				</section>

				{donnees ? (
					<>
						<Scenario donnees={donnees} annee={annee} modifies={modifies} />
						<section className="bloc">
							<h2>Un étage par capitalisation</h2>
							{c && donnees.capitalisation ? (
								<Capitalisation
									projection={donnees.capitalisation}
									systeme={donnees.systeme.courant}
									annee={annee}
									anneeEffet={donnees.anneeEffet}
									taux={c.taux}
									rendement={c.rendement}
								/>
							) : (
								<p className="sub">
									Aucun versement n'est réglé. Ouvrez « Capitalisation » dans
									les réglages et choisissez une part du salaire : les courbes
									du fonds apparaîtront ici.
								</p>
							)}
							<Hypotheses />
						</section>
					</>
				) : (
					<div className="histo attente" style={{ height: 420 }} />
				)}
			</div>
		</main>
	);
}

function Scenario({
	donnees,
	annee,
	modifies,
}: {
	donnees: Donnees;
	annee: number;
	modifies: number;
}) {
	const { reference, courant } = donnees.systeme;
	const serie = (annees: AnneeSysteme[], f: (a: AnneeSysteme) => number) =>
		annees.map((a) => ({ x: a.annee, y: f(a) }));
	const r = reference.find((a) => a.annee === annee);
	const s = courant.find((a) => a.annee === annee);
	const communs = { anneeEffet: donnees.anneeEffet };
	const nouvelles = courant.some((a) => a.ressourcesNouvelles !== 0);
	const detournees = courant.some((a) => a.cotisationsDetournees !== 0);
	return (
		<section className="bloc">
			<div className="detail-annee">
				<h2>
					{modifies > 0 ? "Dans votre scénario" : "Avec la loi actuelle"},
					jusqu'en 2070
				</h2>
				<ChoixAnnee />
			</div>
			<p className="sub">
				En milliards d'euros de 2026, tous régimes.
				{modifies > 0 && " Le pointillé rappelle la loi actuelle."}
			</p>
			<div className="courbes">
				<Courbe
					{...communs}
					titre="Cotisations"
					aide="Salariés, employeurs, indépendants."
					reference={serie(reference, (a) => md(a.cotisations))}
					courant={serie(courant, (a) => md(a.cotisations))}
					couleur="var(--cotisants)"
					format={milliards}
				/>
				<Courbe
					{...communs}
					titre="Autres ressources"
					aide="État, impôts affectés, transferts, ressources nouvelles."
					reference={serie(reference, (a) => md(a.autresRessources))}
					courant={serie(courant, (a) => md(a.autresRessources))}
					couleur="var(--cotisants)"
					format={milliards}
				/>
				<Courbe
					{...communs}
					titre="Ressources nouvelles du scénario"
					aide="Ce que le réglage ajoute ou retire chaque année."
					reference={serie(courant, (a) => md(a.ressourcesNouvelles))}
					courant={serie(courant, (a) => md(a.ressourcesNouvelles))}
					couleur="var(--besoin)"
					format={milliards}
					depuisZero
					sansReference
				/>
				<Courbe
					{...communs}
					titre="Ressources moins dépenses"
					aide="Sous zéro, il manque de l'argent."
					reference={serie(reference, (a) => md(a.solde))}
					courant={serie(courant, (a) => md(a.solde))}
					couleur="var(--besoin)"
					format={(y) => `${signe(y)} milliards`}
					depuisZero
				/>
			</div>
			{r && s && (
				<div className="defile">
					<table className="table ressources num">
						<thead>
							<tr>
								<th>En {annee}, en milliards d'euros de 2026</th>
								<th>Loi actuelle</th>
								<th>Scénario</th>
								<th>Écart</th>
							</tr>
						</thead>
						<tbody>
							<Compare
								nom="Cotisations"
								r={r.cotisations}
								s={s.cotisations}
								fort
							/>
							{detournees && (
								<Compare
									nom="dont parties vers la capitalisation"
									r={0}
									s={-s.cotisationsDetournees}
								/>
							)}
							{POSTES_RESSOURCES.map((p) => (
								<Compare
									key={p.id}
									nom={p.libelle}
									r={r.postes[p.id]}
									s={s.postes[p.id]}
								/>
							))}
							{nouvelles && (
								<Compare
									nom="Ressources nouvelles"
									r={0}
									s={s.ressourcesNouvelles}
								/>
							)}
							<Compare
								nom="Total des ressources"
								r={r.ressources}
								s={s.ressources}
								fort
							/>
							<Compare nom="Dépenses" r={r.depenses} s={s.depenses} fort />
							<Compare
								nom="Ressources moins dépenses"
								r={r.solde}
								s={s.solde}
								fort
							/>
						</tbody>
					</table>
				</div>
			)}
			<p className="reserve">
				Une ressource nouvelle est prise telle qu'annoncée : son montant de 2028
				garde ensuite la même part de la richesse du pays. Le modèle ne vérifie
				pas ce qu'un impôt rapporterait, ne dit pas qui le paie et ne chiffre
				pas son effet sur l'emploi.
			</p>
		</section>
	);
}

function Compare({
	nom,
	r,
	s,
	fort = false,
}: {
	nom: string;
	r: number;
	s: number;
	fort?: boolean;
}) {
	const d = md(s - r);
	return (
		<tr className={fort ? "fort" : Math.abs(d) >= 0.05 ? "change" : ""}>
			<th scope="row">{nom}</th>
			<td>{relatif(md(r))}</td>
			<td>{relatif(md(s))}</td>
			<td>{Math.abs(d) >= 0.05 ? signe(d) : ""}</td>
		</tr>
	);
}

function Capitalisation({
	projection,
	systeme,
	annee,
	anneeEffet,
	taux,
	rendement,
}: {
	projection: ProjectionCapitalisation;
	systeme: AnneeSysteme[];
	annee: number;
	anneeEffet: number;
	taux: number;
	rendement: number;
}) {
	const a = projection.annees.find((x) => x.annee === annee);
	const pib = (x: number) => systeme.find((y) => y.annee === x)?.pib ?? 1;
	const serie = (
		f: (x: ProjectionCapitalisation["annees"][number]) => number,
	) => projection.annees.map((x) => ({ x: x.annee, y: f(x) }));
	// Moyenne glissante sur cinq générations : chacune ne compte que quelques centaines de personnes simulées.
	const generations = projection.generations
		.map((g, i, toutes) => {
			const voisines = toutes.slice(Math.max(0, i - 2), i + 3);
			const moyenne = (f: (x: typeof g) => number) =>
				voisines.reduce((t, x) => t + f(x), 0) / voisines.length;
			return {
				generation: g.generation,
				rente: moyenne((x) => x.renteMoyenne),
				part: moyenne(
					(x) => (100 * x.renteMoyenne) / (x.renteMoyenne + x.pensionMoyenne),
				),
			};
		})
		.filter((g) => g.generation >= 1965 && g.generation <= 2005);
	const communs = { anneeEffet, sansReference: true };
	const points = (f: (g: (typeof generations)[number]) => number) =>
		generations.map((g) => ({ x: g.generation, y: f(g) }));
	return (
		<>
			<p className="sub">
				Chaque salarié du privé verse {decimal(taux * 100)} % de son salaire
				brut sur un compte à partir de {anneeEffet}. Le compte rapporte{" "}
				{decimal(rendement * 100)} % par an au-dessus des prix, puis devient une
				rente à vie au départ. En euros de 2026.
			</p>
			{a && (
				<div className="faits">
					<div className="fait">
						<strong className="num">{milliards(md(a.versements))}</strong>
						<span>versés sur les comptes en {annee}</span>
					</div>
					<div className="fait">
						<strong className="num">{milliards(md(a.rentes))}</strong>
						<span>de rentes payées par le fonds en {annee}</span>
					</div>
					<div className="fait">
						<strong className="num">
							{pourcent((100 * a.encours) / pib(annee))}
						</strong>
						<span>
							de la richesse du pays dans le fonds, soit{" "}
							{milliards(md(a.encours))}
						</span>
					</div>
					<div className="fait">
						<strong className="num">
							{a.rentiers > 0 ? euros(a.rentes / a.rentiers / 12) : "0 €"}
						</strong>
						<span>de rente mensuelle moyenne, pour ceux qui en ont une</span>
					</div>
				</div>
			)}
			<div className="courbes">
				<Courbe
					{...communs}
					titre="Versements chaque année"
					aide="Ce qui entre dans le fonds."
					reference={serie((x) => md(x.versements))}
					courant={serie((x) => md(x.versements))}
					couleur="var(--cotisants)"
					format={milliards}
					depuisZero
				/>
				<Courbe
					{...communs}
					titre="Rentes payées chaque année"
					aide="Ce qui en sort : presque rien avant vingt ans."
					reference={serie((x) => md(x.rentes))}
					courant={serie((x) => md(x.rentes))}
					couleur="var(--retraites)"
					format={milliards}
					depuisZero
				/>
				<Courbe
					{...communs}
					titre="Taille du fonds"
					aide="En part de la richesse produite dans l'année."
					reference={serie((x) => (100 * x.encours) / pib(x.annee))}
					courant={serie((x) => (100 * x.encours) / pib(x.annee))}
					couleur="var(--ink)"
					format={pourcent}
					depuisZero
				/>
				<Courbe
					{...communs}
					titre="Rente au départ, par génération"
					aide="Rente mensuelle moyenne, ceux qui n'ont rien versé compris."
					reference={points((g) => g.rente)}
					courant={points((g) => g.rente)}
					couleur="var(--retraites)"
					format={euros}
					depuisZero
					enTete="Nés en"
					anneeEffet={generations[0]?.generation ?? 1965}
				/>
			</div>
			<p className="reserve">
				Pour les personnes nées en {generations.at(-1)?.generation}, la rente
				ferait {decimal(generations.at(-1)?.part ?? 0)} % du total pension plus
				rente ; pour celles nées en 1975,{" "}
				{decimal(generations.find((g) => g.generation === 1975)?.part ?? 0)} %.
				Les fonctionnaires et les indépendants ne sont pas dans ce calcul.
			</p>
		</>
	);
}

function Hypotheses() {
	const niveaux = [
		["Bas", RENDEMENTS_CAPITALISATION.bas],
		["Central", RENDEMENTS_CAPITALISATION.central],
		["Haut", RENDEMENTS_CAPITALISATION.haut],
	] as const;
	return (
		<>
			<h3>Les hypothèses de rendement</h3>
			<div className="defile">
				<table className="table">
					<thead>
						<tr>
							<th>Hypothèse</th>
							<th>Par an, au-dessus des prix</th>
							<th>D'où vient ce chiffre</th>
						</tr>
					</thead>
					<tbody>
						{niveaux.map(([nom, n]) => (
							<tr key={nom}>
								<th scope="row">{nom}</th>
								<td className="num">{decimal(n.valeur * 100)} %</td>
								<td>
									{n.base}{" "}
									<a href={SOURCES_CAPITALISATION[n.source]?.url}>
										{SOURCES_CAPITALISATION[n.source]?.titre}
									</a>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
			<h3>Ce que cette version ne fait pas</h3>
			<ul className="limites">
				<li>
					Le rendement est le même chaque année. Un vrai fonds monte et baisse :
					deux personnes parties à cinq ans d'écart peuvent avoir des rentes
					très différentes pour les mêmes versements.
				</li>
				<li>
					Les pensions par répartition ne changent pas. Si le versement est pris
					sur les cotisations, le modèle montre l'argent qui manque, pas une
					baisse des droits qui irait avec.
				</li>
				<li>
					La rente est calculée au même tarif pour les femmes et les hommes,
					avec la mortalité des projections de l'Insee, et suit les prix. Aucune
					sortie en capital, aucune réversion.
				</li>
				<li>
					Le compte de quelqu'un qui meurt avant son départ reste dans le fonds
					et n'est pas suivi.
				</li>
				<li>
					Aucun effet sur l'économie : ni sur l'épargne des ménages, ni sur
					l'investissement, ni sur l'emploi si le versement renchérit le
					travail.
				</li>
			</ul>
		</>
	);
}
