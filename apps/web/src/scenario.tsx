import type { EcartDecile } from "@nos-retraites/engine";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import type { Reponse, Requete, ResultatLeger } from "./engine.worker";
import {
	ANNEE_DEFAUT,
	LEVIER,
	type LevierId,
	lireAnnee,
	lireReglages,
	type Reglages,
	type ScenarioMoteur,
	versScenario,
} from "./leviers";
import { TAILLE } from "./taille";

type SansId<T> = T extends { id: number } ? Omit<T, "id"> : never;
type Demande = SansId<Exclude<Requete, { type: "init" } | { type: "run" }>>;
type ReponseDe<T extends Demande["type"]> = Extract<Reponse, { type: T }>;

interface Contexte {
	reglages: Reglages;
	scenario: ScenarioMoteur;
	/** Nombre de leviers qui s'écartent du droit en vigueur. */
	modifies: number;
	/** Année de la projection que l'on regarde. */
	annee: number;
	setAnnee: (annee: number) => void;
	regler: (id: LevierId, valeur: number | null) => void;
	remplacer: (r: Reglages) => void;
	reference: ResultatLeger | null;
	courant: ResultatLeger | null;
	ecarts: EcartDecile[] | null;
	pret: boolean;
	/** Vrai tant que les chiffres affichés ne sont pas encore ceux du scénario en cours. */
	calcul: boolean;
	demander: <T extends Demande>(demande: T) => Promise<ReponseDe<T["type"]>>;
}

const ScenarioContext = createContext<Contexte | null>(null);

export function useScenario(): Contexte {
	const c = useContext(ScenarioContext);
	if (!c) throw new Error("useScenario hors de ScenarioProvider");
	return c;
}

/** Tient le scénario, le garde dans l'URL et pilote le moteur dans son Web Worker. */
export function ScenarioProvider({ children }: { children: ReactNode }) {
	const search = useRouterState({ select: (s) => s.location.search }) as Record<
		string,
		unknown
	>;
	const navigate = useNavigate();
	const [reglages, setReglages] = useState<Reglages>(() =>
		lireReglages(search),
	);
	const [annee, setAnnee] = useState(() => lireAnnee(search));
	const anneeCourante = useRef(annee);
	anneeCourante.current = annee;
	const [pret, setPret] = useState(false);
	const [resultat, setResultat] = useState<{
		reference: ResultatLeger;
		courant: ResultatLeger;
		ecarts: EcartDecile[];
	} | null>(null);
	const worker = useRef<Worker | null>(null);
	const compteur = useRef(0);
	const dernierRun = useRef(0);
	const [calcul, setCalcul] = useState(true);
	// Un seul calcul à la fois : le moteur traite ses messages à la file, et un téléphone met
	// plusieurs secondes par scénario. On ne garde que le dernier réglage demandé entre-temps.
	const enVol = useRef(false);
	const suivant = useRef<{ s: ScenarioMoteur; a: number } | null>(null);
	const attentes = useRef(new Map<number, (r: Reponse) => void>());
	const scenario = useMemo(() => versScenario(reglages), [reglages]);
	const scenarioCourant = useRef(scenario);
	scenarioCourant.current = scenario;

	const lancer = useCallback((s: ScenarioMoteur, a: number) => {
		if (enVol.current) {
			suivant.current = { s, a };
			return;
		}
		enVol.current = true;
		compteur.current += 1;
		dernierRun.current = compteur.current;
		worker.current?.postMessage({
			type: "run",
			id: compteur.current,
			scenario: s,
			annee: a,
		} satisfies Requete);
	}, []);

	useEffect(() => {
		const w = new Worker(new URL("./engine.worker.ts", import.meta.url), {
			type: "module",
		});
		worker.current = w;
		w.onmessage = (e: MessageEvent<Reponse>) => {
			const m = e.data;
			if (m.type === "ready") {
				setPret(true);
				return;
			}
			if (m.type === "result") {
				if (m.id !== dernierRun.current) return;
				enVol.current = false;
				setResultat({
					reference: m.reference,
					courant: m.courant,
					ecarts: m.ecarts,
				});
				const attendu = suivant.current;
				suivant.current = null;
				if (attendu) lancer(attendu.s, attendu.a);
				else setCalcul(false);
				return;
			}
			attentes.current.get(m.id)?.(m);
			attentes.current.delete(m.id);
		};
		w.postMessage({ type: "init", taille: TAILLE } satisfies Requete);
		return () => w.terminate();
	}, [lancer]);

	// Chaque changement de scénario relance le calcul et met l'URL à jour, sans empiler l'historique.
	// Un court délai : un curseur que l'on fait glisser ne lance pas un calcul à chaque cran.
	useEffect(() => {
		if (!pret) return;
		setCalcul(true);
		const t = setTimeout(() => lancer(scenario, annee), 120);
		return () => clearTimeout(t);
	}, [scenario, annee, pret, lancer]);

	useEffect(() => {
		const t = setTimeout(() => {
			navigate({
				to: ".",
				search: (annee === ANNEE_DEFAUT
					? reglages
					: { ...reglages, annee }) as never,
				replace: true,
				resetScroll: false,
			});
		}, 250);
		return () => clearTimeout(t);
	}, [reglages, annee, navigate]);

	const regler = useCallback((id: LevierId, valeur: number | null) => {
		setReglages((r) => {
			const suite = { ...r };
			if (valeur === null || valeur === LEVIER[id].defaut) delete suite[id];
			else suite[id] = valeur;
			return suite;
		});
	}, []);

	const demander = useCallback(<T extends Demande>(demande: T) => {
		compteur.current += 1;
		const id = compteur.current;
		return new Promise<ReponseDe<T["type"]>>((resolve) => {
			attentes.current.set(id, resolve as (r: Reponse) => void);
			worker.current?.postMessage({ ...demande, id });
		});
	}, []);

	const valeur: Contexte = {
		reglages,
		scenario,
		modifies: Object.keys(reglages).length,
		annee,
		setAnnee,
		regler,
		remplacer: setReglages,
		reference: resultat?.reference ?? null,
		courant: resultat?.courant ?? null,
		ecarts: resultat?.ecarts ?? null,
		pret,
		calcul,
		demander,
	};
	return (
		<ScenarioContext.Provider value={valeur}>
			{children}
		</ScenarioContext.Provider>
	);
}
