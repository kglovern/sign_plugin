import { useEffect, useLayoutEffect, useRef, useState } from "react";

import type { SignGeometry } from "../lib/generate";
import {
	arcLengths,
	closestPointOnContour,
	contoursToPathData,
	perimeter,
	pointAtArcLength,
} from "../lib/geometry";
import type { Project } from "../lib/project";
import { magnetToEvenSpacing } from "../lib/tabs";

type Props = {
	project: Project;
	geometry: SignGeometry;
	/**
	 * Marks the element the current step is about, so what can be dragged looks
	 * draggable before anyone has tried it.
	 */
	emphasis?: "text" | "tabs" | null;
	onMoveText: (x: number, y: number) => void;
	onMoveTab: (index: number, fraction: number) => void;
	onAddTab: (fraction: number) => void;
	onRemoveTab: (index: number) => void;
};

/** Cap on grid lines per axis, so a tiny spacing cannot lock up the renderer. */
const MAX_GRID_LINES = 300;

/** Screen-space sizes, in CSS pixels, converted to mm at render time. */
const MARKER_PX = 9;
const HIT_PX = 28;
const PROFILE_HIT_PX = 20;
/** How close to an evenly spaced position a drag must get before it snaps. */
const MAGNET_PX = 10;
/** Pointer travel past which a press is a drag, not a click. */
const CLICK_SLOP_PX = 4;
const LONG_PRESS_MS = 600;

type DragState =
	| {
			kind: "text";
			originX: number;
			originY: number;
			textX: number;
			textY: number;
	  }
	| { kind: "tab"; index: number }
	| { kind: "profile"; clientX: number; clientY: number };

/**
 * The design surface: a millimetre grid showing the blank, the profile cut
 * line, the tabs and the text. The text block and each tab are draggable with
 * mouse or touch.
 *
 * Design space is Y-up but SVG is Y-down, so everything is drawn inside a
 * `scale(1, -1)` group. The viewBox is symmetric about the origin, which makes
 * that flip a no-op for the framing and keeps the transform to one place.
 */
const DesignCanvas = ({
	project,
	geometry,
	emphasis = null,
	onMoveText,
	onMoveTab,
	onAddTab,
	onRemoveTab,
}: Props) => {
	const svgRef = useRef<SVGSVGElement>(null);
	const dragRef = useRef<DragState | null>(null);
	const longPressRef = useRef<number | null>(null);
	const [activeTab, setActiveTab] = useState<number | null>(null);
	const [draggingText, setDraggingText] = useState(false);

	const { width, height } = project.blank;
	const margin = Math.max(Math.max(width, height) * 0.08, 8);
	const halfW = width / 2 + margin;
	const halfH = height / 2 + margin;
	const viewWidth = halfW * 2;

	// Millimetres per CSS pixel. Markers and hit targets are specified in pixels
	// so they stay a consistent, touch-friendly size whether the blank is a
	// 40mm badge or a 1200mm sign.
	const [mmPerPx, setMmPerPx] = useState(viewWidth / 600);
	useLayoutEffect(() => {
		const svg = svgRef.current;
		if (!svg) return;
		const measure = () => {
			const rect = svg.getBoundingClientRect();
			if (rect.width > 0) setMmPerPx(viewWidth / rect.width);
		};
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(svg);
		return () => observer.disconnect();
	}, [viewWidth]);

	const cancelLongPress = () => {
		if (longPressRef.current !== null) {
			window.clearTimeout(longPressRef.current);
			longPressRef.current = null;
		}
	};
	useEffect(() => cancelLongPress, []);

	/** Client coordinates → design-space millimetres. */
	const toDesign = (clientX: number, clientY: number) => {
		const svg = svgRef.current;
		const ctm = svg?.getScreenCTM();
		if (!svg || !ctm) return null;
		const view = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
		return { x: view.x, y: -view.y };
	};

	const snapToGrid = (value: number, disable: boolean) => {
		if (disable || !project.snapToGrid || project.gridSpacing <= 0) return value;
		return Math.round(value / project.gridSpacing) * project.gridSpacing;
	};

	const tabContour = geometry.tabContour;
	const tabPerimeter = tabContour ? perimeter(tabContour) : 0;

	/**
	 * Projects a pointer position onto the profile, then applies the magnetic
	 * pull toward even spacing. Alt bypasses the magnet, matching the text drag.
	 */
	const fractionAt = (
		clientX: number,
		clientY: number,
		altKey: boolean,
		magnetCount: number,
	): number | null => {
		if (!tabContour) return null;
		const design = toDesign(clientX, clientY);
		if (!design) return null;

		const hit = closestPointOnContour(tabContour, design);
		if (!hit) return null;
		if (altKey || tabPerimeter <= 0) return hit.fraction;

		// A fixed pull in screen pixels, expressed as a fraction of the profile.
		const threshold = (MAGNET_PX * mmPerPx) / tabPerimeter;
		return magnetToEvenSpacing(hit.fraction, magnetCount, threshold);
	};

	// --- Text dragging ---------------------------------------------------------

	const onTextPointerDown = (e: React.PointerEvent<SVGGElement>) => {
		const design = toDesign(e.clientX, e.clientY);
		if (!design) return;
		e.stopPropagation();
		e.currentTarget.setPointerCapture(e.pointerId);
		dragRef.current = {
			kind: "text",
			originX: design.x,
			originY: design.y,
			textX: project.text.x,
			textY: project.text.y,
		};
		setDraggingText(true);
	};

	const onTextPointerMove = (e: React.PointerEvent<SVGGElement>) => {
		const drag = dragRef.current;
		if (drag?.kind !== "text") return;
		const design = toDesign(e.clientX, e.clientY);
		if (!design) return;

		const free = e.altKey;
		onMoveText(
			snapToGrid(drag.textX + (design.x - drag.originX), free),
			snapToGrid(drag.textY + (design.y - drag.originY), free),
		);
	};

	const onTextPointerUp = (e: React.PointerEvent<SVGGElement>) => {
		if (dragRef.current?.kind !== "text") return;
		e.currentTarget.releasePointerCapture(e.pointerId);
		dragRef.current = null;
		setDraggingText(false);
	};

	// --- Tab dragging ----------------------------------------------------------

	const onTabPointerDown = (index: number) => (e: React.PointerEvent<SVGGElement>) => {
		e.stopPropagation();
		e.currentTarget.setPointerCapture(e.pointerId);
		dragRef.current = { kind: "tab", index };
		setActiveTab(index);

		// Touch has no double-click, so a long press is the delete gesture there.
		// Any real movement means the user is dragging, and cancels it.
		cancelLongPress();
		longPressRef.current = window.setTimeout(() => {
			longPressRef.current = null;
			dragRef.current = null;
			setActiveTab(null);
			onRemoveTab(index);
		}, LONG_PRESS_MS);
	};

	const onTabPointerMove = (e: React.PointerEvent<SVGGElement>) => {
		const drag = dragRef.current;
		if (drag?.kind !== "tab") return;
		cancelLongPress();

		const fraction = fractionAt(
			e.clientX,
			e.clientY,
			e.altKey,
			project.tabs.positions.length,
		);
		if (fraction !== null) onMoveTab(drag.index, fraction);
	};

	const onTabPointerUp = (e: React.PointerEvent<SVGGElement>) => {
		cancelLongPress();
		if (dragRef.current?.kind !== "tab") return;
		e.currentTarget.releasePointerCapture(e.pointerId);
		dragRef.current = null;
		setActiveTab(null);
	};

	// --- Adding a tab by clicking the profile ----------------------------------

	const onProfilePointerDown = (e: React.PointerEvent<SVGPathElement>) => {
		e.currentTarget.setPointerCapture(e.pointerId);
		dragRef.current = { kind: "profile", clientX: e.clientX, clientY: e.clientY };
	};

	const onProfilePointerUp = (e: React.PointerEvent<SVGPathElement>) => {
		const drag = dragRef.current;
		if (drag?.kind !== "profile") return;
		e.currentTarget.releasePointerCapture(e.pointerId);
		dragRef.current = null;

		// Only a tap adds a tab; a drag across the profile should do nothing.
		const travel = Math.hypot(e.clientX - drag.clientX, e.clientY - drag.clientY);
		if (travel > CLICK_SLOP_PX) return;

		// Magnet against the count the list will have once this tab is added.
		const fraction = fractionAt(
			e.clientX,
			e.clientY,
			e.altKey,
			project.tabs.positions.length + 1,
		);
		if (fraction !== null) onAddTab(fraction);
	};

	// --- Static geometry -------------------------------------------------------

	const spacing = project.gridSpacing > 0 ? project.gridSpacing : 10;
	const gridLines: { x1: number; y1: number; x2: number; y2: number }[] = [];
	const stepsX = Math.min(Math.ceil(halfW / spacing), MAX_GRID_LINES);
	const stepsY = Math.min(Math.ceil(halfH / spacing), MAX_GRID_LINES);
	for (let i = -stepsX; i <= stepsX; i += 1) {
		const x = i * spacing;
		gridLines.push({ x1: x, y1: -halfH, x2: x, y2: halfH });
	}
	for (let i = -stepsY; i <= stepsY; i += 1) {
		const y = i * spacing;
		gridLines.push({ x1: -halfW, y1: y, x2: halfW, y2: y });
	}

	const machineOrigin =
		project.origin === "lower-left"
			? { x: -width / 2, y: -height / 2 }
			: { x: 0, y: 0 };

	const blankPath = contoursToPathData(geometry.blank);
	const cutPath = contoursToPathData(geometry.cutLine);
	const glyphPath = contoursToPathData(geometry.glyphs);
	const bounds = geometry.layout.bounds;
	const hasText = geometry.glyphs.length > 0;

	const markerR = MARKER_PX * mmPerPx;
	const hitR = HIT_PX * mmPerPx;
	const originArm = Math.max(Math.max(width, height) * 0.02, 1.5) * 2;

	/**
	 * The stretch of profile a tab actually bridges, sampled along the contour.
	 * Drawing the real extent rather than a dot is what lets the user judge
	 * whether a tab clears a corner before they cut it.
	 */
	const tabSpanPath = (centre: number): string => {
		if (!tabContour || tabPerimeter <= 0) return "";
		const { lengths, total } = arcLengths(tabContour);
		const half = Math.min(project.tabs.length / 2, total / 2);
		const steps = 12;
		const points = Array.from({ length: steps + 1 }, (_, i) =>
			pointAtArcLength(
				tabContour,
				lengths,
				total,
				centre - half + (2 * half * i) / steps,
			),
		);
		return `M${points.map((p) => `${p.x.toFixed(3)} ${p.y.toFixed(3)}`).join("L")}`;
	};

	return (
		<svg
			ref={svgRef}
			viewBox={`${-halfW} ${-halfH} ${viewWidth} ${halfH * 2}`}
			className="h-full w-full touch-none select-none"
			role="img"
			aria-label="Sign design canvas"
		>
			<g transform="scale(1, -1)">
				<g stroke="currentColor" className="text-gray-300 dark:text-gray-700">
					{gridLines.map((l, i) => (
						<line
							key={i}
							x1={l.x1}
							y1={l.y1}
							x2={l.x2}
							y2={l.y2}
							strokeWidth={1}
							vectorEffect="non-scaling-stroke"
							opacity={0.5}
						/>
					))}
				</g>

				{/* Blank outline */}
				{blankPath ? (
					<path
						d={blankPath}
						className="fill-amber-50 stroke-amber-700 dark:fill-amber-950/40 dark:stroke-amber-500"
						strokeWidth={2}
						vectorEffect="non-scaling-stroke"
					/>
				) : null}

				{/* Profile cut line — where the cutter centre actually travels */}
				{cutPath ? (
					<path
						d={cutPath}
						fill="none"
						className="stroke-blue-500"
						strokeWidth={1}
						strokeDasharray="6 4"
						vectorEffect="non-scaling-stroke"
						opacity={0.8}
					/>
				) : null}

				{/* Text — dragged to reposition */}
				{hasText ? (
					<g
						onPointerDown={onTextPointerDown}
						onPointerMove={onTextPointerMove}
						onPointerUp={onTextPointerUp}
						onPointerCancel={onTextPointerUp}
						style={{ cursor: draggingText ? "grabbing" : "grab" }}
					>
						{/* Invisible hit area so thin strokes are still easy to grab */}
						<rect
							x={bounds.minX}
							y={bounds.minY}
							width={Math.max(bounds.maxX - bounds.minX, 0.01)}
							height={Math.max(bounds.maxY - bounds.minY, 0.01)}
							fill="transparent"
						/>
						<path
							d={glyphPath}
							fillRule="nonzero"
							className="fill-slate-800 dark:fill-slate-200"
						/>
						{draggingText || emphasis === "text" ? (
							<rect
								x={bounds.minX}
								y={bounds.minY}
								width={Math.max(bounds.maxX - bounds.minX, 0.01)}
								height={Math.max(bounds.maxY - bounds.minY, 0.01)}
								fill="none"
								className="stroke-blue-500"
								strokeWidth={draggingText ? 1.5 : 1}
								strokeDasharray="4 3"
								vectorEffect="non-scaling-stroke"
								opacity={draggingText ? 1 : 0.7}
							/>
						) : null}
					</g>
				) : null}

				{/* Wide invisible profile stroke: tap it to add a tab. Sits under the
				    markers so grabbing an existing tab always wins. */}
				{cutPath && project.tabs.enabled ? (
					<path
						d={cutPath}
						fill="none"
						stroke="transparent"
						strokeWidth={PROFILE_HIT_PX * mmPerPx}
						pointerEvents="stroke"
						style={{ cursor: "copy" }}
						onPointerDown={onProfilePointerDown}
						onPointerUp={onProfilePointerUp}
					>
						<title>Click to add a tab</title>
					</path>
				) : null}

				{/* Tabs */}
				{project.tabs.enabled
					? geometry.tabMarkers.map((tab) => (
							<g
								key={tab.index}
								onPointerDown={onTabPointerDown(tab.index)}
								onPointerMove={onTabPointerMove}
								onPointerUp={onTabPointerUp}
								onPointerCancel={onTabPointerUp}
								onDoubleClick={(e) => {
									e.stopPropagation();
									onRemoveTab(tab.index);
								}}
								style={{
									cursor: activeTab === tab.index ? "grabbing" : "grab",
								}}
							>
								<title>
									Tab {tab.index + 1} — drag to move, double-click to remove
								</title>
								{/* Touch target, larger than the visible marker */}
								<circle cx={tab.point.x} cy={tab.point.y} r={hitR} fill="transparent" />
								{/* The stretch of material this tab leaves behind */}
								<path
									d={tabSpanPath(tab.centre)}
									fill="none"
									className="stroke-emerald-500"
									strokeWidth={Math.max(markerR * 0.9, 0.01)}
									strokeLinecap="round"
									opacity={activeTab === tab.index ? 1 : 0.75}
								/>
								<circle
									cx={tab.point.x}
									cy={tab.point.y}
									r={markerR}
									className={
										activeTab === tab.index
											? "fill-emerald-300 stroke-emerald-900"
											: "fill-emerald-500 stroke-emerald-800"
									}
									strokeWidth={1.5}
									vectorEffect="non-scaling-stroke"
								/>
							</g>
						))
					: null}

				{/* Machine origin crosshair — drawn last so it is never obscured */}
				<g
					className="stroke-red-500"
					strokeWidth={1.5}
					vectorEffect="non-scaling-stroke"
					pointerEvents="none"
				>
					<line
						x1={machineOrigin.x - originArm}
						y1={machineOrigin.y}
						x2={machineOrigin.x + originArm}
						y2={machineOrigin.y}
					/>
					<line
						x1={machineOrigin.x}
						y1={machineOrigin.y - originArm}
						x2={machineOrigin.x}
						y2={machineOrigin.y + originArm}
					/>
				</g>
			</g>
		</svg>
	);
};

export default DesignCanvas;
