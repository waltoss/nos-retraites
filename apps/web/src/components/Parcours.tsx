import {
	type Affiliation,
	BAREMES_FRANCE as B,
	type CompteCarriere,
	cotisationsAnnee,
	MODELE,
	moisParEtat,
	valeur,
} from "@nos-retraites/engine";
import { useEffect, useMemo, useState } from "react";
import type { Exemple } from "../engine.worker";
import { ageEnClair, decimal, entier, euros } from "../format";
import { persona } from "../personas";
import {
	affiliationDe,
	type LigneRegime,
	regimesDe,
	statutDe,
} from "../regimes";
import { useScenario } from "../scenario";
import { Avatar } from "./Avatar";
import { Icon } from "./Icons";

/** Années montrées après le départ : la pension ne bouge plus, inutile d'aller loin. */
const ANNEES_DE_RETRAITE = 8;
/** Durée d'une année à l'écran, en millisecondes. */
const TEMPO = 520;

/** Ce qu'un régime sait d'une personne à un âge donné. */
interface EtatRegime {
	/** Cotisations de l'année versées à ce régime, en euros de l'époque. */
	cotisation: number;
	/** Droits acquis dans l'année : trimestres pour une base, points pour une complémentaire. */
	acquis: number;
	/** Droits cumulés depuis le début de la carrière. */
	cumul: number;
}

interface Pas {
	age: number;
	annee: number;
	retraite: boolean;
	/** Sous quel statut l'année est travaillée ; null quand elle ne l'est pas. */
	statut: { court: string; couleur: string } | null;
	salaire: number;
	/** Salaire rapporté au plafond de la Sécurité sociale de l'année. */
	part: number;
	/** Trimestres comptés sans cotisation : chômage, maladie, maternité. */
	assimiles: number;
	regimes: Record<string, EtatRegime>;
}

const moduleDe = (compte: CompteCarriere): Affiliation | undefined =>
	MODELE.affiliations[compte.affiliation] ??
	Object.values(MODELE.affiliations).find((a) => a.id === compte.affiliation);

const etageDe = (regime: string) =>
	MODELE.regimes.find((r) => r.id === regime)?.etage ?? "base";

/** La vie d'un exemple, âge par âge, avec ce que chaque régime en retient. */
function derouler(exemple: Exemple): Pas[] {
	const { carriere, compte, pension } = exemple.detail.scenario;
	const comptes = [compte, ...(compte.autres ?? [])];
	const ageDepart = Math.floor(pension.liquidation.age / 4);
	const cumuls: Record<string, number> = {};
	const pas: Pas[] = [];
	carriere.annees.forEach((a, i) => {
		const age = a.annee - carriere.anneeNaissance;
		if (age >= ageDepart + ANNEES_DE_RETRAITE) return;
		const retraite = age >= ageDepart;
		const mois = moisParEtat(a);
		const regimes: Record<string, EtatRegime> = {};
		let assimiles = 0;
		if (!retraite)
			for (const c of comptes) {
				const m = moduleDe(c);
				if (!m) continue;
				const cotise =
					MODELE.affiliations[a.affiliation] === m
						? cotisationsAnnee(a, B)
						: { base: 0, complementaire: 0 };
				assimiles = Math.max(assimiles, c.trimestresAssimiles[i] ?? 0);
				for (const r of m.regimes) {
					const etage = etageDe(r);
					const acquis =
						etage === "complementaire"
							? (c.points[i] ?? 0)
							: etage === "integre"
								? // Fonction publique : seuls les services comptent dans le taux de la pension.
									(c.trimestresCotises[i] ?? 0)
								: (c.trimestresCotises[i] ?? 0) +
									(c.trimestresAssimiles[i] ?? 0);
					cumuls[r] = (cumuls[r] ?? 0) + acquis;
					regimes[r] = {
						cotisation:
							etage === "complementaire"
								? cotise.complementaire
								: etage === "base"
									? cotise.base
									: cotise.base + cotise.complementaire,
						acquis,
						cumul: cumuls[r] ?? 0,
					};
				}
			}
		else
			for (const r of Object.keys(cumuls))
				regimes[r] = { cotisation: 0, acquis: 0, cumul: cumuls[r] ?? 0 };
		pas.push({
			age,
			annee: a.annee,
			retraite,
			statut:
				!retraite && mois.emploi > 0
					? {
							court: statutDe(a, carriere.sexe),
							couleur: affiliationDe(a)?.couleur ?? SANS_EMPLOI,
						}
					: null,
			salaire: retraite ? 0 : a.salaireBrut,
			part: retraite ? 0 : a.salaireBrut / valeur(B.cnav.pass, a.annee),
			assimiles: retraite ? 0 : assimiles,
			regimes,
		});
	});
	// La carrière générée peut s'arrêter au départ : la retraite se prolonge à l'identique.
	const dernier = pas[pas.length - 1];
	if (dernier)
		for (let age = dernier.age + 1; age < ageDepart + ANNEES_DE_RETRAITE; age++)
			pas.push({
				...dernier,
				age,
				annee: carriere.anneeNaissance + age,
				retraite: true,
				statut: null,
				salaire: 0,
				part: 0,
				assimiles: 0,
			});
	return pas;
}

const SANS_EMPLOI = "#b9b2a6";

/**
 * Une vie dans le modèle, année par année : le salaire, les cotisations qui partent vers chaque
 * régime, les droits qui s'accumulent, puis la pension. Les chiffres sont ceux du moteur.
 */
export function Parcours() {
	const { pret, demander, scenario } = useScenario();
	const [exemples, setExemples] = useState<Exemple[] | null>(null);
	const [choix, setChoix] = useState(0);
	const [rang, setRang] = useState(0);
	const [joue, setJoue] = useState(false);

	useEffect(() => {
		if (!pret) return;
		let actif = true;
		demander({ type: "exemples", scenario }).then((r) => {
			if (actif) setExemples(r.exemples);
		});
		return () => {
			actif = false;
		};
	}, [pret, demander, scenario]);

	const exemple = exemples?.[choix];
	const pas = useMemo(() => (exemple ? derouler(exemple) : []), [exemple]);
	const fin = pas.length - 1;

	// Le film démarre seul, sauf pour qui a demandé moins d'animations.
	useEffect(() => {
		if (!exemples) return;
		setRang(0);
		setJoue(!window.matchMedia("(prefers-reduced-motion: reduce)").matches);
	}, [exemples]);

	const depart = pas.findIndex((p) => p.retraite);
	useEffect(() => {
		if (!joue) return;
		if (rang >= fin) {
			setJoue(false);
			return;
		}
		// L'année du départ reste à l'écran le temps de lire le calcul.
		const attente = rang === depart ? TEMPO * 6 : TEMPO;
		const t = setTimeout(() => setRang((r) => Math.min(fin, r + 1)), attente);
		return () => clearTimeout(t);
	}, [joue, rang, fin, depart]);

	if (!exemple || pas.length === 0)
		return <div className="histo attente" style={{ height: 520 }} />;

	const p = pas[Math.min(rang, fin)] as Pas;
	const { carriere, pension } = exemple.detail.scenario;
	const qui = persona(exemple.resume);
	const pronom = carriere.sexe === "F" ? "elle" : "il";
	const regimes = regimesDe(carriere, pension);
	const lignes = regimes.lignes.filter((l) => !l.jointe);
	// La retraite additionnelle n'est pas suivie année par année : elle n'a pas de carte, seulement sa ligne au départ.
	const cartes = lignes.filter((l) => l.id !== "rafp");
	const { anneesNonSimulees } = regimes;
	const cotisations = Object.values(p.regimes).reduce(
		(t, r) => t + r.cotisation,
		0,
	);
	const caisses = cartes.filter((l) => (p.regimes[l.id]?.cotisation ?? 0) > 0);
	const partMax = Math.max(1.1, ...pas.map((x) => x.part));

	const recit = p.retraite
		? rang === depart
			? `À ${ageEnClair(pension.liquidation.age)}, ${qui.prenom} prend sa retraite. Chaque régime transforme les droits acquis en pension : ${euros(pension.mensuelleBrute)} par mois au total.`
			: `En ${p.annee}, ${qui.prenom} a ${p.age} ans. Ses ${euros(pension.mensuelleBrute)} par mois sont payés par les cotisations de celles et ceux qui travaillent cette année-là.`
		: p.statut && cotisations === 0
			? `En ${p.annee}, ${qui.prenom} a ${p.age} ans et travaille ${carriere.fonctionPublique ? "hors de la fonction publique" : "hors du salariat privé"} : le modèle ne retient de cette année que sa durée, sans cotisation ni pension calculée.`
			: p.statut
				? carriere.fonctionPublique
					? `En ${p.annee}, ${qui.prenom} a ${p.age} ans et travaille comme ${p.statut.court}, pour ${euros(p.salaire)} de traitement et de primes. Une retenue est prise sur son traitement, et son employeur verse ce qu'il faut en plus pour payer les fonctionnaires retraités de ${p.annee}. En échange, ${pronom} acquiert des trimestres de services.`
					: `En ${p.annee}, ${qui.prenom} a ${p.age} ans et travaille comme ${p.statut.court}. Sur ${euros(p.salaire)} de ${/^(artisan|commerçant)/.test(p.statut.court) ? "revenu" : "salaire brut"}, ${euros(cotisations)} de cotisations retraite partent vers ${caisses.length > 1 ? `${caisses.length} régimes` : "son régime"}, qui les reversent aussitôt aux retraités de ${p.annee}. En échange, ${pronom} acquiert des droits.`
				: `En ${p.annee}, ${qui.prenom} a ${p.age} ans et ne travaille pas : aucune cotisation${p.assimiles > 0 ? `, mais ${entier(p.assimiles)} trimestre${p.assimiles > 1 ? "s lui sont comptés" : " lui est compté"} quand même (chômage, maladie ou maternité)` : ""}.`;

	return (
		<div className="parcours">
			<div className="parcours-tete">
				<div className="parcours-choix">
					{exemples?.map((e, k) => (
						<button
							type="button"
							key={e.resume.id}
							className={k === choix ? "puce actif" : "puce"}
							onClick={() => {
								setChoix(k);
								setRang(0);
								setJoue(true);
							}}
						>
							{persona(e.resume).prenom},{" "}
							{e.resume.fonctionPublique
								? "fonctionnaire de l'État"
								: e.resume.regimes.includes("rci")
									? `salarié${e.resume.sexe === "F" ? "e" : ""} et indépendant${e.resume.sexe === "F" ? "e" : ""}`
									: `salarié${e.resume.sexe === "F" ? "e" : ""} du privé`}
						</button>
					))}
				</div>
				<div className="parcours-commandes">
					<button
						type="button"
						className="puce"
						onClick={() => {
							if (rang >= fin) setRang(0);
							setJoue(!joue);
						}}
					>
						{joue ? "Pause" : rang >= fin ? "Rejouer" : "Lecture"}
					</button>
					<input
						type="range"
						min={0}
						max={fin}
						value={rang}
						aria-label="Âge"
						aria-valuetext={`${p.age} ans`}
						onChange={(e) => {
							setJoue(false);
							setRang(Number(e.target.value));
						}}
					/>
					<span className="num">
						{p.age} ans, {p.annee}
					</span>
				</div>
			</div>

			<p className="recit" aria-live="polite">
				{recit}
			</p>

			<div className={`scene${p.retraite ? " retraite" : ""}`}>
				<div className="acteur">
					<Avatar
						id={exemple.resume.id}
						sexe={carriere.sexe}
						age={p.age}
						size={64}
					/>
					<strong>{qui.prenom}</strong>
					<span>
						{p.retraite
							? "à la retraite"
							: (p.statut?.court ?? "sans emploi cette année")}
					</span>
					<span className="num montant">
						{p.retraite
							? `${euros(pension.mensuelleBrute)} par mois`
							: p.salaire > 0
								? `${euros(p.salaire)} dans l'année`
								: "pas de salaire"}
					</span>
				</div>

				<div className="caisses">
					{cartes.map((l) => (
						<Caisse
							key={l.id}
							ligne={l}
							etat={p.regimes[l.id]}
							retraite={p.retraite}
							total={finalDe(pas, depart, l.id)}
						/>
					))}
				</div>

				<div className="acteur autres">
					<Icon name="population" size={40} />
					<strong>
						{p.retraite
							? `Les cotisants de ${p.annee}`
							: `Les retraités de ${p.annee}`}
					</strong>
					<span>
						{p.retraite
							? "leurs cotisations paient sa pension"
							: "reçoivent ses cotisations la même année"}
					</span>
				</div>
			</div>

			<div className="parcours-vie" aria-hidden="true">
				{pas.map((x, k) => (
					<button
						type="button"
						tabIndex={-1}
						key={x.age}
						className={k === rang ? "ici" : ""}
						onClick={() => {
							setJoue(false);
							setRang(k);
						}}
					>
						<i
							style={{
								height: `${x.retraite ? 10 : Math.max(10, (x.part / partMax) * 100)}%`,
								background: x.retraite
									? "var(--retraites)"
									: (x.statut?.couleur ?? SANS_EMPLOI),
								opacity: k <= rang ? (x.retraite ? 0.45 : 1) : 0.18,
							}}
						/>
					</button>
				))}
			</div>

			{p.retraite && (
				<table className="table calcul regimes">
					<thead>
						<tr>
							<th>Le calcul au départ</th>
							<th>Par mois</th>
						</tr>
					</thead>
					<tbody>
						{lignes.map((l) => (
							<tr key={l.id}>
								<th>
									{l.label}
									<small>{formule(l.id, pension)}</small>
								</th>
								<td className="num">
									{l.capital ? "capital" : euros(l.pensionAnnuelle / 12)}
								</td>
							</tr>
						))}
						{anneesNonSimulees >= 0.5 && (
							<tr className="non-simule">
								<th>
									Autres régimes
									<small>
										{entier(anneesNonSimulees)} années{" "}
										{carriere.fonctionPublique
											? "hors de la fonction publique"
											: "hors du salariat privé"}{" "}
										: le modèle n'en connaît que la durée, leur pension
										s'ajouterait à ce total
									</small>
								</th>
								<td className="num">non calculée</td>
							</tr>
						)}
					</tbody>
				</table>
			)}

			<p className="reserve">
				<Icon name="attention" size={16} /> {qui.prenom} n'existe pas : c'est
				l'une des vies inventées par le modèle, choisie parce que sa pension est
				au milieu de celles des carrières du même type. Le modèle refait ce
				calcul pour chacune, la pèse selon la population réelle, puis additionne
				chaque année les cotisations et les pensions. Salaires et cotisations en
				euros de l'époque, part de l'employeur comprise ; pensions en euros de
				2026.
			</p>
		</div>
	);
}

/** Droits acquis dans un régime à la veille du départ. */
function finalDe(pas: Pas[], depart: number, regime: string): number {
	const veille = pas[(depart < 0 ? pas.length : depart) - 1];
	return veille?.regimes[regime]?.cumul ?? 0;
}

function Caisse({
	ligne,
	etat,
	retraite,
	total,
}: {
	ligne: LigneRegime;
	etat: EtatRegime | undefined;
	retraite: boolean;
	total: number;
}) {
	const points = etageDe(ligne.id) === "complementaire";
	const unite = points ? "points" : "trimestres";
	const actif = retraite
		? ligne.pensionAnnuelle > 0
		: (etat?.cotisation ?? 0) > 0;
	return (
		<div className={`caisse${actif ? " actif" : ""}`}>
			<div className="flux" aria-hidden="true">
				<i />
				<i />
				<i />
			</div>
			<div className="caisse-carte">
				<strong>{ligne.label}</strong>
				<small>
					{points
						? "complémentaire"
						: etageDe(ligne.id) === "integre"
							? "base et complémentaire en une pension"
							: "base"}
				</small>
				<span className="num droits">
					{entier(etat?.cumul ?? 0)} {unite}
				</span>
				<span className="jauge">
					<i
						style={{
							width: `${total > 0 ? Math.min(100, ((etat?.cumul ?? 0) / total) * 100) : 0}%`,
						}}
					/>
				</span>
				<span className="num mouvement">
					{retraite
						? ligne.capital
							? "a versé un capital"
							: ligne.pensionAnnuelle > 0
								? `verse ${euros(ligne.pensionAnnuelle / 12)} par mois`
								: "ne verse rien"
						: (etat?.cotisation ?? 0) > 0
							? etageDe(ligne.id) === "integre"
								? `+${entier(etat?.acquis ?? 0)} ${unite} de services`
								: `reçoit ${euros(etat?.cotisation ?? 0)}, +${entier(etat?.acquis ?? 0)} ${unite}`
							: (etat?.acquis ?? 0) > 0
								? `+${entier(etat?.acquis ?? 0)} ${unite} sans cotisation`
								: "rien cette année"}
				</span>
			</div>
			<div className="flux" aria-hidden="true">
				<i />
				<i />
				<i />
			</div>
		</div>
	);
}

/** La règle de calcul d'un régime, avec les chiffres de cette personne. */
function formule(
	regime: string,
	pension: Exemple["detail"]["scenario"]["pension"],
): string {
	if (regime === "cnav" || regime === "ssi") {
		const d = pension.parRegime[regime];
		if (!d) return "";
		return [
			`salaire annuel moyen ${euros(d.salaireAnnuelMoyen)} × taux ${entier(d.tauxLiquidation * 100)} % × ${entier(d.proratisation * 100)} % d'une carrière complète dans ce régime`,
			d.minimumContributifApplique ? "porté au minimum contributif" : "",
			d.majorationEnfants
				? `+${entier(d.majorationEnfants * 100)} % pour enfants`
				: "",
		]
			.filter(Boolean)
			.join(", ");
	}
	if (regime === "sre" || regime === "cnracl" || regime === "militaire") {
		const d = pension.parRegime[regime];
		if (!d) return "";
		return [
			`traitement des six derniers mois ${euros(d.traitementDeReference / 12)} par mois × ${decimal(d.tauxLiquidation * 100)} % (75 % pour une carrière complète, ici ${entier(d.services + d.bonifications)} trimestres de services${d.bonifications ? " et de bonifications pour enfants" : ""} sur ${entier(d.dureeRequise)})`,
			d.trimestresDecote
				? `décote pour ${entier(d.trimestresDecote)} trimestres manquants`
				: "",
			d.trimestresSurcote
				? `surcote pour ${entier(d.trimestresSurcote)} trimestres en plus`
				: "",
			d.minimumGarantiApplique ? "porté au minimum garanti" : "",
			d.majorationEnfants
				? `+${entier(d.majorationEnfants * 100)} % pour enfants`
				: "",
		]
			.filter(Boolean)
			.join(", ");
	}
	if (regime === "rafp")
		return "points acquis sur les primes, convertis en rente ou versés en capital";
	if (regime === "agircArrco") {
		const d = pension.parRegime.agircArrco;
		if (!d) return "";
		return `${entier(d.points)} points × valeur du point${d.coefficientAnticipation < 1 ? `, minorée de ${entier((1 - d.coefficientAnticipation) * 100)} % pour départ anticipé` : ""}`;
	}
	if (regime === "rci") {
		const d = pension.parRegime.rci;
		if (!d) return "";
		return `${entier(d.points)} points × valeur du point${d.coefficientAbattement < 1 ? `, réduite de ${entier((1 - d.coefficientAbattement) * 100)} % faute de taux plein` : ""}`;
	}
	return "";
}
