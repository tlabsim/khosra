import { now, uid, validateState, type State } from "./model";
import { applyMaterialDeletions, materialHeads } from "./materials";

export function deleteMaterial(
  state: State,
  materialId: string,
  expectedHeads: string[],
): State {
  const item = state.materials.find((m) => m.id === materialId);
  if (!item)
    throw Error("This item no longer exists. Close and refresh the list.");
  const versions = state.materials.filter((m) => m.itemId === item.itemId);
  const heads = materialHeads(versions)
    .map((m) => m.id)
    .sort();
  if (JSON.stringify(heads) !== JSON.stringify([...expectedHeads].sort()))
    throw Error(
      "This item changed while you were reviewing deletion. Close and review the latest version first.",
    );
  return validateState(
    applyMaterialDeletions({
      ...state,
      materialDeletions: [
        ...state.materialDeletions,
        {
          id: uid(),
          itemId: item.itemId,
          bookId: item.bookId,
          createdAt: now(),
        },
      ],
    }),
  );
}
