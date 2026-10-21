import { writeFile } from "node:fs/promises";
import path from "node:path";
import { BoxGeometry, Matrix4 } from "three";

export const COMPOUND_MODEL_GUID = "817168a80148d3c522d09ca13cf7cd5e";
export const COMPOUND_MODEL_NAME = "Compound Character.fbx";

/** Original ASCII FBX rig and motion. No downloaded game assets are required. */
export function compoundModelSource() {
  const bones = [
    ["Hips", -1, [0, 1, 0]], ["Spine", 0, [0, 0.3, 0]], ["Head", 1, [0, 0.6, 0]],
    ["LeftArm", 1, [0.3, 0.3, 0]], ["LeftForeArm", 3, [0.4, 0, 0]], ["LeftHand", 4, [0.3, 0, 0]],
    ["RightArm", 1, [-0.3, 0.3, 0]], ["RightForeArm", 6, [-0.4, 0, 0]], ["RightHand", 7, [-0.3, 0, 0]],
    ["LeftUpLeg", 0, [0.15, -0.1, 0]], ["LeftLeg", 9, [0, -0.4, 0]], ["LeftFoot", 10, [0, -0.4, 0.1]],
    ["RightUpLeg", 0, [-0.15, -0.1, 0]], ["RightLeg", 12, [0, -0.4, 0]], ["RightFoot", 13, [0, -0.4, 0.1]],
  ];
  const block = (header, lines) => `${header}${header.includes(':') ? '' : ':'} {\n${lines.map((line) => `\t${line.replaceAll('\n', '\n\t')}`).join('\n')}\n}`;
  const array = (key, values) => block(`${key}: *${values.length}`, [`a: ${values.join(',')}`]);
  const props = (translation = [0, 0, 0]) => block('Properties70', [
    `P: "Lcl Translation", "Lcl Translation", "", "A",${translation.join(',')}`,
    'P: "Lcl Rotation", "Lcl Rotation", "", "A",0,0,0',
    'P: "Lcl Scaling", "Lcl Scaling", "", "A",1,1,1',
  ]);
  const objects = [], connections = [], world = [];
  bones.forEach(([name, parent, translation], index) => {
    const matrix = new Matrix4().makeTranslation(...translation);
    if (parent >= 0) matrix.premultiply(world[parent]);
    world.push(matrix);
    objects.push(block(`Model: ${100 + index}, "Model::${name}", "LimbNode"`, [props(translation)]));
    connections.push(`C: "OO",${100 + index},${parent < 0 ? 0 : 100 + parent}`);
  });
  for (let part = 0; part < 2; part++) {
    const base = 1000 + part * 100, name = part ? 'Trim' : 'Body';
    const geometry = new BoxGeometry(part ? 0.25 : 0.5, part ? 0.25 : 0.8, 0.3).translate(0, part ? 1.9 : 1.3, 0);
    const vertices = [...geometry.attributes.position.array];
    const indices = [...geometry.index.array].map((value, i) => i % 3 === 2 ? -value - 1 : value);
    objects.push(block(`Geometry: ${base}, "Geometry::${name}", "Mesh"`, [array('Vertices', vertices), array('PolygonVertexIndex', indices)]));
    objects.push(block(`Model: ${base + 1}, "Model::${name}", "Mesh"`, [props()]));
    objects.push(block(`Material: ${base + 2}, "Material::${name} Material", ""`, ['ShadingModel: "phong"', block('Properties70', [`P: "DiffuseColor", "Color", "", "A",${part ? '0.2,0.5,1' : '1,0.4,0.1'}`])]));
    connections.push(`C: "OO",${base},${base + 1}`, `C: "OO",${base + 1},0`, `C: "OO",${base + 2},${base + 1}`);
    if (part === 0) {
      objects.push(block(`Deformer: ${base + 3}, "Deformer::${name} Skin", "Skin"`, ['Version: 101']));
      connections.push(`C: "OO",${base + 3},${base}`);
    }
    (part === 0 ? bones : []).forEach((_, bone) => {
      const cluster = base + 10 + bone;
      const vertexIds = bone === (part ? 2 : 1) ? Array.from({ length: vertices.length / 3 }, (_, i) => i) : [];
      objects.push(block(`Deformer: ${cluster}, "SubDeformer::${bone}", "Cluster"`, [
        'Version: 100', array('Indexes', vertexIds), array('Weights', vertexIds.map(() => 1)),
        array('Transform', new Matrix4().elements), array('TransformLink', world[bone].elements),
      ]));
      connections.push(`C: "OO",${cluster},${base + 3}`, `C: "OO",${100 + bone},${cluster}`);
    });
    geometry.dispose();
  }
  objects.push(block('AnimationStack: 2000, "AnimStack::Sway", ""', ['']));
  objects.push(block('AnimationLayer: 2001, "AnimLayer::Base", ""', ['']));
  objects.push(block('AnimationCurveNode: 2002, "AnimCurveNode::R", ""', ['']));
  objects.push(block('AnimationCurve: 2003, "AnimCurve::Z", ""', [
    array('KeyTime', Array.from({ length: 111 }, (_, i) => Math.round(i / 30 * 46186158000))),
    array('KeyValueFloat', Array.from({ length: 111 }, (_, i) => Math.sin(i / 30 * Math.PI * 2) * 12)),
  ]));
  connections.push('C: "OO",2001,2000', 'C: "OO",2002,2001', 'C: "OP",2002,101,"Lcl Rotation"', 'C: "OP",2003,2002,"d|Z"');
  return '; FBX 7.4.0 project file\n' + [
    block('FBXHeaderExtension', ['FBXHeaderVersion: 1003', 'FBXVersion: 7400', 'Creator: "Braze original test fixture"']),
    block('GlobalSettings', [block('Properties70', ['P: "UpAxis", "int", "Integer", "",1', 'P: "UpAxisSign", "int", "Integer", "",1', 'P: "UnitScaleFactor", "double", "Number", "",100'])]),
    block('Objects', objects), block('Connections', connections),
  ].join('\n') + '\n';
}

export async function writeCompoundModel(assetsRoot) {
  const file = path.join(assetsRoot, COMPOUND_MODEL_NAME);
  await writeFile(file, compoundModelSource());
  await writeFile(`${file}.braze.meta`, JSON.stringify({ fileFormatVersion: 1, guid: COMPOUND_MODEL_GUID,
    importer: { id: "braze.model", settingsVersion: 2, settings: {
      scaleFactor: 1, fitToEditorSize: false, convertUnits: false, preserveHierarchy: true, importAnimations: true,
      rig: { kind: "humanoid", importBlendShapes: true, maxBoneInfluences: 4, optimizeBones: false },
      clipSettings: { "clip:Sway": { looping: true, loopPose: true } },
    } }, labels: [], foreignIds: {},
  }));
  return file;
}
