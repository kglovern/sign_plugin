import { useMemo, useState } from "react";

type Props = {
	gcode: string;
	/**
	 * Copy and save are owned by the parent rather than done here, because both
	 * must go through the "regenerate first if stale" rule. Keeping that in one
	 * place is what stops a stale program reaching a machine.
	 */
	onCopy: () => Promise<string>;
	onSave: () => Promise<void>;
};

const GcodeView = ({ gcode, onCopy, onSave }: Props) => {
	const [copied, setCopied] = useState(false);
	const [busy, setBusy] = useState(false);

	const stats = useMemo(() => {
		const lines = gcode.split("\n").filter((l) => l.trim() !== "");
		const motion = lines.filter((l) => /^G[01]\b/.test(l.trim())).length;
		return {
			lines: lines.length,
			motion,
			bytes: new Blob([gcode]).size,
		};
	}, [gcode]);

	const copy = async () => {
		setBusy(true);
		try {
			const fresh = await onCopy();
			await navigator.clipboard.writeText(fresh);
			setCopied(true);
			setTimeout(() => setCopied(false), 1500);
		} catch {
			setCopied(false);
		} finally {
			setBusy(false);
		}
	};

	const save = async () => {
		setBusy(true);
		try {
			await onSave();
		} finally {
			setBusy(false);
		}
	};

	return (
		<div className="flex h-full flex-col gap-2">
			<div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
				<span>
					{stats.lines} lines · {stats.motion} motion ·{" "}
					{(stats.bytes / 1024).toFixed(1)} kB
				</span>
				<span className="grow" />
				<button
					type="button"
					onClick={copy}
					disabled={busy}
					className="cursor-pointer rounded-md border border-gray-300 px-2 py-1 hover:border-blue-500 disabled:opacity-50 dark:border-gray-700"
				>
					{copied ? "Copied" : "Copy"}
				</button>
				<button
					type="button"
					onClick={save}
					disabled={busy}
					className="cursor-pointer rounded-md border border-gray-300 px-2 py-1 hover:border-blue-500 disabled:opacity-50 dark:border-gray-700"
				>
					Save .nc
				</button>
			</div>
			<pre className="min-h-0 grow overflow-auto rounded-lg bg-gray-100 p-3 font-mono text-[11px] leading-relaxed dark:bg-gray-900">
				{gcode}
			</pre>
		</div>
	);
};

export default GcodeView;
