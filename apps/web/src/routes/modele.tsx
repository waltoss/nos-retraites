import {
	BAREMES_FRANCE as B,
	baremeGeneration,
	HYPOTHESES_TRANCHE_0 as H,
} from "@nos-retraites/engine";
import { createFileRoute } from "@tanstack/react-router";
import { Icon, type IconName } from "../components/Icons";
import { ageEnClair, decimal, entier, euros } from "../format";
import { useScenario } from "../scenario";
import sources from "../sources.json";

export const Route = createFileRoute("/modele")({ component: Modele });

const ETAPES: { icone: IconName; titre: string; texte: string }[] = [
	{
		icone: "population",
		titre: "Inventer des vies",
		texte:
			"20 000 personnes nées de 1955 à 2003. Chaque année, un tirage décide si chacune travaille, perd son emploi, s'arrête ou reprend. Les tirages sont les mêmes d'un scénario à l'autre : seul ce que vous changez fait bouger le résultat.",
	},
	{
		icone: "carriere",
		titre: "Tenir leur compte",
		texte:
			"Pour chaque année : les trimestres validés, le salaire retenu sous le plafond, les points de retraite complémentaire. Ce compte ne dépend pas de vos réglages de pension.",
	},
	{
		icone: "age",
		titre: "Décider du départ",
		texte:
			"Chacun part dès qu'il a le taux plein, par la durée ou à 67 ans, et jamais avant l'âge légal. C'est la plus grosse simplification du modèle : dans la réalité, certains partent avec une décote et d'autres continuent.",
	},
	{
		icone: "pension",
		titre: "Calculer la pension",
		texte:
			"Pension de base : salaire annuel moyen × taux × part de carrière validée. Pension complémentaire : points × valeur du point. Les règles sont celles du régime général et de l'Agirc-Arrco.",
	},
	{
		icone: "tableau",
		titre: "Photographier 2026",
		texte:
			"On regarde qui cotise et qui perçoit cette année-là, avec la loi actuelle puis avec votre scénario, et on compare personne par personne.",
	},
];

type CleSource = keyof typeof sources;
const g1969 = baremeGeneration(B.cnav, 1969);
const g1964 = baremeGeneration(B.cnav, 1964);
const A = B.anneeReference;

const exact = (x: number) =>
	x.toLocaleString("fr-FR", {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	});

const PARAMETRES: { nom: string; valeur: string; source: CleSource }[] = [
	{
		nom: "Âge légal, génération 1964",
		valeur: ageEnClair(g1964.ageLegal),
		source: "parGeneration",
	},
	{
		nom: "Âge légal, génération 1969 et suivantes",
		valeur: ageEnClair(g1969.ageLegal),
		source: "parGeneration",
	},
	{
		nom: "Durée requise, génération 1969 et suivantes",
		valeur: `${g1969.dureeRequise} trimestres`,
		source: "parGeneration",
	},
	{
		nom: "Âge du taux plein automatique",
		valeur: ageEnClair(g1969.ageTauxPleinAutomatique),
		source: "parGeneration",
	},
	{
		nom: `Plafond de la Sécurité sociale ${A}`,
		valeur: `${entier(B.cnav.pass[A] ?? 0)} € par an`,
		source: "pass",
	},
	{
		nom: "Années retenues pour le salaire annuel moyen",
		valeur: `les ${B.cnav.nbMeilleuresAnnees} meilleures`,
		source: "salaireAnnuelMoyen",
	},
	{
		nom: "Revalorisation des salaires passés",
		valeur: `table ${A} (un salaire de 2000 compte pour ${decimal((B.cnav.coefficientsRevalorisation[2000] ?? 1) * 100)} %)`,
		source: "coefficientsRevalorisation",
	},
	{
		nom: "Taux plein",
		valeur: `${entier(B.cnav.tauxPlein * 100)} %`,
		source: "tauxPlein",
	},
	{
		nom: "Décote par trimestre manquant",
		valeur: `${(B.cnav.decoteParTrimestre * 100).toLocaleString("fr-FR")} point de taux, ${B.cnav.decoteTrimestresMax} trimestres au plus`,
		source: "decote",
	},
	{
		nom: "Surcote par trimestre",
		valeur: `${(B.cnav.surcoteParTrimestre * 100).toLocaleString("fr-FR")} %`,
		source: "surcote",
	},
	{
		nom: "Salaire qui valide un trimestre",
		valeur: `${entier(B.cnav.heuresSmicParTrimestre(A))} heures de SMIC`,
		source: "validationTrimestre",
	},
	{
		nom: "Trimestres par enfant pour la mère",
		valeur: `${B.cnav.mdaParEnfant}`,
		source: "mda",
	},
	{
		nom: "Majoration pour trois enfants",
		valeur: `${entier(B.cnav.majorationTroisEnfants * 100)} %`,
		source: "majorationEnfants",
	},
	{
		nom: "Minimum contributif",
		valeur: B.cnav.minimumContributif
			? `${exact(B.cnav.minimumContributif.annuel / 12)} € par mois, ${exact(B.cnav.minimumContributif.annuelMajore / 12)} € majoré`
			: "aucun",
		source: "minimumContributif",
	},
	{
		nom: "Cotisation vieillesse de base",
		valeur: `${(B.cnav.tauxCotisation.plafonne * 100).toLocaleString("fr-FR")} % sous le plafond, ${(B.cnav.tauxCotisation.deplafonne * 100).toLocaleString("fr-FR")} % sur tout le salaire`,
		source: "tauxCotisationVieillesse",
	},
	{
		nom: "Valeur du point Agirc-Arrco",
		valeur: `${B.agircArrco.valeurDeServiceDuPoint.toLocaleString("fr-FR")} €`,
		source: "valeurDeServiceDuPoint",
	},
	{
		nom: "Taux qui donnent des points",
		valeur: `${(B.agircArrco.cotisation.tauxTranche1 * 100).toLocaleString("fr-FR")} % sous le plafond, ${entier(B.agircArrco.cotisation.tauxTranche2 * 100)} % au-dessus`,
		source: "tauxAgircArrco",
	},
	{
		nom: "Taux d'appel",
		valeur: `${entier(B.agircArrco.cotisation.tauxAppel * 100)} %`,
		source: "tauxAgircArrco",
	},
	{
		nom: "Contributions sans points",
		valeur: `${(B.agircArrco.cotisation.cegTranche1 * 100).toLocaleString("fr-FR")} % et ${(B.agircArrco.cotisation.cegTranche2 * 100).toLocaleString("fr-FR")} %, plus ${(B.agircArrco.cotisation.cet * 100).toLocaleString("fr-FR")} % au-dessus du plafond`,
		source: "contributions",
	},
	{
		nom: "Minoration de la complémentaire",
		valeur: "1 % par trimestre manquant, puis 1,25 % au-delà de 12",
		source: "coefficientsAnticipation",
	},
	{
		nom: "Points et taux d'avant 2019",
		valeur: "séries Arrco et Agirc reconstituées",
		source: "historiqueArrco",
	},
];

const pc = (x: number) =>
	`${(x * 100).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`;
const HYPOTHESES: { nom: string; valeur: string }[] = [
	{
		nom: "Âge d'entrée dans la vie active",
		valeur: `${decimal(H.ageEntree.moyenne)} ans en moyenne, entre ${H.ageEntree.min} et ${H.ageEntree.max}`,
	},
	{
		nom: "Salaire d'une personne médiane à 40 ans",
		valeur: `${pc(H.profilSalaire.find(([age]) => age === 40)?.[1] ?? 0)} du plafond`,
	},
	{
		nom: "Dispersion des salaires",
		valeur: `écart-type du logarithme de ${H.sigmaPermanent.toLocaleString("fr-FR")}`,
	},
	{
		nom: "Salaire des femmes rapporté aux hommes",
		valeur: pc(H.ecartSalaireFemmes),
	},
	{
		nom: "Risque annuel de perdre son emploi",
		valeur: `${pc(H.depuisEmploi.chomage)} pour une personne médiane, plus en bas de l'échelle`,
	},
	{
		nom: "Retour à l'emploi depuis le chômage",
		valeur: `${pc(H.depuisChomage.emploi)} par an`,
	},
	{
		nom: "Après 55 ans",
		valeur: `sorties de l'emploi × ${H.seniors.multiplicateurSorties.toLocaleString("fr-FR")}, retours ÷ ${H.seniors.diviseurRetours.toLocaleString("fr-FR")}`,
	},
	{
		nom: "Mères qui s'arrêtent après une naissance",
		valeur: `${pc(H.interruptionNaissance.probabilite)}, puis ${pc(H.interruptionNaissance.retourAnnuel)} de retours par an`,
	},
	{
		nom: "Mères à temps partiel",
		valeur: `${pc(H.tempsPartielMeres.part)}, à ${pc(H.tempsPartielMeres.quotite)} d'un temps plein`,
	},
	{
		nom: "Nombre d'enfants",
		valeur: H.repartitionEnfants.map((p, n) => `${n} : ${pc(p)}`).join(", "),
	},
	{ nom: "Cadres", valeur: "le cinquième le mieux payé, environ" },
];

const LIMITES = [
	"Seuls les salariés du privé sont simulés. Ni fonctionnaires, ni indépendants, ni régimes spéciaux.",
	"Toutes les générations pèsent le même poids et personne ne meurt : la population réelle n'est pas reproduite.",
	"Les retraités nés avant 1955 sont absents. Les totaux de cotisations et de pensions ne peuvent donc pas être comparés entre eux.",
	"Pas de natalité, pas d'immigration, pas de projection dans le temps : on photographie 2026.",
	"Personne ne part avec une décote ni ne reste pour une surcote : ces deux réglages existent dans le moteur mais n'auraient aucun effet ici, ils ne sont donc pas proposés.",
	"Pas de départs anticipés pour carrière longue, invalidité ou pénibilité.",
	"Le chômage est toujours indemnisé, donc toujours validé. Les fins de droits n'existent pas.",
	"Chacun est né un 1er janvier. Les générations coupées en cours d'année (1961, 1965) prennent la règle de leur plus longue période.",
	"Avant 1999, tout le monde est supposé cotiser à la caisse UNIRS, aux taux minimaux.",
	"Montants bruts. Ni CSG, ni impôt.",
];

/** Drees, EIR 2020, génération 1953, pension de droit direct brute, tous régimes, en euros de 2020. */
const DREES = {
	annee: 2020,
	d1: 403,
	mediane: 1403,
	d9: 2723,
	femmes: 1133,
	hommes: 1676,
};

function Modele() {
	const { reference } = useScenario();
	const coefficient = B.cnav.coefficientsRevalorisation[DREES.annee] ?? 1;
	const lignes = reference
		? [
				{
					nom: "Pension médiane",
					drees: DREES.mediane,
					simule: reference.pensions.resume.mediane,
				},
				{
					nom: "1er décile, les plus petites pensions",
					drees: DREES.d1,
					simule: reference.pensions.resume.deciles[0] ?? 0,
				},
				{
					nom: "9e décile, les plus hautes",
					drees: DREES.d9,
					simule: reference.pensions.resume.deciles[8] ?? 0,
				},
				{
					nom: "Pension médiane des femmes",
					drees: DREES.femmes,
					simule: reference.parSexe.F.pensionMediane,
				},
				{
					nom: "Pension médiane des hommes",
					drees: DREES.hommes,
					simule: reference.parSexe.H.pensionMediane,
				},
			]
		: [];
	return (
		<main className="wrap large">
			<div className="titre-page">
				<h1>Sous le capot</h1>
				<p className="sub">
					Ce que le modèle fait, d'où viennent ses chiffres, ce qu'il suppose et
					ce qu'il ignore. Rien ici n'est caché : si une hypothèse vous paraît
					fausse, elle l'est peut-être.
				</p>
			</div>

			<section className="bloc">
				<h2>Cinq étapes</h2>
				<ol className="etapes">
					{ETAPES.map((e) => (
						<li key={e.titre}>
							<Icon name={e.icone} size={26} />
							<strong>{e.titre}</strong>
							<p>{e.texte}</p>
						</li>
					))}
				</ol>
			</section>

			<section className="bloc">
				<h2>Face aux chiffres publics</h2>
				<p className="sub">
					La Drees publie la distribution des pensions de la génération 1953,
					tous régimes confondus. Le modèle simule les retraités du privé nés de
					1955 à 1964. Les deux ne recouvrent pas la même population, mais
					l'écart dit où le modèle se trompe.
				</p>
				{reference ? (
					<table className="table">
						<thead>
							<tr>
								<th />
								<th>Drees, en euros de {A}</th>
								<th>Modèle</th>
								<th>Écart</th>
							</tr>
						</thead>
						<tbody>
							{lignes.map((l) => {
								const cible = l.drees * coefficient;
								const e = (l.simule / cible - 1) * 100;
								return (
									<tr key={l.nom} className={Math.abs(e) > 10 ? "change" : ""}>
										<th>{l.nom}</th>
										<td className="num">{euros(cible)}</td>
										<td className="num">{euros(l.simule)}</td>
										<td className="num">
											{e > 0 ? "+" : "−"}
											{entier(Math.abs(e))} %
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				) : (
					<div className="histo attente" style={{ height: 220 }} />
				)}
				<p className="reserve">
					Source : Drees, échantillon interrégimes de retraités 2020, pensions
					de droit direct brutes, converties en euros de {A} avec le coefficient
					de revalorisation de la Cnav ({coefficient.toLocaleString("fr-FR")}).
					Les lignes surlignées s'écartent de plus de 10 %. Le bas de la
					distribution est faux : le modèle ne produit pas de carrières très
					courtes, et il sous-estime l'écart entre femmes et hommes.
				</p>
			</section>

			<section className="bloc">
				<h2>Ce qui vient de la loi</h2>
				<p className="sub">
					Ces valeurs ont été lues dans les textes et barèmes publics. Le lien
					mène à la source.
				</p>
				<table className="table">
					<tbody>
						{PARAMETRES.map((p) => {
							const s = sources[p.source];
							return (
								<tr key={p.nom}>
									<th>{p.nom}</th>
									<td className="num">{p.valeur}</td>
									<td>
										{s.url ? (
											<a
												href={s.url}
												title={s.source ?? undefined}
												rel="noreferrer"
											>
												{new URL(s.url).hostname.replace(/^www\./, "")}
											</a>
										) : (
											"source à compléter"
										)}
									</td>
								</tr>
							);
						})}
					</tbody>
				</table>
				<p className="reserve">
					Les séries d'avant 2019 de la retraite complémentaire viennent des
					barèmes de l'Institut des politiques publiques, une source secondaire
					: l'historique officiel n'était pas accessible.
				</p>
			</section>

			<section className="bloc">
				<h2>Ce qui est posé à la main</h2>
				<p className="sub">
					Ces chiffres ne viennent d'aucune statistique. Ils ont été choisis
					pour que les carrières soient plausibles, et devront être calés sur
					les données de l'Insee et de la Drees.
				</p>
				<table className="table">
					<tbody>
						{HYPOTHESES.map((h) => (
							<tr key={h.nom}>
								<th>{h.nom}</th>
								<td className="num">{h.valeur}</td>
							</tr>
						))}
					</tbody>
				</table>
			</section>

			<section className="bloc">
				<h2>Ce que le modèle ne fait pas</h2>
				<ul className="limites">
					{LIMITES.map((l) => (
						<li key={l}>{l}</li>
					))}
				</ul>
			</section>
		</main>
	);
}
