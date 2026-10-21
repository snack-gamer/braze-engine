import type { ReactNode } from "react";
import type { LibraryAsset } from "../../lib/api";
import {
  formatAssetDependency,
  formatSubAssetCounts,
  summarizeLibraryAssetAnalysis,
} from "../../lib/asset-analysis";
import { formatBytes } from "../../lib/format";
import { EditorIcon } from "../../ui/EditorIcon";
import { InspectorGroup } from "../InspectorGroup";
import { InspectorRow } from "../InspectorRow";
import { InspectorSection } from "../scene/InspectorSection";

export type InspectableAssetKind = "model" | "image" | "prefab" | "hdri";

type AssetMetadataSectionsProps = {
  asset: LibraryAsset;
  kind: InspectableAssetKind;
  usageCount: number;
  preview: ReactNode;
};

const kindLabels: Record<InspectableAssetKind, string> = {
  model: "3D Model",
  image: "Image",
  prefab: "Prefab",
  hdri: "HDRI",
};

function titleCase(value: string) {
  return value
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function fileType(filename: string) {
  const extension = filename.split(".").pop();
  return extension ? extension.toUpperCase() : "File";
}

function sceneUsage(count: number) {
  if (count === 0) return "Not used";
  return `${count} ${count === 1 ? "instance" : "instances"}`;
}

function exceptionalStatus(status: LibraryAsset["status"]): string | null {
  if (status === "importing") return "Importing…";
  if (status === "failed") return "Import failed";
  if (status === "missing") return "Source file missing";
  return null;
}

export function AssetOverviewSection({ asset, kind, usageCount, preview }: AssetMetadataSectionsProps) {
  const analysis = summarizeLibraryAssetAnalysis(asset);
  const contents = formatSubAssetCounts(analysis);
  const status = exceptionalStatus(asset.status);

  return (
    <InspectorSection id="asset.overview" title="Overview" className="asset-inspector" defaultOpen>
      {preview}
      <div className="asset-inspector__identity">
        <strong title={asset.name}>{asset.name}</strong>
        <span>{kindLabels[kind]} · {fileType(asset.filename)}</span>
      </div>
      {contents && (
        <InspectorRow label="Contents">
          <span className="inspector-row__value" title={contents}>{contents}</span>
        </InspectorRow>
      )}
      <InspectorRow label="Source size">
        <span className="inspector-row__value">{formatBytes(asset.sizeBytes)}</span>
      </InspectorRow>
      <InspectorRow label="Current scene">
        <span className="inspector-row__value">{sceneUsage(usageCount)}</span>
      </InspectorRow>
      {status && (
        <InspectorRow label="Status">
          <span className="inspector-row__value">{status}</span>
        </InspectorRow>
      )}
    </InspectorSection>
  );
}

export function AssetImportIssuesSection({ asset }: Pick<AssetMetadataSectionsProps, "asset">) {
  const diagnostics = summarizeLibraryAssetAnalysis(asset).diagnostics;
  if (diagnostics.length === 0) return null;

  return (
    <InspectorSection
      id="asset.importIssues"
      title="Import Issues"
      meta={diagnostics.length}
      className="asset-import-issues"
      defaultOpen
    >
      <div className="asset-import-issues__list" role="list">
        {diagnostics.map((diagnostic, index) => (
          <div
            className={`asset-import-issue asset-import-issue--${diagnostic.severity}`}
            key={`${diagnostic.code}:${index}`}
            role="listitem"
          >
            <EditorIcon name={diagnostic.severity === "error" ? "error" : "warning"} size="control" />
            <div>
              <strong>{diagnostic.severity === "error" ? "Import error" : "Import warning"}</strong>
              <p>{diagnostic.message}</p>
            </div>
          </div>
        ))}
      </div>
    </InspectorSection>
  );
}

export function AssetAdvancedSection({ asset }: Pick<AssetMetadataSectionsProps, "asset">) {
  const analysis = summarizeLibraryAssetAnalysis(asset);

  return (
    <InspectorSection id="asset.advanced" title="Advanced" defaultOpen={false}>
      <InspectorGroup id="asset.advanced.source" title="Source">
        <InspectorRow label="Path">
          <span className="inspector-row__value inspector-row__value--mono" title={asset.path}>{asset.path}</span>
        </InspectorRow>
        {asset.importerId && (
          <InspectorRow label="Importer">
            <span className="inspector-row__value inspector-row__value--mono">{asset.importerId}</span>
          </InspectorRow>
        )}
      </InspectorGroup>

      {(asset.guid || analysis.foreignIds.length > 0) && (
        <InspectorGroup id="asset.advanced.identifiers" title="Identifiers" defaultOpen={false}>
          {asset.guid && (
            <InspectorRow label="Asset ID">
              <span className="inspector-row__value inspector-row__value--mono" title={asset.guid}>{asset.guid}</span>
            </InspectorRow>
          )}
          {analysis.foreignIds.map(([source, id]) => (
            <InspectorRow key={source} label={source}>
              <span className="inspector-row__value inspector-row__value--mono" title={id}>{id}</span>
            </InspectorRow>
          ))}
        </InspectorGroup>
      )}

      {analysis.dependencies.length > 0 && (
        <InspectorGroup
          id="asset.advanced.dependencies"
          title="Dependencies"
          meta={analysis.dependencies.length}
          defaultOpen={false}
        >
          {analysis.dependencies.map((dependency, index) => {
            const value = formatAssetDependency(dependency);
            return (
              <InspectorRow
                key={`${dependency.kind}:${value}:${index}`}
                label={titleCase(dependency.relationship ?? dependency.kind)}
              >
                <span className="inspector-row__value inspector-row__value--mono" title={value}>{value}</span>
              </InspectorRow>
            );
          })}
        </InspectorGroup>
      )}

      {analysis.diagnostics.length > 0 && (
        <InspectorGroup
          id="asset.advanced.diagnostics"
          title="Diagnostic Codes"
          meta={analysis.diagnostics.length}
          defaultOpen={false}
        >
          {analysis.diagnostics.map((diagnostic, index) => (
            <InspectorRow key={`${diagnostic.code}:${index}`} label={titleCase(diagnostic.severity)}>
              <span className="inspector-row__value inspector-row__value--mono" title={diagnostic.code}>
                {diagnostic.code}
              </span>
            </InspectorRow>
          ))}
        </InspectorGroup>
      )}
    </InspectorSection>
  );
}
