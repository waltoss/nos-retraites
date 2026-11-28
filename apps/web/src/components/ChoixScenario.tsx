import { dateEnClair } from "../format";
import { LEVIER, type LevierId } from "../leviers";
import { useOrdreProgrammes } from "../ordre";
import { useScenario } from "../scenario";
import {
	attribution,
	DATE_PROGRAMMES,
	NATURE,
	type Nature,
	PISTES,
	PROGRAMMES,
	programmeDe,
	SCENARIOS,
	type ScenarioType,
	scenarioDe,
} from "../scenarios";

const LOI = "loi";
const PERSONNALISE = "personnalise";

/** Le scénario type que les réglages en cours reproduisent exactement, s'il y en a un. */
export function useScenarioType(): ScenarioType | undefined {
	const { reglages, modifies } = useScenario();
	return modifies === 0 ? undefined : scenarioDe(reglages);
}

/**
 * Menu des scénarios tout faits : les programmes de 2027 dans l'ordre tiré au sort sur l'appareil,
 * puis les autres pistes. Dès qu'un levier bouge, le menu passe à « Votre scénario ».
 */
export function ChoixScenario({ id, loi }: { id: string; loi: string }) {
	const { remplacer, modifies } = useScenario();
	const ordre = useOrdreProgrammes();
	const type = useScenarioType();
	const choisi = modifies === 0 ? LOI : (type?.id ?? PERSONNALISE);
	return (
		<select
			id={id}
			value={choisi}
			onChange={(e) => {
				const s = SCENARIOS.find((x) => x.id === e.target.value);
				remplacer(s ? s.reglages : {});
			}}
		>
			<option value={LOI}>{loi}</option>
			<optgroup label="Programmes de 2027, ordre tiré au sort">
				{(ordre ?? PROGRAMMES).map((s) => {
					const p = programmeDe(s.id);
					return (
						<option key={s.id} value={s.id}>
							{s.titre}
							{p ? ` (${attribution(p)})` : ""}
						</option>
					);
				})}
			</optgroup>
			<optgroup label="Autres pistes du débat">
				{PISTES.map((s) => (
					<option key={s.id} value={s.id}>
						{s.titre}
					</option>
				))}
			</optgroup>
			{choisi === PERSONNALISE && (
				<option value={PERSONNALISE}>Votre scénario</option>
			)}
		</select>
	);
}

/**
 * À qui revient le scénario en cours, tant qu'il est celui d'un programme au réglage près, et ce
 * que le simulateur en reprend : mesures reprises, laissées de côté, sources. Dès qu'un levier
 * bouge, ce n'est plus le programme et le bloc disparaît.
 */
export function Attribution() {
	const type = useScenarioType();
	const p = type && programmeDe(type.id);
	if (!type || !p) return null;
	return (
		<div className="attribution">
			<p>
				D'après les annonces de{" "}
				{p.candidats.map((c, i) => (
					<span key={c.nom}>
						{i > 0 && (i === p.candidats.length - 1 ? " et " : ", ")}
						<strong>{c.nom}</strong> ({c.parti}
						{c.precision ? `, ${c.precision}` : ""})
					</span>
				))}
				, pour ce que le simulateur sait régler.
			</p>
			<details>
				<summary>Ce qui est repris, ce qui ne l'est pas, sources</summary>
				<h4>Repris</h4>
				<ul>
					{(
						Object.entries(p.repris) as [
							LevierId,
							{ texte: string; nature: Nature },
						][]
					).map(([id, r]) => (
						<li key={id}>
							<strong>{LEVIER[id].label}</strong>
							{NATURE[r.nature] && (
								<em className="nature">{NATURE[r.nature]}</em>
							)}{" "}
							: {r.texte}
						</li>
					))}
				</ul>
				<h4>Annoncé mais laissé de côté</h4>
				<ul>
					{p.laisseDeCote.map((l) => (
						<li key={l}>{l}</li>
					))}
				</ul>
				<h4>Sources, lues le {dateEnClair(DATE_PROGRAMMES)}</h4>
				<ul>
					{p.sources.map((src) => (
						<li key={src.url}>
							<a href={src.url} rel="noreferrer">
								{src.titre}
							</a>
							, {dateEnClair(src.date)}
						</li>
					))}
				</ul>
			</details>
		</div>
	);
}
