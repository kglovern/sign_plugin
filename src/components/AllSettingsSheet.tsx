/**
 * Every parameter at once, for anyone who already knows what they want.
 *
 * This is the original options panel, unchanged, in a full-screen sheet. It
 * edits the same `project` object the guided steps do, so the two views cannot
 * drift apart — and no setting can become unreachable if a step happens not to
 * offer it.
 */

import type { FontRegistry } from "../lib/fonts";
import type { Project } from "../lib/project";

import OptionsPanel from "./OptionsPanel";
import { Hint, Sheet } from "./touch/Touch";

const AllSettingsSheet = ({
	project,
	setProject,
	registry,
	onClose,
}: {
	project: Project;
	setProject: (updater: (previous: Project) => Project) => void;
	registry: FontRegistry;
	onClose: () => void;
}) => (
	<Sheet title="All settings" onClose={onClose}>
		<div className="mb-3">
			<Hint>
				Changes here show up in the guided steps straight away — it is the same
				design either way.
			</Hint>
		</div>
		<OptionsPanel project={project} setProject={setProject} registry={registry} />
	</Sheet>
);

export default AllSettingsSheet;
