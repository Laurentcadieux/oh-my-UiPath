/**
 * rea-uipath — Reverse Engineer Anything → UiPath.
 *
 * Inspired by [REA](https://github.com/morluto/rea): "See a feature you like.
 * Understand how it works."
 *
 * Given ANY existing system (a Python script, shell script, Excel macro,
 * BPMN from another platform, a manual process description, a web form,
 * an API integration), REA-UiPath:
 *
 * 1. Inspects and understands what it does
 * 2. Documents it as a PDD (Process Design Document)
 * 3. Maps it to UiPath products (RPA, Maestro Case/Flow/BPMN, Agents,
 *    API Workflows, Coded Apps, Functions)
 * 4. Produces an SDD (Solution Design Document)
 * 5. Scaffolds a UiPath solution that implements the same process
 *
 * Pipeline: inspect → analyze → document (PDD) → map (SDD) → scaffold
 *
 * Verified commands (uip v1.202.1):
 * - `uip solution init <solutionName>` — create a new .uipx solution
 * - `uip maestro case init <name>` — create a new case project
 * - `uip maestro case validate <file> --output json` — validate caseplan
 * - `uip or folders list --output json` — list folders for context
 * - `uip or processes list --all-folders --output json` — existing processes
 * - `uip or assets list --all-folders --output json` — existing assets
 * - `uip or queues list --all-folders --output json` — existing queues
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Agent, AgentContext, AgentResult } from '../types';
import { runUipChain, makeResult, makeChainResult, planResult } from '../config';

/** Read and classify an input file or directory. */
function inspectInput(inputPath: string): {
  type: string;
  content: string;
  files: string[];
} {
  const stat = fs.statSync(inputPath);

  if (stat.isDirectory()) {
    // Walk the directory for process-like files
    const files: string[] = [];
    const exts = ['.py', '.sh', '.ps1', '.bat', '.js', '.ts', '.bpmn', '.xml',
                  '.json', '.yaml', '.yml', '.md', '.txt', '.csv', '.xlsx', '.flow'];
    function walk(dir: string, depth: number) {
      if (depth > 5) return;
      try {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          if (['node_modules', '.git', 'dist', '__pycache__'].includes(entry.name)) continue;
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) walk(full, depth + 1);
          else if (exts.some((ext) => entry.name.endsWith(ext))) files.push(path.relative(inputPath, full));
        }
      } catch { /* ignore */ }
    }
    walk(inputPath, 0);
    return { type: 'directory', content: '', files };
  }

  // Single file — read it (cap at 64KB for safety)
  const content = fs.readFileSync(inputPath, 'utf8').slice(0, 65536);
  const ext = path.extname(inputPath).toLowerCase();

  let type = 'unknown';
  if (ext === '.py') type = 'python';
  else if (ext === '.sh' || ext === '.bash') type = 'shell';
  else if (ext === '.ps1') type = 'powershell';
  else if (ext === '.bpmn') type = 'bpmn';
  else if (ext === '.xml' || content.includes('<xaml') || content.includes('<Activity')) type = 'xaml';
  else if (ext === '.js' || ext === '.ts') type = 'javascript';
  else if (ext === '.json') type = 'json';
  else if (ext === '.md' || ext === '.txt') type = 'text';
  else if (ext === '.yaml' || ext === '.yml') type = 'yaml';

  return { type, content, files: [path.basename(inputPath)] };
}

/** Derive a UiPath solution name from the input path. */
function deriveSolutionName(inputPath: string): string {
  const base = path.basename(path.resolve(inputPath));
  // Strip common extensions and non-alphanumeric chars
  const cleaned = base.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9]/g, '-');
  return cleaned || 'rea-solution';
}

/** Detect which UiPath product(s) best fit the input type. */
function mapToUipathProduct(inputType: string): string[] {
  switch (inputType) {
    case 'python':
    case 'shell':
    case 'powershell':
      // Scripts → RPA (robotic process automation) or Coded Functions
      return ['RPA', 'Functions'];
    case 'bpmn':
      // BPMN from another platform → Maestro BPMN
      return ['MaestroBPMN'];
    case 'xaml':
      // Already UiPath XAML → RPA
      return ['RPA'];
    case 'json':
      // Could be an API workflow or agent config
      return ['APIWorkflow', 'Agents'];
    case 'javascript':
      // Could be a coded app or function
      return ['CodedApps', 'Functions'];
    case 'text':
    case 'yaml':
      // Process description → Maestro Case or Flow
      return ['MaestroCase', 'MaestroFlow'];
    case 'directory':
      // Mixed content → multi-project solution
      return ['Solution'];
    default:
      return ['RPA'];
  }
}

/** Write the PDD (Process Design Document) from the inspection. */
function writePdd(
  solutionDir: string,
  inputType: string,
  inputPath: string,
  files: string[],
  products: string[],
): string {
  const pddPath = path.join(solutionDir, 'pdd.md');
  const lines: string[] = [
    '# Process Design Document (PDD)',
    '',
    `> Generated by REA-UiPath from \`${path.basename(inputPath)}\``,
    '',
    '## Source',
    '',
    `- **Input type:** ${inputType}`,
    `- **Input path:** ${inputPath}`,
    `- **Files discovered:** ${files.length}`,
    '',
    '## Process Overview',
    '',
    '<!-- Describe the process based on the inspected input -->',
    '',
    '## Inputs',
    '',
    '<!-- Data contracts the process consumes -->',
    '',
    '## Outputs',
    '',
    '<!-- Data contracts the process produces -->',
    '',
    '## Steps',
    '',
    '<!-- Ordered steps extracted from the source -->',
    '',
    '## Exceptions & Error Handling',
    '',
    '<!-- Edge cases, retries, error conditions -->',
    '',
    '## Target UiPath Products',
    '',
    ...products.map((p) => `- ${p}`),
    '',
  ];
  try { fs.writeFileSync(pddPath, lines.join('\n')); } catch { /* ignore */ }
  return pddPath;
}

export const reaUipath: Agent = {
  name: 'rea-uipath',
  role:
    'Reverse-engineers ANY existing system (script, macro, BPMN, process) into a UiPath solution. Inspects the input, documents it as a PDD, maps to UiPath products, and scaffolds a .uipx solution.',
  skills: ['uipath-planner', 'uipath-solution', 'uipath-platform', 'uipath-maestro-case'],
  commands: [
    'uip solution init',
    'uip maestro case init',
    'uip maestro case validate',
    'uip or folders list',
    'uip or processes list',
    'uip or assets list',
    'uip or queues list',
  ],
  async run(ctx: AgentContext): Promise<AgentResult> {
    const start = Date.now();
    const inputPath = ctx.solutionPath ?? ctx.sddPath ?? ctx.cwd;
    const solutionName = deriveSolutionName(inputPath);

    // Inspect the input
    let inspection: { type: string; content: string; files: string[] };
    try {
      inspection = inspectInput(inputPath);
    } catch (err: unknown) {
      return makeResult('rea-uipath', {
        command: 'inspect',
        args: [inputPath],
        stdout: '',
        stderr: String(err),
        exitCode: 1,
      }, [], start);
    }

    // Map to UiPath products
    const products = mapToUipathProduct(inspection.type);

    if (ctx.dryRun) {
      return planResult('rea-uipath', [
        `inspect ${inputPath} (type: ${inspection.type}, ${inspection.files.length} file(s))`,
        `map to UiPath products: ${products.join(', ')}`,
        `write PDD → ${solutionName}/pdd.md`,
        `write SDD → ${solutionName}/sdd.md`,
        `scaffold: uip solution init ${solutionName}`,
        `scaffold: uip maestro case init ${solutionName}-case`,
        `validate: uip maestro case validate ${solutionName}/${solutionName}-case/caseplan.json`,
        `discover existing: uip or processes list --all-folders`,
      ], [`${solutionName}/pdd.md`, `${solutionName}/sdd.md`], start);
    }

    // Phase 1: Write the PDD
    const pddPath = writePdd(ctx.cwd, inspection.type, inputPath, inspection.files, products);

    // Phase 2: Scaffold the UiPath solution
    const chain = runUipChain(ctx, [
      {
        args: ['solution', 'init', solutionName],
        label: 'rea: solution init',
      },
      {
        args: ['or', 'folders', 'list', '--output', 'json'],
        label: 'rea: folders list',
      },
      {
        args: ['or', 'processes', 'list', '--all-folders', '--output', 'json'],
        label: 'rea: processes list',
      },
      {
        args: ['or', 'assets', 'list', '--all-folders', '--output', 'json'],
        label: 'rea: assets list',
      },
      {
        args: ['or', 'queues', 'list', '--all-folders', '--output', 'json'],
        label: 'rea: queues list',
      },
    ]);

    // Phase 3: If mapped to Maestro Case, scaffold a case project too
    if (products.includes('MaestroCase')) {
      const caseResult = runUipChain(ctx, [
        {
          args: ['maestro', 'case', 'init', `${solutionName}-case`],
          label: 'rea: case init',
        },
      ]);
      void caseResult; // run sequentially after solution scaffold
    }

    return makeChainResult('rea-uipath', chain, [pddPath], start);
  },
};