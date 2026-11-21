import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Icon } from "../components/Icons";
import type { ProfilMoi, ResultatMoi } from "../engine.worker";
import { ageEnClair, entier, euros } from "../format";
import { versScenario } from "../leviers";
import { useScenario } from "../scenario";
import { SCENARIOS } from "../scenarios";

export const Route = createFileRoute("/moi")({ component: Moi });

const NAISSANCE_MIN = 1964;
const NAISSANCE_MAX = 2004;
const mois = (trimestres: number) =>
	trimestres === 0
		? "pareil"
		: `${trimestres > 0 ? "+" : "−"}${Math.abs(trimestres) * 3} mois`;
const ecartEuros = (n: number) =>
	Math.abs(n) < 5 ? "pareil" : `${n > 0 ? "+" : "−"}${euros(Math.abs(n))}`;

function Moi() {
	const { pret, demander, scenario, modifies } = useScenario();
	// Rien de ce qui est saisi ici ne part dans l'adresse de la page ni hors du navigateur.
	const [naissance, setNaissance] = useState("");
	const [sexe, setSexe] = useState<"F" | "H" | null>(null);
	const [salaire, setSalaire] = useState("");
	const [resultat, setResultat] = useState<ResultatMoi | null | "aucun">(null);
	const [options, setOptions] = useState<Record<string, ResultatMoi>>({});

	const annee = Number(naissance);
	const brut = Number(salaire.replace(",", ".").replace(/\s/g, ""));
	const complet =
		sexe !== null &&
		annee >= NAISSANCE_MIN &&
		annee <= NAISSANCE_MAX &&
		brut >= 500 &&
		brut <= 30000;

	useEffect(() => {
		if (!pret || !complet || sexe === null) {
			setResultat(null);
			return;
		}
		let actif = true;
		const profil: ProfilMoi = {
			anneeNaissance: annee,
			sexe,
			salaireMensuel: brut,
		};
		setOptions({});
		const t = setTimeout(async () => {
			const r = await demander({ type: "moi", scenario, profil });
			if (!actif) return;
			setResultat(r.resultat ?? "aucun");
			if (!r.resultat) return;
			for (const s of SCENARIOS) {
				const o = await demander({
					type: "moi",
					scenario: versScenario(s.reglages),
					profil,
				});
				if (!actif) return;
				if (o.resultat)
					setOptions((d) => ({ ...d, [s.id]: o.resultat as ResultatMoi }));
			}
		}, 400);
		return () => {
			actif = false;
			clearTimeout(t);
		};
	}, [pret, complet, annee, sexe, brut, demander, scenario]);

	return (
		<main className="wrap">
			<div className="titre-page">
				<h1>Et moi ?</h1>
				<p className="sub">
					Trois informations suffisent pour retrouver, parmi les 30 000
					carrières simulées, celles qui ressemblent à la vôtre, et voir ce que
					chaque option leur fait. Ce que vous saisissez reste dans votre
					navigateur.
				</p>
			</div>

			<form className="moi-saisie" onSubmit={(e) => e.preventDefault()}>
				<label>
					<span>Année de naissance</span>
					<input
						type="number"
						inputMode="numeric"
						min={NAISSANCE_MIN}
						max={NAISSANCE_MAX}
						placeholder="1985"
						value={naissance}
						onChange={(e) => setNaissance(e.target.value)}
					/>
				</label>
				<fieldset>
					<legend>Sexe</legend>
					{(["F", "H"] as const).map((x) => (
						<button
							type="button"
							key={x}
							className={sexe === x ? "puce actif" : "puce"}
							aria-pressed={sexe === x}
							onClick={() => setSexe(x)}
						>
							{x === "F" ? "Femme" : "Homme"}
						</button>
					))}
				</fieldset>
				<label>
					<span>Salaire brut par mois, à temps plein</span>
					<input
						type="text"
						inputMode="decimal"
						placeholder="2 800"
						value={salaire}
						onChange={(e) => setSalaire(e.target.value)}
					/>
				</label>
			</form>

			{!complet && (
				<p className="reserve">
					Pour une personne née entre {NAISSANCE_MIN} et {NAISSANCE_MAX},
					salariée du privé en 2026. Le sexe compte parce que les carrières des
					femmes et des hommes ne se ressemblent pas encore : interruptions,
					temps partiel, salaires.
				</p>
			)}
			{complet && resultat === null && (
				<div className="histo attente" style={{ height: 240 }} />
			)}
			{resultat === "aucun" && (
				<p className="reserve">
					Trop peu de carrières simulées ressemblent à ce profil pour en dire
					quelque chose.
				</p>
			)}
			{resultat && resultat !== "aucun" && (
				<>
					<p className="moi-qui">
						{resultat.effectif} carrières simulées vous ressemblent :{" "}
						{sexe === "F" ? "des femmes nées" : "des hommes nés"} entre{" "}
						{resultat.generations[0]} et {resultat.generations[1]}, avec un
						salaire entre {euros(resultat.salaires[0])} et{" "}
						{euros(resultat.salaires[1])} brut par mois en 2026. Elles n'auront
						pas toutes la même suite : chômage, enfants, promotions. D'où les
						fourchettes.
					</p>
					<div className="moi-cartes">
						<Carte titre="Avec la loi actuelle" r={resultat.reference} />
						{modifies > 0 && (
							<Carte
								titre="Avec votre scénario"
								r={resultat.scenario}
								ecart={resultat.ecart}
							/>
						)}
					</div>

					<section>
						<h2>Selon les grandes options</h2>
						<p className="sub">
							Pour les mêmes carrières : l'âge de départ et la première pension
							du milieu, et l'écart moyen avec la loi actuelle. Une
							revalorisation sous les prix ne change pas la première pension :
							elle la fait baisser ensuite, année après année.
						</p>
						<div className="defile">
							<table className="table moi-options num">
								<thead>
									<tr>
										<th>Option</th>
										<th>Âge de départ</th>
										<th />
										<th>Pension brute par mois</th>
										<th />
									</tr>
								</thead>
								<tbody>
									{SCENARIOS.map((s) => {
										const o = options[s.id];
										return (
											<tr key={s.id}>
												<th>{s.titre}</th>
												<td>{o ? ageEnClair(o.scenario.age[1]) : "…"}</td>
												<td className="ecart">{o ? mois(o.ecart.age) : ""}</td>
												<td>{o ? euros(o.scenario.pension[1]) : "…"}</td>
												<td className="ecart">
													{o ? ecartEuros(o.ecart.pension) : ""}
												</td>
											</tr>
										);
									})}
								</tbody>
							</table>
						</div>
					</section>
				</>
			)}

			<aside className="note">
				<Icon name="attention" />
				<p>
					<strong>Ce n'est pas votre relevé de carrière.</strong> Le site ne
					connaît ni vos trimestres ni vos points. Pour une estimation
					personnelle, le simulateur officiel M@rel est sur info-retraite.fr.
					Les montants sont bruts, en euros de 2026, pour le régime général et
					la complémentaire des salariés du privé.
				</p>
			</aside>
		</main>
	);
}

function Carte({
	titre,
	r,
	ecart,
}: {
	titre: string;
	r: ResultatMoi["reference"];
	ecart?: ResultatMoi["ecart"];
}) {
	return (
		<article className="moi-carte">
			<h3>{titre}</h3>
			<dl>
				<div>
					<dt>Départ vers</dt>
					<dd className="num">
						{ageEnClair(r.age[1])}
						{ecart && ecart.age !== 0 && <em>{mois(ecart.age)}</em>}
					</dd>
					<small>
						la moitié partent entre {ageEnClair(r.age[0])} et{" "}
						{ageEnClair(r.age[2])}
					</small>
				</div>
				<div>
					<dt>Pension vers</dt>
					<dd className="num">
						{euros(r.pension[1])}
						{ecart && Math.abs(ecart.pension) >= 5 && (
							<em>{ecartEuros(ecart.pension)}</em>
						)}
					</dd>
					<small>
						la moitié touchent entre{" "}
						{entier(Math.round(r.pension[0] / 10) * 10)} et{" "}
						{euros(r.pension[2])} brut par mois
					</small>
				</div>
			</dl>
		</article>
	);
}
