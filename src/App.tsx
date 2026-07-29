import { gsender } from "@sienci/gsender-plugin-sdk";
import { useWorkspaceState } from "@sienci/gsender-plugin-sdk/react";
import type { Font } from "opentype.js";
import {
	lazy,
	Suspense,
	useCallback,
	useDeferredValue,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";

import DesignCanvas from "./components/DesignCanvas";
import GcodeView from "./components/GcodeView";
import OptionsPanel from "./components/OptionsPanel";
import { isStandalone } from "./dev/mockBridge";
import {
	discoverSystemFonts,
	type FontRegistry,
	loadFont,
	pickDefaultFace,
} from "./lib/fonts";
import {
	buildGeometry,
	generate,
	type GenerateResult,
	toolpathSignature,
} from "./lib/generate";
import { defaultProject, type Project, type Units } from "./lib/project";

/**
 * three.js plus the gviewer engine is by far the largest thing we bundle, and
 * it is only needed on the Toolpath tab. Loading it lazily — and only once that
 * tab is first opened — keeps the plugin's initial iframe load small.
 */
const ToolpathView = lazy(() => import("./components/ToolpathView"));

type WorkspaceState = { units?: string };

const EMPTY_REGISTRY: FontRegistry = {
	faces: [],
	families: [],
	systemFontsAvailable: false,
};

type TabKey = "design" | "toolpath" | "gcode";

const TABS: { key: TabKey; label: string }[] = [
	{ key: "design", label: "Design" },
	{ key: "toolpath", label: "Toolpath" },
	{ key: "gcode", label: "G-code" },
];

/** Shown in the Toolpath and G-code tabs before anything has been generated. */
const GeneratePrompt = ({
	busy,
	onGenerate,
}: {
	busy: boolean;
	onGenerate: () => Promise<unknown>;
}) => (
	<div className="flex h-full flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-gray-300 text-sm text-gray-500 dark:border-gray-700">
		<p className="m-0">No toolpath yet.</p>
		<button
			type="button"
			onClick={() => void onGenerate()}
			disabled={busy}
			className="cursor-pointer rounded-md border border-blue-600 bg-blue-600 px-3 py-1.5 text-sm text-white disabled:cursor-not-allowed disabled:opacity-50"
		>
			{busy ? "Generating…" : "Generate toolpath"}
		</button>
	</div>
);

/**
 * Keeps the previous result visible but visibly out of date. Dimming rather
 * than clearing lets the user compare the old toolpath against the design they
 * have just changed, which is usually why they changed it.
 */
const StaleWrapper = ({
	stale,
	children,
}: {
	stale: boolean;
	children: React.ReactNode;
}) => (
	<div className="flex h-full min-h-0 flex-col gap-2">
		{stale ? (
			<p className="m-0 rounded-md bg-amber-100 px-2 py-1 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">
				Out of date — press Generate toolpath to update.
			</p>
		) : null}
		<div className={`min-h-0 grow ${stale ? "opacity-50" : ""}`}>{children}</div>
	</div>
);

const slugify = (text: string): string =>
	text
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "")
		.slice(0, 40) || "sign";

const App = () => {
	const workspace = useWorkspaceState<WorkspaceState>();
	const units: Units = workspace?.units === "in" ? "in" : "mm";

	const [project, setProject] = useState<Project>(defaultProject);
	const [registry, setRegistry] = useState<FontRegistry>(EMPTY_REGISTRY);
	const [font, setFont] = useState<Font | null>(null);
	const [fontError, setFontError] = useState<string | null>(null);
	const [tab, setTab] = useState<TabKey>("design");
	// Once the 3D preview has been opened, keep it mounted so it does not have
	// to rebuild its WebGL context every time the user switches back.
	const [toolpathOpened, setToolpathOpened] = useState(false);
	const [status, setStatus] = useState<string | null>(null);
	const [sending, setSending] = useState(false);
	const [busy, setBusy] = useState(false);
	const runningRef = useRef<Promise<GenerateResult> | null>(null);

	// gSender owns the unit system; mirror it rather than letting the user pick.
	useEffect(() => {
		setProject((p) => (p.units === units ? p : { ...p, units }));
	}, [units]);

	useEffect(() => {
		let cancelled = false;
		void discoverSystemFonts().then((found) => {
			if (cancelled) return;
			setRegistry(found);
			const face = pickDefaultFace(found);
			if (face) {
				setProject((p) => ({ ...p, text: { ...p.text, fontKey: face.key } }));
			}
		});
		return () => {
			cancelled = true;
		};
	}, []);

	const fontKey = project.text.fontKey;
	useEffect(() => {
		if (!fontKey) {
			setFont(null);
			return;
		}
		let cancelled = false;
		setFontError(null);
		void loadFont(fontKey)
			.then((loaded) => {
				if (!cancelled) setFont(loaded);
			})
			.catch((err: unknown) => {
				if (cancelled) return;
				setFont(null);
				setFontError(
					`Could not read this font: ${err instanceof Error ? err.message : String(err)}`,
				);
			});
		return () => {
			cancelled = true;
		};
	}, [fontKey]);

	// Canvas geometry is the cheap half — around 1.5ms whatever the strategy —
	// so it stays live and the design surface tracks every keystroke and drag.
	// Deferred purely as insurance against a very long string in a complex font.
	const deferredProject = useDeferredValue(project);
	const geometry = useMemo(
		() => buildGeometry(deferredProject, font),
		[deferredProject, font],
	);

	// The toolpath is the expensive half — up to ~130ms for a V-carve — so it
	// runs only when asked. `signature` is how we know the stored result no
	// longer matches the parameters on screen.
	const [output, setOutput] = useState<{
		result: GenerateResult;
		signature: string;
	} | null>(null);

	const signature = toolpathSignature(project, project.text.fontKey);
	const isStale = output !== null && output.signature !== signature;

	/**
	 * Runs the generator and returns the result directly. Callers must use the
	 * return value rather than reading `output` afterwards — the state update
	 * has not landed yet at that point.
	 */
	const runGenerate = useCallback(async (): Promise<GenerateResult> => {
		// `busy` state does not update synchronously, so a double Ctrl+Enter in
		// one tick would start two runs. The ref settles it immediately.
		if (runningRef.current) return runningRef.current;

		setBusy(true);
		setStatus(null);
		const run = (async () => {
			try {
				// Yield a frame so the busy state actually paints before the
				// synchronous clipper work takes over the main thread; without
				// this the button just appears frozen for the duration.
				await new Promise((resolve) => requestAnimationFrame(resolve));

				const next = generate(project, font);
				setOutput({ result: next, signature });
				return next;
			} finally {
				setBusy(false);
				runningRef.current = null;
			}
		})();

		runningRef.current = run;
		return run;
	}, [project, font, signature]);

	/** The current result, regenerating first if it is missing or out of date. */
	const ensureFresh = useCallback(async (): Promise<GenerateResult> => {
		if (output && output.signature === signature) return output.result;
		return runGenerate();
	}, [output, signature, runGenerate]);

	const moveText = useCallback((x: number, y: number) => {
		setProject((p) => ({ ...p, text: { ...p.text, x, y } }));
	}, []);

	const moveTab = useCallback((index: number, fraction: number) => {
		setProject((p) => {
			const positions = [...p.tabs.positions];
			if (index < 0 || index >= positions.length) return p;
			positions[index] = fraction;
			return { ...p, tabs: { ...p.tabs, positions } };
		});
	}, []);

	const addTab = useCallback((fraction: number) => {
		// Kept sorted so tab numbering follows the profile rather than the order
		// they happened to be created in.
		setProject((p) => ({
			...p,
			tabs: {
				...p.tabs,
				positions: [...p.tabs.positions, fraction].sort((a, b) => a - b),
			},
		}));
	}, []);

	const removeTab = useCallback((index: number) => {
		setProject((p) => ({
			...p,
			tabs: {
				...p.tabs,
				positions: p.tabs.positions.filter((_, i) => i !== index),
			},
		}));
	}, []);

	const filename = `simple-signs-${slugify(project.text.content)}.nc`;

	const loadToGsender = async () => {
		setSending(true);
		setStatus(null);
		try {
			// Regenerate first if anything changed — sending a program that does
			// not match what is on screen is the one failure worth engineering out.
			const fresh = await ensureFresh();

			if (fresh.toolpath.passes.length === 0) {
				setStatus(
					fresh.warnings[0] ??
						"Nothing to cut — check the text, blank and tool settings.",
				);
				return;
			}

			await gsender.gcode.loadToVisualizer(fresh.gcode, filename);
			setStatus(
				isStandalone()
					? `Standalone harness — downloaded ${filename}.`
					: "Loaded into gSender.",
			);
		} catch (err) {
			setStatus(err instanceof Error ? err.message : String(err));
		} finally {
			setSending(false);
		}
	};

	const copyGcode = async () => (await ensureFresh()).gcode;

	const saveGcode = async () => {
		const fresh = await ensureFresh();
		const blob = new Blob([fresh.gcode], { type: "text/plain" });
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement("a");
		anchor.href = url;
		anchor.download = filename;
		anchor.click();
		URL.revokeObjectURL(url);
	};

	// Ctrl/Cmd+Enter regenerates, so a tweak-and-check loop never needs the mouse.
	useEffect(() => {
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
				e.preventDefault();
				void runGenerate();
			}
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [runGenerate]);

	const result = output?.result ?? null;
	const passes = result?.toolpath.passes ?? [];
	const minZ = result?.toolpath.minZ ?? 0;
	const needsGenerate = result === null || isStale;

	return (
		<div className="flex h-full flex-col gap-3 p-3 text-gray-900 dark:text-gray-100">
			<header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
				<h1 className="m-0 text-lg font-semibold">Simple Signs</h1>
				<p className="m-0 text-xs text-gray-500">
					{registry.systemFontsAvailable
						? `${registry.families.length} system fonts`
						: "System fonts unavailable"}
					{" · "}
					{result === null
						? "toolpath not generated"
						: `${passes.length} passes, deepest Z ${minZ.toFixed(2)} mm${
								isStale ? " (out of date)" : ""
							}`}
				</p>
			</header>

			<div className="grid min-h-0 grow grid-cols-1 gap-4 md:grid-cols-[minmax(300px,380px)_1fr]">
				<div className="min-h-0 overflow-y-auto pr-1">
					<OptionsPanel
						project={project}
						setProject={setProject}
						registry={registry}
						onRegistryChange={setRegistry}
					/>
				</div>

				<div className="flex min-h-0 flex-col gap-2">
					<div className="flex items-center gap-1 border-b border-gray-200 dark:border-gray-800">
						{TABS.map(({ key, label }) => (
							<button
								key={key}
								type="button"
								onClick={() => {
									setTab(key);
									if (key === "toolpath") setToolpathOpened(true);
								}}
								className={`cursor-pointer border-b-2 px-3 py-1.5 text-sm ${
									tab === key
										? "border-blue-600 font-medium text-blue-600"
										: "border-transparent text-gray-500 hover:text-gray-800 dark:hover:text-gray-200"
								}`}
							>
								{label}
							</button>
						))}
						<span className="grow" />
						<button
							type="button"
							onClick={() => void runGenerate()}
							disabled={busy}
							title="Regenerate the toolpath (Ctrl+Enter)"
							className={`mb-1 cursor-pointer rounded-md border px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-50 ${
								needsGenerate
									? "border-blue-600 bg-blue-600 text-white"
									: "border-gray-300 text-gray-600 hover:border-blue-500 hover:text-blue-600 dark:border-gray-700 dark:text-gray-300"
							}`}
						>
							{busy ? "Generating…" : "Generate toolpath"}
						</button>
						<button
							type="button"
							onClick={loadToGsender}
							disabled={sending || busy}
							className="mb-1 cursor-pointer rounded-md border border-blue-600 px-3 py-1.5 text-sm text-blue-600 disabled:cursor-not-allowed disabled:opacity-50 dark:text-blue-400"
						>
							{sending ? "Loading…" : "Load to gSender"}
						</button>
					</div>

					<div className="min-h-0 grow">
						<div
							className={`h-full rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950 ${
								tab === "design" ? "" : "hidden"
							}`}
						>
							<DesignCanvas
								project={project}
								geometry={geometry}
								onMoveText={moveText}
								onMoveTab={moveTab}
								onAddTab={addTab}
								onRemoveTab={removeTab}
							/>
						</div>

						<div className={`h-full ${tab === "toolpath" ? "" : "hidden"}`}>
							{result === null ? (
								<GeneratePrompt busy={busy} onGenerate={runGenerate} />
							) : (
								<StaleWrapper stale={isStale}>
									{toolpathOpened ? (
										<Suspense
											fallback={
												<div className="flex h-full items-center justify-center rounded-lg bg-slate-950 text-sm text-slate-400">
													Loading 3D preview…
												</div>
											}
										>
											<ToolpathView
												gcode={result.gcode}
												units={units}
												active={tab === "toolpath"}
											/>
										</Suspense>
									) : null}
								</StaleWrapper>
							)}
						</div>

						<div className={`h-full ${tab === "gcode" ? "" : "hidden"}`}>
							{result === null ? (
								<GeneratePrompt busy={busy} onGenerate={runGenerate} />
							) : (
								<StaleWrapper stale={isStale}>
									<GcodeView
										gcode={result.gcode}
										onCopy={copyGcode}
										onSave={saveGcode}
									/>
								</StaleWrapper>
							)}
						</div>
					</div>

					<div className="min-h-[1.25rem] text-xs">
						{fontError ? (
							<p className="m-0 text-red-600 dark:text-red-400">{fontError}</p>
						) : null}
						{(result?.warnings ?? []).map((w) => (
							<p key={w} className="m-0 text-amber-600 dark:text-amber-400">
								{w}
							</p>
						))}
						{status ? (
							<p className="m-0 text-gray-500">{status}</p>
						) : tab === "design" ? (
							<p className="m-0 text-gray-500">
								Drag the text or a tab to position it; click the dashed profile
								to add a tab, double-click one to remove it. Hold Alt to bypass
								snapping.
							</p>
						) : null}
					</div>
				</div>
			</div>
		</div>
	);
};

export default App;
