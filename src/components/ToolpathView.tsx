import {
	GCodeVisualizer,
	type GCodeViewerHandle,
	type GCodeViewerProgressEventNoId,
} from "@sienci/gsender-plugin-sdk/viewer";
import { useEffect, useRef, useState } from "react";

import type { Units } from "../lib/project";
import { Spinner } from "./touch/Touch";

type Props = {
	gcode: string;
	units: Units;
	/** Hidden panels keep their WebGL context but need a resize on reveal. */
	active: boolean;
};

/**
 * 3D toolpath preview using the same engine as gSender's own visualizer, so
 * what the user checks here is what the host will show.
 *
 * The viewer is imperative: it is driven through its ref rather than by props.
 */
const ToolpathView = ({ gcode, units, active }: Props) => {
	const viewerRef = useRef<GCodeViewerHandle>(null);
	const [error, setError] = useState<string | null>(null);
	const [progress, setProgress] = useState<GCodeViewerProgressEventNoId | null>(
		null,
	);

	useEffect(() => {
		const viewer = viewerRef.current;
		if (!viewer || !active) return;

		let cancelled = false;
		viewer.setCallbacks({
			onProgress: (event) => {
				if (cancelled) return;
				setProgress(event.state === "hidden" ? null : event);
			},
		});
		viewer
			.loadFromText(gcode)
			.then(() => {
				if (!cancelled) viewer.focusToModel();
			})
			.catch((err: unknown) => {
				if (cancelled) return;
				setError(err instanceof Error ? err.message : String(err));
			})
			.finally(() => {
				if (!cancelled) setProgress(null);
			});

		return () => {
			cancelled = true;
		};
	}, [gcode, active]);

	useEffect(() => {
		viewerRef.current?.setOptions({ units });
	}, [units]);

	// The canvas is sized to a hidden container while the tab is inactive, so
	// nudge it once it becomes visible.
	useEffect(() => {
		if (active) viewerRef.current?.resize();
	}, [active]);

	return (
		<div className="relative h-full w-full overflow-hidden rounded-lg bg-slate-950">
			<GCodeVisualizer
				ref={viewerRef}
				id="simple-signs-preview"
				style={{ width: "100%", height: "100%" }}
			/>
			{progress ? (
				<div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-950/80 text-slate-100">
					<Spinner />
					<p className="m-0 text-sm">
						{progress.state === "indeterminate" || progress.state === "determinate"
							? progress.label
							: "Building 3D preview…"}
					</p>
					{progress.state === "determinate" && progress.total > 0 ? (
						<p className="m-0 text-xs tabular-nums text-slate-400">
							{Math.round((progress.processed / progress.total) * 100)}%
						</p>
					) : null}
				</div>
			) : null}
			{error ? (
				<p className="absolute inset-x-0 bottom-0 bg-red-900/80 p-2 text-xs text-red-100">
					Preview failed: {error}
				</p>
			) : null}
		</div>
	);
};

export default ToolpathView;
