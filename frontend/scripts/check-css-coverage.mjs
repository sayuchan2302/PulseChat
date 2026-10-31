#!/usr/bin/env node
/**
 * Fails when a literal class name used in TSX has no CSS rule anywhere in src.
 *
 * This guard exists because splitting a large stylesheet can silently drop
 * selectors while TypeScript, lint, and unit tests all stay green.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.resolve(__dirname, '../src');
const allowlistPath = path.join(__dirname, 'css-coverage-allowlist.json');

function walk(directory) {
  return readdirSync(directory).flatMap((name) => {
    const fullPath = path.join(directory, name);
    return statSync(fullPath).isDirectory() ? walk(fullPath) : [fullPath];
  });
}

function stripCssNoise(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/@import[^;]+;/g, ' ')
    .replace(/url\([^)]*\)/g, ' ')
    .replace(/"(?:\\.|[^"\\])*"/g, ' ')
    .replace(/'(?:\\.|[^'\\])*'/g, ' ');
}

function collectDefinedClasses() {
  const defined = new Map();
  for (const file of walk(srcDir).filter((file) => file.endsWith('.css'))) {
    const source = stripCssNoise(readFileSync(file, 'utf8'));
    for (const match of source.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) {
      const className = match[1];
      if (!defined.has(className)) defined.set(className, file);
    }
  }
  return defined;
}

function addTokens(tokens, rawText, file, node) {
  for (const token of rawText.split(/\s+/)) {
    if (!token || !/^-?[_a-zA-Z][\w-]*$/.test(token) || token.endsWith('-')) continue;
    const line = node.getSourceFile().getLineAndCharacterOfPosition(node.getStart()).line + 1;
    if (!tokens.has(token)) tokens.set(token, []);
    tokens.get(token).push(`${path.relative(srcDir, file)}:${line}`);
  }
}

function collectClassExpression(node, tokens, file) {
  if (ts.isParenthesizedExpression(node) || ts.isJsxExpression(node)) {
    return collectClassExpression(node.expression, tokens, file);
  }

  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    addTokens(tokens, node.text, file, node);
    return;
  }

  if (ts.isTemplateExpression(node)) {
    addTokens(tokens, node.head.text, file, node.head);
    for (const span of node.templateSpans) {
      addTokens(tokens, span.literal.text, file, span.literal);
      collectClassExpression(span.expression, tokens, file);
    }
    return;
  }

  // A ternary condition is not a class value: `x === 'ALL' ? 'active' : ''`
  // only contributes `active` and the empty string.
  if (ts.isConditionalExpression(node)) {
    collectClassExpression(node.whenTrue, tokens, file);
    collectClassExpression(node.whenFalse, tokens, file);
    return;
  }

  if (ts.isBinaryExpression(node)) {
    const operator = node.operatorToken.kind;
    if (
      operator === ts.SyntaxKind.PlusToken ||
      operator === ts.SyntaxKind.AmpersandAmpersandToken ||
      operator === ts.SyntaxKind.BarBarToken ||
      operator === ts.SyntaxKind.QuestionQuestionToken
    ) {
      collectClassExpression(node.left, tokens, file);
      collectClassExpression(node.right, tokens, file);
    }
    return;
  }

  if (ts.isCallExpression(node)) {
    for (const argument of node.arguments) collectClassExpression(argument, tokens, file);
    return;
  }

  if (ts.isArrayLiteralExpression(node)) {
    for (const element of node.elements) collectClassExpression(element, tokens, file);
    return;
  }

  if (ts.isObjectLiteralExpression(node)) {
    for (const property of node.properties) {
      if (!ts.isPropertyAssignment(property)) continue;
      if (ts.isStringLiteralLike(property.name)) {
        addTokens(tokens, property.name.text, file, property.name);
      }
      collectClassExpression(property.initializer, tokens, file);
    }
    return;
  }

  if (ts.isPropertyAccessExpression(node)) {
    return;
  }

  ts.forEachChild(node, (child) => collectClassExpression(child, tokens, file));
}

function collectUsedClasses() {
  const used = new Map();
  for (const file of walk(srcDir).filter((file) => file.endsWith('.tsx'))) {
    const source = readFileSync(file, 'utf8');
    const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

    const visit = (node) => {
      if (ts.isJsxAttribute(node) && node.name.getText(sourceFile) === 'className') {
        const initializer = node.initializer;
        if (initializer && ts.isStringLiteral(initializer)) {
          addTokens(used, initializer.text, file, initializer);
        } else if (initializer && ts.isJsxExpression(initializer) && initializer.expression) {
          collectClassExpression(initializer.expression, used, file);
        }
      }
      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
  }
  return used;
}

const allowlist = JSON.parse(readFileSync(allowlistPath, 'utf8'));
const defined = collectDefinedClasses();
const used = collectUsedClasses();
const missing = [...used.entries()]
  .filter(([className]) => !defined.has(className) && !(className in allowlist))
  .sort(([a], [b]) => a.localeCompare(b));

const allowlisted = [...used.keys()].filter(
  (className) => !defined.has(className) && className in allowlist
);

console.log(
  `CSS coverage: ${used.size} class names used in TSX, ${defined.size} defined in CSS, ` +
    `${missing.length} missing (${allowlisted.length} allowlisted).`
);

if (allowlisted.length > 0) {
  console.log(`Allowlisted missing classes: ${allowlisted.sort().join(', ')}`);
}

if (missing.length > 0) {
  console.error('\nMissing CSS rules:');
  for (const [className, locations] of missing) {
    const uniqueLocations = [...new Set(locations)].slice(0, 4).join(', ');
    console.error(`  .${className} (${uniqueLocations})`);
  }
  console.error(
    '\nAdd the missing rules or document a deliberate exception in scripts/css-coverage-allowlist.json.'
  );
  process.exitCode = 1;
}
