import { ProseBlock } from "./prose-block";
import { AvPackageBlock } from "./av-package-block";

const REGISTRY = {
	prose: ProseBlock,
	av_package: AvPackageBlock,
};

export function BlockRenderer({ block }) {
	const Component = REGISTRY[block.type];
	if (!Component) return null;
	return <Component payload={block.payload} />;
}

export function BlockList({ blocks }) {
	if (!blocks?.length) return null;
	return (
		<div className="space-y-10 lg:space-y-14">
			{blocks.map((b) => (
				<BlockRenderer key={b.id} block={b} />
			))}
		</div>
	);
}
