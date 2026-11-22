import { type ReactNode, useId, useState } from "react";
import { Icon } from "./Icons";

/**
 * Un bouton (i) qui ouvre une explication courte, au survol, au clavier ou au toucher. La bulle se
 * place par rapport au plus proche parent positionné : à lui de la garder dans l'écran.
 */
export function Info({
	label,
	children,
}: {
	/** Ce qu'explique la bulle, pour les lecteurs d'écran. */
	label: string;
	children: ReactNode;
}) {
	const id = useId();
	const [ouverte, setOuverte] = useState(false);
	return (
		<span
			className="info"
			onPointerEnter={(e) => e.pointerType === "mouse" && setOuverte(true)}
			onPointerLeave={(e) => e.pointerType === "mouse" && setOuverte(false)}
		>
			<button
				type="button"
				className="info-bouton"
				onClick={() => setOuverte(!ouverte)}
				onBlur={() => setOuverte(false)}
				onKeyDown={(e) => e.key === "Escape" && setOuverte(false)}
				aria-expanded={ouverte}
				aria-controls={id}
				aria-label={label}
			>
				<Icon name="info" size={22} />
			</button>
			<span className="info-bulle" id={id} role="tooltip" hidden={!ouverte}>
				{children}
			</span>
		</span>
	);
}
