import {
	BAREMES_FRANCE as B,
	baremeGeneration,
	HYPOTHESES as H,
} from "@nos-retraites/engine";
import { createFileRoute } from "@tanstack/react-router";
import calage from "../calage.json";
import { Icon, type IconName } from "../components/Icons";
import { ageEnClair, decimal, entier, euros } from "../format";
import recoupement from "../recoupement.json";
import sources from "../sources.json";

export const Route = createFileRoute("/modele")({ component: Modele });

const ETAPES: { icone: IconName; titre: string; texte: string }[] = [
	{
		icone: "population",
		titre: "Inventer des vies",
		texte:
			"20 000 personnes nées de 1930 à 2008. Chaque année, des tirages décident si chacune travaille, perd son emploi, tombe malade ou s'arrête, et pour combien de mois. Les salaires sont réglés sur ceux du privé en 2025, les durées de carrière sur celles de la génération 1953. Les tirages sont les mêmes d'un scénario à l'autre : seul ce que vous changez fait bouger le résultat.",
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
		titre: "Photographier, puis projeter",
		texte:
			"On regarde qui cotise et qui perçoit en 2026, puis chaque année jusqu'en 2070 : la population suit la projection de l'Insee, les salaires celle du COR. Une réforme ne touche que ceux qui partent à partir de 2028.",
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
		valeur: `${decimal(H.ageEntree.moyenne)} ans en moyenne depuis la génération 1975, ${decimal(H.ageEntree.moyenne + (H.decalageEntree[0]?.[1] ?? 0))} ans pour la génération 1953`,
	},
	{
		nom: "Salaire d'une personne médiane à 40 ans",
		valeur: `${pc((H.profilSalaire.find(([age]) => age === 40)?.[1] ?? 0) * H.niveauSalaire)} du plafond`,
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
		nom: "Durée moyenne d'une période de chômage",
		valeur: `${decimal(H.dureeMois.chomage)} mois`,
	},
	{
		nom: "Après 55 ans",
		valeur: `sorties de l'emploi × ${decimal(H.seniors.multiplicateurSorties)}, périodes hors emploi × ${decimal(H.seniors.multiplicateurDurees)}`,
	},
	{
		nom: "Congé maternité",
		valeur: `${H.dureeMois.maternite} mois par naissance`,
	},
	{
		nom: "Mères qui s'arrêtent après une naissance",
		valeur: `${pc(H.interruptionNaissance.probabilite)} par naissance pour la génération 1953, pour ${entier(H.interruptionNaissance.dureeMois / 12)} ans en moyenne ; ${pc(H.interruptionNaissance.partDefinitive)} ne reprennent jamais`,
	},
	{
		nom: "Carrières partielles en France",
		valeur: `${pc(H.carrierePartielle.part.F)} des femmes et ${pc(H.carrierePartielle.part.H)} des hommes, présents de ${H.carrierePartielle.dureeMin} à ${entier(H.carrierePartielle.dureeMax)} ans`,
	},
	{
		nom: "Mères au foyer dont les années sont validées",
		valeur: `${pc(H.avpf.part)}, tant que le dernier enfant a moins de 3 ans`,
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
	"Les effectifs par âge de fin 2024 sont appliqués à 2026. Avant 24 ans le modèle manque d'apprentis et d'emplois étudiants, et les plus de 96 ans sont absents.",
	"À âge égal, tous les retraités ont la même chance d'être encore en vie. En réalité les pensions élevées vivent plus longtemps.",
	"Les pensions des retraités les plus âgés sont recalculées avec les barèmes d'aujourd'hui, pas avec ceux de l'année de leur départ.",
	"Pas de pensions de réversion.",
	"La projection suit le scénario central de l'Insee (1,45 enfant par femme, 150 000 entrées nettes par an) et les hypothèses du COR (salaires à +0,7 % par an au-dessus des prix). Natalité, immigration et croissance ne sont pas encore réglables.",
	"Dans la projection, la part de chaque âge qui relève du privé reste celle d'aujourd'hui. Les générations futures de retraités, presque toutes passées par le privé, sont donc sous-comptées.",
	"Une réforme s'applique d'un coup en 2028 à tous ceux qui ne sont pas partis, sans montée en charge par génération.",
	"Personne ne part avec une décote ni ne reste pour une surcote : ces deux réglages existent dans le moteur mais n'auraient aucun effet ici, ils ne sont donc pas proposés.",
	"Pas de départs anticipés pour carrière longue, invalidité ou pénibilité.",
	"Le chômage est toujours indemnisé, donc toujours validé. Les fins de droits n'existent pas.",
	"Les années de parent au foyer sont validées sans condition de ressources, sur une règle simplifiée.",
	"Le réglage porte sur une seule génération, née en 1953. Les générations suivantes sont supposées lui ressembler, à l'âge d'entrée et aux arrêts pour enfant près.",
	"Une année se découpe en mois d'emploi, de chômage, de maladie ou d'inactivité, avec au plus une période hors emploi qui commence par an.",
	"Chacun est né un 1er janvier. Les générations coupées en cours d'année (1961, 1965) prennent la règle de leur plus longue période.",
	"Avant 1999, tout le monde est supposé cotiser à la caisse UNIRS, aux taux minimaux.",
	"Montants bruts. Ni CSG, ni impôt.",
];

const mesure = (nom: string) => {
	const m = calage.find((x) => x.nom === nom);
	return m ?? { nom, modele: 0, cible: 0, cale: false };
};
const somme = (...noms: string[]) =>
	noms
		.map(mesure)
		.reduce(
			(t, m) => ({ modele: t.modele + m.modele, cible: t.cible + m.cible }),
			{ modele: 0, cible: 0 },
		);

interface Ligne {
	nom: string;
	modele: number;
	cible: number;
}
interface Comparaison {
	titre: string;
	texte: string;
	source: string;
	/** Écrit une valeur ; l'écart est donné en pourcentage, ou en points pour les parts. */
	format: (x: number) => string;
	enPoints?: boolean;
	lignes: Ligne[];
}

const sexes = [
	["femmes", "Femmes"],
	["hommes", "Hommes"],
] as const;

const COMPARAISONS: Comparaison[] = [
	{
		titre: "Effectifs et masses en 2026",
		texte:
			"Chaque personne simulée représente les personnes réelles de son âge et de son sexe qui relèvent du privé. La part du privé à chaque âge est réglée sur les cotisants et les retraités de l'Agirc-Arrco : l'accord sur les effectifs est donc voulu. Les masses, elles, sont une vérification.",
		source:
			"Insee, pyramide des âges au 1er janvier 2026 ; Agirc-Arrco et Drees pour les effectifs de fin 2024 ; comptes 2025 du régime général et de l'Agirc-Arrco. Les cotisations publiées incluent les indépendants, les pensions publiées datent de 2024.",
		format: (x) => decimal(x),
		lignes: recoupement.map((l) => ({
			nom: `${l.nom}, en ${l.unite}`,
			modele: l.modele,
			cible: l.cible,
		})),
	},
	{
		titre: "Salaires de 2025",
		texte:
			"Salaire à temps plein des personnes en emploi, en multiples du SMIC. Ces chiffres servent à régler le modèle : l'accord est voulu.",
		source:
			"Insee Première n° 2132, salaires nets du secteur privé en équivalent temps plein, 2025.",
		format: (x) => `${decimal(x)} SMIC`,
		lignes: sexes.flatMap(([cle, nom]) => [
			{ ...mesure(`${cle} salaire d1 (SMIC)`), nom: `${nom}, 1er décile` },
			{ ...mesure(`${cle} salaire d5Mediane (SMIC)`), nom: `${nom}, médiane` },
			{ ...mesure(`${cle} salaire d9 (SMIC)`), nom: `${nom}, 9e décile` },
		]),
	},
	{
		titre: "Durées de carrière, génération 1953",
		texte:
			"Années cotisées par le travail, années validées en comptant chômage, maladie et enfants. Ces chiffres servent aussi à régler le modèle.",
		source: "Drees, échantillon interrégimes de retraités 2020, tous régimes.",
		format: (x) => `${decimal(x)} ans`,
		lignes: sexes.flatMap(([cle, nom]) => [
			{
				...mesure(`${cle} durée cotisée moyenne (ans)`),
				nom: `${nom}, durée cotisée moyenne`,
			},
			{
				...mesure(`${cle} durée validée moyenne (ans)`),
				nom: `${nom}, durée validée moyenne`,
			},
		]),
	},
	{
		titre: "Carrières courtes et complètes, génération 1953",
		texte: "Part des retraités de chaque sexe. Sert au réglage.",
		source: "Drees, échantillon interrégimes de retraités 2020, tous régimes.",
		format: (x) => `${entier(x)} %`,
		enPoints: true,
		lignes: sexes.flatMap(([cle, nom]) => [
			{
				...somme(
					`${cle} durée cotisée moinsDe10ans (%)`,
					`${cle} durée cotisée de10a20ans (%)`,
				),
				nom: `${nom}, moins de 20 ans cotisés`,
			},
			{
				...mesure(`${cle} carrière complète (%)`),
				nom: `${nom}, carrière complète`,
			},
		]),
	},
	{
		titre: "Pensions, génération 1953",
		texte:
			"Pension mensuelle brute. Ces chiffres ne servent pas au réglage : c'est la vérification. La Drees compte tous les régimes, fonctionnaires et indépendants compris ; le modèle ne connaît que les salariés du privé, dont la pension moyenne est plus basse d'environ 8 %.",
		source: `Drees, échantillon interrégimes de retraités 2020, pensions de droit direct, portées en euros de ${A} avec le coefficient de revalorisation de la Cnav.`,
		format: (x) => euros(x),
		lignes: [
			{
				...mesure("ensemble pension D1"),
				nom: "1er décile, les plus petites pensions",
			},
			{ ...mesure("ensemble pension médiane"), nom: "Médiane" },
			{ ...mesure("ensemble pension D9"), nom: "9e décile, les plus hautes" },
			{ ...mesure("femmes pension médiane"), nom: "Médiane des femmes" },
			{ ...mesure("hommes pension médiane"), nom: "Médiane des hommes" },
		],
	},
];

function Modele() {
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
					Le modèle est réglé sur les salaires et les durées de carrière
					publiés. Les pensions qu'il en déduit sont ensuite confrontées à
					celles que la Drees observe. Les lignes surlignées s'écartent de plus
					de 10 %, ou de plus de 5 points pour les parts.
				</p>
				{COMPARAISONS.map((c) => (
					<div key={c.titre} className="comparaison">
						<h3>{c.titre}</h3>
						<p className="reserve">{c.texte}</p>
						<table className="table">
							<thead>
								<tr>
									<th />
									<th>Observé</th>
									<th>Modèle</th>
									<th>Écart</th>
								</tr>
							</thead>
							<tbody>
								{c.lignes.map((l) => {
									const e = c.enPoints
										? l.modele - l.cible
										: (l.modele / l.cible - 1) * 100;
									const fort = Math.abs(e) > (c.enPoints ? 5 : 10);
									return (
										<tr key={l.nom} className={fort ? "change" : ""}>
											<th>{l.nom}</th>
											<td className="num">{c.format(l.cible)}</td>
											<td className="num">{c.format(l.modele)}</td>
											<td className="num">
												{e >= 0 ? "+" : "−"}
												{entier(Math.abs(e))} {c.enPoints ? "pt" : "%"}
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
						<p className="reserve">Source : {c.source}</p>
					</div>
				))}
				<div className="comparaison">
					<h3>Règles de calcul</h3>
					<p className="reserve">
						Le Conseil d'orientation des retraites publie le taux de
						remplacement de carrières types. Pour la génération 1964, le moteur
						retrouve à moins de 2 % ceux du cadre et du non-cadre à carrière
						continue. Il s'en écarte sur les carrières interrompues : 12 % de
						trop après du chômage, 8 % de moins après un arrêt pour enfant.
					</p>
					<p className="reserve">
						Source : COR, rapport annuel de juin 2026, tableau 3.3.
					</p>
				</div>
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
				<h2>Ce qui est ajusté</h2>
				<p className="sub">
					Aucune statistique ne donne ces chiffres directement. Un programme les
					ajuste jusqu'à ce que les salaires et les durées de carrière simulés
					ressemblent aux chiffres publiés ci-dessus. D'autres valeurs
					donneraient peut-être un accord aussi bon.
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
