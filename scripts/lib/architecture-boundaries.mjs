import path from "node:path";
import ts from "typescript";

const PLATFORM_PACKAGES = new Set(["react", "react-dom", "three"]);
const DOMAIN_FORBIDDEN_SEGMENTS = new Set([
  "adapters",
  "components",
  "hooks",
  "runtime",
  "serialization",
  "three",
  "ui",
]);
const SERIALIZATION_FORBIDDEN_SEGMENTS = new Set([
  "adapters",
  "components",
  "hooks",
  "runtime",
  "three",
  "ui",
]);
const BROWSER_GLOBALS = new Set([
  "globalThis",
  "indexedDB",
  "localStorage",
  "navigator",
  "sessionStorage",
  "window",
]);

export function architectureBoundaryFailures(relativeFilename, source) {
  const relative = normalizePath(relativeFilename);
  const isDomain = relative.includes("/domain/") || relative.startsWith("domain/");
  const isSerialization = relative.includes("/serialization/")
    || relative.startsWith("serialization/")
    || path.posix.basename(relative) === "serialization.ts";
  if (!isDomain && !isSerialization) return [];

  const layer = isDomain ? "domain" : "serialization";
  const forbiddenSegments = isDomain ? DOMAIN_FORBIDDEN_SEGMENTS : SERIALIZATION_FORBIDDEN_SEGMENTS;
  const failures = [];
  for (const specifier of importSpecifiers(source)) {
    const packageName = packageRoot(specifier);
    if (PLATFORM_PACKAGES.has(packageName)) {
      failures.push(`${relative}: ${layer} module imports platform package '${specifier}'`);
      continue;
    }
    const target = resolveImport(relative, specifier);
    if (!target) continue;
    // The final segment is a module basename (`domain/components.ts` is not
    // the editor Components layer), so only directory segments define layers.
    const segments = target.split("/").slice(0, -1);
    const forbidden = segments.find((segment) => forbiddenSegments.has(segment));
    if (forbidden) {
      failures.push(`${relative}: ${layer} module depends on '${forbidden}' layer via '${specifier}'`);
    }
  }

  if (usesBrowserGlobal(source)) {
    failures.push(`${relative}: ${layer} module accesses a browser global directly`);
  }
  return failures;
}

export function importSpecifiers(source) {
  const specifiers = [];
  const sourceFile = parseSource(source);
  const visit = (node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
      && node.moduleSpecifier
      && ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      specifiers.push({ index: node.getStart(sourceFile), specifier: node.moduleSpecifier.text });
    } else if (
      ts.isCallExpression(node)
      && node.expression.kind === ts.SyntaxKind.ImportKeyword
      && node.arguments.length === 1
      && ts.isStringLiteralLike(node.arguments[0])
    ) {
      specifiers.push({ index: node.getStart(sourceFile), specifier: node.arguments[0].text });
    } else if (
      ts.isImportEqualsDeclaration(node)
      && ts.isExternalModuleReference(node.moduleReference)
      && node.moduleReference.expression
      && ts.isStringLiteralLike(node.moduleReference.expression)
    ) {
      specifiers.push({
        index: node.getStart(sourceFile),
        specifier: node.moduleReference.expression.text,
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  specifiers.sort((first, second) => first.index - second.index);
  return specifiers.map((match) => match.specifier);
}

function packageRoot(specifier) {
  if (specifier.startsWith("@")) return specifier.split("/").slice(0, 2).join("/");
  return specifier.split("/")[0];
}

function resolveImport(relativeFilename, specifier) {
  if (!specifier.startsWith(".")) return null;
  return normalizePath(path.posix.normalize(path.posix.join(path.posix.dirname(relativeFilename), specifier)));
}

function normalizePath(value) {
  return value.split(path.sep).join("/").replace(/^\.\//, "");
}

function parseSource(source) {
  return ts.createSourceFile(
    "architecture-source.tsx",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
}

function usesBrowserGlobal(source) {
  const sourceFile = parseSource(source);
  let found = false;
  const visit = (node) => {
    if (found) return;
    if (
      ts.isIdentifier(node)
      && BROWSER_GLOBALS.has(node.text)
      && isValueReference(node)
    ) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
}

function isValueReference(node) {
  const parent = node.parent;
  if (!parent) return false;
  if (ts.isPropertyAccessExpression(parent) && parent.name === node) return false;
  if (
    (ts.isPropertyAssignment(parent) || ts.isMethodDeclaration(parent) || ts.isPropertyDeclaration(parent))
    && parent.name === node
  ) return false;
  if (
    (ts.isVariableDeclaration(parent)
      || ts.isParameter(parent)
      || ts.isFunctionDeclaration(parent)
      || ts.isClassDeclaration(parent)
      || ts.isInterfaceDeclaration(parent)
      || ts.isTypeAliasDeclaration(parent)
      || ts.isBindingElement(parent)
      || ts.isImportClause(parent)
      || ts.isImportSpecifier(parent))
    && parent.name === node
  ) return false;
  return true;
}
