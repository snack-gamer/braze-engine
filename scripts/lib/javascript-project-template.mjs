import { collectLayout } from '../../templates/javascript/UI/collect-layout.js';
/** A visible, playable starting scene for the public JavaScript project workflow. */
export function javascriptStarterScene() {
  const transform = (position, scale = [1, 1, 1]) => ({ position, scale, rotation_degrees: [0, 0, 0] });
  const block = (id, position, scale, color) => ({ id, source_type: 'cube', name: id, color,
    transform: transform(position, scale), colliders: [{ id: `${id}-shape`, shape: 'box', enabled: true, size: [1, 1, 1] }] });
  return {
    version: 'braze-engine/scene-v1', name: 'Collect Three', activeCameraId: 'camera',
    environment: { worldSource: 'sky', ao: { enabled: false }, sky: {
      cloudsCoverage: 0, cloudsDensity: 0, godraysIntensity: 0, scatteringIntensity: 0, fogDensity: 0,
    } },
    objects: [
      { id: 'hud', source_type: 'transform', name: 'HUD', transform: transform([0, 0, 0]), ui_canvas: structuredClone(collectLayout) },
      { id: 'camera', source_type: 'camera', name: 'Camera', transform: transform([0, 6, -7]),
        camera: { target: [0, 0.8, 2], fov_degrees: 60 } },
      { id: 'sun', source_type: 'directionalLight', name: 'Sun',
        transform: { position: [0, 3, 0], rotation_degrees: [50, -30, 0] } },
      block('Ground', [0, -0.5, 3], [16, 1, 16], '#526575'),
      block('Jump step', [2.5, 0.15, 4], [2, 0.3, 2], '#506fb0'),
      { id: 'player', source_type: 'cube', name: 'Player', color: '#29d6ff', transform: transform([0, 0.85, 0], [0.5, 1, 0.5]),
        rigidbody: { enabled: true, body_type: 'kinematic', use_gravity: false },
        colliders: [{ id: 'player-capsule', enabled: true, shape: 'capsule', axis: 'y', center: [0, 0, 0], radius: 0.7, length: 0.7 }],
        character_controller: { version: 'braze/character-controller-v1', enabled: true, capsule_collider_id: 'player-capsule' },
        behaviors: { version: 1, entries: [{ id: 'control', type: 'braze.control.top-down', typeVersion: 1, enabled: true, values: { speed: 3, sharpness: 0 } }] } },
      ...[[0, 0.4, 1], [2.5, 0.7, 4], [-2.5, 0.4, 6]].map((position, index) => ({
        id: `collectible-${index + 1}`, source_type: 'cube', name: `Collectible ${index + 1}`, color: '#ffb020',
        transform: transform(position, [0.45, 0.45, 0.45]),
        behaviors: { version: 1, entries: [{ id: 'collectible', type: 'starter.collectible', typeVersion: 1,
          enabled: true, values: { player: { entityId: 'player' }, radius: 1.5, points: 1 } }] },
      })),
    ],
  };
}
