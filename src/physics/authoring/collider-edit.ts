export type ColliderEditSelection = {
  objectId: string;
  colliderId: string;
};

export function isColliderBeingEdited(
  selection: ColliderEditSelection | null,
  objectId: string,
  colliderId: string,
): boolean {
  return selection?.objectId === objectId && selection.colliderId === colliderId;
}
