import fs from 'node:fs/promises';
import path from 'node:path';

import fg from 'fast-glob';
import ts from 'typescript';

export type HttpMethod =
  | 'get'
  | 'post'
  | 'put'
  | 'delete'
  | 'patch'
  | 'options'
  | 'head'
  | 'all';

const HTTP_METHODS: HttpMethod[] = [
  'get',
  'post',
  'put',
  'delete',
  'patch',
  'options',
  'head',
  'all',
];

export interface ControllerRoute {
  method: HttpMethod;
  path: string;
  summary: string;
  tag?: string;
  sourceFile: string;
  line: number;
  folder?: string;
  origin: 'nest' | 'express';
}

export interface ScanControllersOptions {
  cwd?: string;
  patterns?: string[];
  ignore?: string[];
}

const DEFAULT_PATTERNS = [
  'src/**/*controller.{ts,tsx,js,jsx}',
  'src/**/*Controller.{ts,tsx,js,jsx}',
  'src/**/*router.{ts,tsx,js,jsx}',
  'src/**/*Router.{ts,tsx,js,jsx}',
  'src/**/routes/**/*.{ts,tsx,js,jsx}',
];

const DEFAULT_IGNORE = ['**/dist/**', '**/node_modules/**'];

export async function scanControllers(
  options: ScanControllersOptions = {}
): Promise<ControllerRoute[]> {
  const cwd = options.cwd ?? process.cwd();
  const patterns = options.patterns ?? DEFAULT_PATTERNS;
  const files = await fg(patterns, {
    cwd,
    absolute: true,
    ignore: options.ignore ?? DEFAULT_IGNORE,
  });

  const routes: ControllerRoute[] = [];

  for (const file of files) {
    const content = await fs.readFile(file, 'utf8');
    const source = ts.createSourceFile(
      file,
      content,
      ts.ScriptTarget.Latest,
      true
    );
    routes.push(...extractNestRoutes(source, file, cwd));
    routes.push(...extractExpressRoutes(source, file, cwd));
  }

  return deduplicateRoutes(routes);
}

function deduplicateRoutes(routes: ControllerRoute[]): ControllerRoute[] {
  const seen = new Map<string, ControllerRoute>();
  for (const route of routes) {
    const key = `${route.method}:${route.path}:${route.tag ?? ''}`;
    if (!seen.has(key)) {
      seen.set(key, route);
    }
  }
  return Array.from(seen.values());
}

function extractNestRoutes(
  sourceFile: ts.SourceFile,
  filePath: string,
  cwd: string
): ControllerRoute[] {
  const routes: ControllerRoute[] = [];

  sourceFile.forEachChild((node) => {
    if (!ts.isClassDeclaration(node)) return;
    const decorators = getDecorators(node);
    const controllerDecorator = decorators?.find((decorator) =>
      isDecoratorNamed(decorator, 'Controller')
    );
    if (!controllerDecorator) return;

    const basePath = extractStringValueFromDecorator(controllerDecorator) ?? '';
    const tag = node.name?.text?.replace(/Controller$/, '');

    node.members.forEach((member) => {
      if (!ts.isMethodDeclaration(member)) return;
      const memberDecorators = getDecorators(member);
      if (!memberDecorators) return;
      const routeDecorator = memberDecorators.find((decorator) =>
        isDecoratorNamedOneOf(decorator, HTTP_METHODS.map((m) => capitalize(m)))
      );
      if (!routeDecorator) return;

      const methodName = extractDecoratorName(routeDecorator)?.toLowerCase() as
        | HttpMethod
        | undefined;
      if (!methodName) return;

      const methodPath =
        extractStringValueFromDecorator(routeDecorator) ?? '';
      const fullPath = normalizePath(basePath, methodPath);
      const { line } = sourceFile.getLineAndCharacterOfPosition(member.pos);
      const summary = buildSummary({
        className: node.name?.text ?? 'Controller',
        methodName: member.name?.getText() ?? methodName,
        description: extractJSDocSummary(member),
      });

      routes.push({
        method: methodName,
        path: fullPath,
        summary,
        tag,
        sourceFile: path.relative(cwd, filePath),
        line: line + 1,
        folder: deriveFolder(filePath, cwd),
        origin: 'nest',
      });
    });
  });

  return routes;
}

function extractExpressRoutes(
  sourceFile: ts.SourceFile,
  filePath: string,
  cwd: string
): ControllerRoute[] {
  const routes: ControllerRoute[] = [];

  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node)) {
      const methodInfo = resolveExpressCall(node);
      if (methodInfo) {
        const { method, routePath } = methodInfo;
        const { line } = sourceFile.getLineAndCharacterOfPosition(node.pos);
        routes.push({
          method,
          path: routePath,
          summary: `来自 ${path.basename(filePath)} 行 ${line + 1}`,
          tag: inferTagFromPath(filePath),
          sourceFile: path.relative(cwd, filePath),
          line: line + 1,
          folder: deriveFolder(filePath, cwd),
          origin: 'express',
        });
      }
    }
    node.forEachChild(visit);
  }

  visit(sourceFile);

  return routes;
}

function resolveExpressCall(
  node: ts.CallExpression
): { method: HttpMethod; routePath: string } | undefined {
  if (!ts.isPropertyAccessExpression(node.expression)) return undefined;
  const methodName = node.expression.name.getText().toLowerCase();
  if (!HTTP_METHODS.includes(methodName as HttpMethod)) return undefined;
  const [firstArg] = node.arguments;
  if (!firstArg) return undefined;
  const literal = resolveStringFromExpression(firstArg);
  if (!literal) return undefined;
  return {
    method: methodName as HttpMethod,
    routePath: normalizePath('', literal),
  };
}

function isDecoratorNamed(decorator: ts.Decorator, name: string): boolean {
  const decoratorName = extractDecoratorName(decorator);
  return decoratorName === name;
}

function isDecoratorNamedOneOf(
  decorator: ts.Decorator,
  names: string[]
): boolean {
  const decoratorName = extractDecoratorName(decorator);
  return decoratorName ? names.includes(decoratorName) : false;
}

function extractDecoratorName(decorator: ts.Decorator): string | undefined {
  const expression = decorator.expression;
  if (ts.isCallExpression(expression)) {
    if (ts.isIdentifier(expression.expression)) {
      return expression.expression.text;
    }
  } else if (ts.isIdentifier(expression)) {
    return expression.text;
  }
  return undefined;
}

function extractStringValueFromDecorator(
  decorator: ts.Decorator
): string | undefined {
  if (!ts.isCallExpression(decorator.expression)) return undefined;
  const [firstArg] = decorator.expression.arguments;
  return firstArg ? resolveStringFromExpression(firstArg) : undefined;
}

function getDecorators(node: ts.Node): readonly ts.Decorator[] | undefined {
  const legacy =
    (node as ts.Node & { decorators?: ts.NodeArray<ts.Decorator> }).decorators;
  if (legacy && legacy.length > 0) {
    return Array.from(legacy);
  }

  const canHave = (ts as unknown as { canHaveDecorators?: (n: ts.Node) => boolean })
    .canHaveDecorators;
  const get = (ts as unknown as { getDecorators?: (n: ts.Node) => ts.Decorator[] | undefined })
    .getDecorators;

  if (canHave && canHave(node) && get) {
    const decorators = get(node);
    if (decorators?.length) return decorators;
  }

  return undefined;
}

function resolveStringFromExpression(node: ts.Expression): string | undefined {
  if (ts.isStringLiteralLike(node)) return node.text;
  if (ts.isTemplateExpression(node)) {
    if (node.templateSpans.length === 0) {
      return node.head.text;
    }
    return undefined;
  }
  return undefined;
}

function normalizePath(base: string, addition: string): string {
  const segments = [base, addition]
    .map((segment) => segment?.trim())
    .filter(Boolean) as string[];
  if (segments.length === 0) return '/';
  const combined = segments.join('/');
  const sanitized = combined.replace(/\\+/g, '/').replace(/\/+/g, '/');
  const normalized = sanitized.startsWith('/') ? sanitized : `/${sanitized}`;
  return normalized.replace(/\/+/g, '/');
}

function buildSummary(params: {
  className: string;
  methodName: string;
  description?: string;
}): string {
  if (params.description?.trim()) return params.description.trim();
  return `${params.className}.${params.methodName}`;
}

function extractJSDocSummary(node: ts.Node): string | undefined {
  const tags = ts.getJSDocCommentsAndTags(node);
  if (!tags.length) return undefined;
  const comment = tags
    .map((tag) => ('comment' in tag ? tag.comment : undefined))
    .find((text) => Boolean(text));
  if (!comment || Array.isArray(comment)) return undefined;
  return comment;
}

function deriveFolder(filePath: string, cwd: string): string | undefined {
  const relativeDir = path.relative(cwd, path.dirname(filePath));
  return relativeDir === '' ? undefined : relativeDir;
}

function inferTagFromPath(filePath: string): string | undefined {
  const parts = path.normalize(filePath).split(path.sep);
  const folder = parts.at(-2);
  return folder?.replace(/[-_]/g, ' ');
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
