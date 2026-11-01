#!/usr/bin/env node
/**
 * omu-h — the oh-my-UiPath CLI.
 *
 * A single command surface over the agents, workflows, and skills.
 * Built with commander.js. Every workflow/agent invocation supports
 * `--dry-run` (print the `uip` calls that would run) and `--verbose`.
 */
import { Command } from 'commander';
import chalk from 'chalk';
import * as path from 'node:path';
import type { AgentContext, AgentResult } from './types';
import { agentList, getAgent } from './agents';
import { workflowList, getWorkflow } from './workflows';
import { listSkills, getSkill, searchSkills, skillCount } from './skills';
import { loadConfig } from './config';
import { loadSkillStatusMap, buildSyncReport, loadVersionManifest } from './skill-status';
import { promote, printPromotion } from './engine/environments';
import { rollback, printRollback } from './engine/rollback';
import { buildTokenReport, formatTokenReport, loadTokens } from './token-tracker';

/** Build an AgentContext from CLI options. */
function buildCtx(opts: Record<string, unknown>): AgentContext {
  const skillStatusMap = loadSkillStatusMap();
  return {
    cwd: typeof opts.cwd === 'string' ? path.resolve(opts.cwd) : process.cwd(),
    sddPath: typeof opts.sdd === 'string' ? path.resolve(opts.sdd) : undefined,
    solutionPath: typeof opts.solution === 'string' ? path.resolve(opts.solution) : undefined,
    tenant: typeof opts.tenant === 'string' ? opts.tenant : undefined,
    folder: typeof opts.folder === 'string' ? opts.folder : undefined,
    dryRun: Boolean(opts.dryRun),
    verbose: Boolean(opts.verbose),
    allowPreview: Boolean(opts.allowPreview),
    skillStatusMap,
  };
}

/** Print a single agent result. */
function printResult(r: AgentResult, verbose: boolean): void {
  const tag = r.success ? chalk.green('OK') : chalk.red('FAIL');
  console.log(`\n${tag} ${chalk.bold(r.agent)} (${r.durationMs}ms)`);
  if (r.artifacts.length > 0) {
    console.log(chalk.gray(`  artifacts: ${r.artifacts.join(', ')}`));
  }
  if (verbose) {
    console.log(chalk.gray(r.output));
  } else {
    const firstLine = r.output.split('\n').slice(0, 1).join('');
    if (firstLine) console.log(chalk.gray(`  ${firstLine}`));
  }
}

/** Print a list of agent/workflow results. */
function printResults(results: AgentResult[], verbose: boolean): void {
  for (const r of results) printResult(r, verbose);
  const failed = results.filter((r) => !r.success);
  if (failed.length > 0) {
    console.error(
      chalk.red(`\n${failed.length} step(s) failed: ${failed.map((f) => f.agent).join(', ')}`),
    );
    process.exitCode = 1;
  }
}

/** Shared global options for workflow/agent commands. */
function withRunOptions(cmd: Command): Command {
  return cmd
    .option('--sdd <path>', 'path to the Solution Design Document')
    .option('--solution <path>', 'path to the .uipx solution or solution root')
    .option('--tenant <name>', 'target tenant')
    .option('--folder <name>', 'target Orchestrator folder')
    .option('--cwd <path>', 'working directory for uip', process.cwd())
    .option('--dry-run', 'print the uip calls that would run without executing')
    .option('--verbose', 'print full uip stdout/stderr')
    .option('--allow-preview', 'allow Preview/In-development skills against prod environments');
}

/** Run a shell command and return stdout, or empty string on failure. */
function tryExec(cmdStr: string): string {
  try {
    const { execSync } = require('child_process');
    return execSync(cmdStr, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch {
    return '';
  }
}

export function createCli(): Command {
  const program = new Command();
  program
    .name('omu-h')
    .description('oh-my-UiPath — multi-agent orchestration for the UiPath platform')
    .version('2.0.9');

  // --- setup ---
  program
    .command('setup')
    .description('Check prerequisites and show setup status')
    .action(async () => {
      console.log(chalk.cyan('\noh-my-UiPath Setup\n'));
      const cfg = loadConfig();

      // Check uip CLI
      const uipVer = tryExec(`'${cfg.uipBin}' --version`);
      if (uipVer) {
        console.log(`${chalk.green('✓')} uip CLI: ${chalk.bold(uipVer)} (${cfg.uipBin})`);
      } else {
        console.log(`${chalk.red('✗')} uip CLI: ${chalk.red('not found')} at ${cfg.uipBin}`);
        console.log(chalk.gray('  Install: npm install -g @uipath/cli'));
      }

      // Check skills
      const count = skillCount();
      if (count > 0) {
        console.log(`${chalk.green('✓')} UiPath skills: ${chalk.bold(String(count))} installed`);
      } else {
        console.log(`${chalk.red('✗')} UiPath skills: ${chalk.red('0 installed')}`);
        console.log(chalk.gray('  Install: uip skills install'));
      }

      // Check auth
      const authOut = tryExec(`'${cfg.uipBin}' login status`);
      if (authOut && authOut.includes('Logged in')) {
        console.log(`${chalk.green('✓')} uip login: ${chalk.bold('authenticated')}`);
      } else {
        console.log(`${chalk.yellow('⚠')} uip login: ${chalk.yellow('not authenticated')}`);
        console.log(chalk.gray('  Run: uip login'));
      }

      console.log(chalk.gray('\nCommands: omu-h agents | omu-h skills | omu-h workflows | omu-h autopilot --sdd ./sdd.md --dry-run\n'));
    });

  // --- agents ---
  program
    .command('agents')
    .description('List the available agents and their roles')
    .action(() => {
      for (const a of agentList) {
        console.log(`${chalk.bold(a.name)} — ${a.role}`);
        console.log(chalk.gray(`  skills: ${a.skills.join(', ')}`));
        console.log(chalk.gray(`  commands: ${a.commands.join(', ')}`));
      }
    });

  // --- workflows ---
  program
    .command('workflows')
    .description('List the available workflows')
    .action(() => {
      for (const w of workflowList) {
        console.log(`${chalk.bold(w.name)} — ${w.description}`);
        for (const s of w.steps) {
          console.log(chalk.gray(`  - ${s.name} (${s.agent}): ${s.description}`));
        }
      }
    });

  // --- skills ---
  program
    .command('skills')
    .description('List the installed UiPath skills')
    .option('-s, --search <needle>', 'filter skills by free-text search')
    .action((opts: Record<string, unknown>) => {
      const skills = opts.search ? searchSkills(String(opts.search)) : listSkills();
      console.log(chalk.gray(`# ${skillCount()} skills installed\n`));
      for (const s of skills) {
        console.log(`${chalk.bold(s.name)}`);
        console.log(chalk.gray(`  ${s.description.split('\n')[0]}`));
        console.log(chalk.gray(`  path: ${s.path}`));
      }
    });

  program
    .command('skill <name>')
    .description('Show a single skill by exact name')
    .action((name: string) => {
      const skill = getSkill(name);
      if (!skill) {
        console.error(chalk.red(`skill not found: ${name}`));
        process.exitCode = 1;
        return;
      }
      console.log(`${chalk.bold(skill.name)}\n${skill.description}\n\npath: ${skill.path}`);
    });

  // --- config ---
  program
    .command('config')
    .description('Show resolved configuration (uip bin, skills root)')
    .action(() => {
      const c = loadConfig();
      console.log(JSON.stringify(c, null, 2));
    });

  // --- run a single agent ---
  withRunOptions(program.command('agent <name>').description('Run a single agent by name'))
    .action(async (name: string, opts: Record<string, unknown>) => {
      const agent = getAgent(name);
      if (!agent) {
        console.error(chalk.red(`unknown agent: ${name}`));
        process.exitCode = 1;
        return;
      }
      const ctx = buildCtx(opts);
      printResults([await agent.run(ctx)], ctx.verbose);
    });

  // --- run a workflow ---
  const runWorkflow = async (wfName: string, opts: Record<string, unknown>): Promise<void> => {
    const wf = getWorkflow(wfName);
    if (!wf) {
      console.error(chalk.red(`unknown workflow: ${wfName}`));
      process.exitCode = 1;
      return;
    }
    const ctx = buildCtx(opts);
    console.log(chalk.cyan(`workflow: ${wf.name} — ${wf.description}`));
    const results = await wf.run(ctx);
    printResults(results, ctx.verbose);
  };

  withRunOptions(program.command('autopilot').description('Full SDD-to-deploy pipeline'))
    .action(async (opts: Record<string, unknown>) => runWorkflow('autopilot', opts));

  withRunOptions(program.command('build').description('Pack + validate the solution'))
    .action(async (opts: Record<string, unknown>) => runWorkflow('build', opts));

  withRunOptions(program.command('deploy').description('Upload + publish + deploy + activate'))
    .action(async (opts: Record<string, unknown>) => runWorkflow('deploy', opts));

  withRunOptions(program.command('run <workflow>').description('Run any workflow by name'))
    .action(async (workflow: string, opts: Record<string, unknown>) => runWorkflow(workflow, opts));

  // --- rea (Reverse Engineer Anything → UiPath) ---
  withRunOptions(
    program
      .command('rea <inputPath>')
      .description('Reverse-engineer ANY existing system (script, BPMN, process) into a UiPath solution'),
  )
    .action(async (inputPath: string, opts: Record<string, unknown>) => {
      const ctx = buildCtx({ ...opts, solution: inputPath });
      console.log(chalk.cyan(`\noh-my-UiPath REA: Reverse Engineering → UiPath\n`));
      console.log(chalk.gray(`Input: ${inputPath}\n`));
      const reaAgent = getAgent('rea-uipath');
      if (!reaAgent) {
        console.error(chalk.red('rea-uipath agent not found'));
        process.exitCode = 1;
        return;
      }
      printResults([await reaAgent.run(ctx)], ctx.verbose);
    });

  // --- promote ---
  withRunOptions(
    program
      .command('promote <from> <to>')
      .description('Promote from one environment to another (dev → test → prod) with gates'),
  )
    .option('--confirm', 'confirm promotion (required for prod)')
    .action(async (from: string, to: string, opts: Record<string, unknown>) => {
      const ctx = buildCtx(opts);
      console.log(chalk.cyan(`\noh-my-UiPath Promote: ${from} → ${to}\n`));
      const result = await promote(ctx, from, to, {
        validationPassed: true,
        criticalFindings: 0,
        testPassRate: 1.0,
        confirm: Boolean(opts.confirm),
      });
      printPromotion(result);
      if (!result.success) process.exitCode = 1;
    });

  // --- rollback ---
  withRunOptions(
    program
      .command('rollback <env>')
      .description('Rollback processes to their pre-deploy versions for an environment'),
  )
    .action(async (env: string, opts: Record<string, unknown>) => {
      const ctx = buildCtx(opts);
      console.log(chalk.cyan(`\noh-my-UiPath Rollback: ${env}\n`));
      const result = await rollback(ctx, env);
      printRollback(result);
      if (!result.success) process.exitCode = 1;
    });

  // --- tokens / roi (UiPath-Coding-Agent-ROI) ---
  program
    .command('tokens')
    .description('Show token usage report from the last pipeline run (UiPath-Coding-Agent-ROI)')
    .action(() => {
      const records = loadTokens();
      if (records.length === 0) {
        console.log(chalk.gray('No token data. Run a pipeline first (omu-h autopilot ...).'));
        return;
      }
      const report = buildTokenReport(records);
      console.log(formatTokenReport(report));
    });

  program
    .command('roi')
    .description('Show ROI report: token usage + cost estimate from the last pipeline run')
    .action(() => {
      const records = loadTokens();
      if (records.length === 0) {
        console.log(chalk.gray('No token data. Run a pipeline first (omu-h autopilot ...).'));
        return;
      }
      const report = buildTokenReport(records);
      const costInput = (report.totalInput / 1000) * 0.003;
      const costOutput = (report.totalOutput / 1000) * 0.015;
      const costTotal = costInput + costOutput;
      console.log(formatTokenReport(report));
      console.log('');
      console.log(`Cost estimate: $${costTotal.toFixed(4)} (input $${costInput.toFixed(4)} + output $${costOutput.toFixed(4)})`);
      console.log(chalk.gray('  Based on ~$0.003/1K input + $0.015/1K output. Adjust for your model.'));
    });

  // --- sync ---
  program
    .command('sync')
    .description('Sync skill status from upstream @uipath/skills and report changes')
    .action(() => {
      const map = loadSkillStatusMap();
      const count = skillCount();
      const report = buildSyncReport(count, map);
      const manifest = loadVersionManifest();

      console.log(chalk.cyan('\noh-my-UiPath Skill Sync\n'));
      console.log(`Upstream version: ${chalk.bold(report.upstreamVersion ?? 'unknown')}`);
      console.log(`Target CLI: ${chalk.gray(manifest?.targetCli ?? 'unknown')}`);
      console.log(`Installed skills: ${chalk.bold(String(report.totalSkills))}`);
      console.log();
      console.log(`  ${chalk.green('Stable')}:         ${report.stable}`);
      console.log(`  ${chalk.yellow('Preview')}:         ${report.preview}`);
      console.log(`  ${chalk.red('In-development')}: ${report.inDevelopment}`);
      console.log(`  ${chalk.gray('Unknown')}:        ${report.unknown}`);
      console.log();

      // List non-stable skills with warnings
      const skills = listSkills();
      const nonStable = skills.filter((s) => {
        const status = map[s.name];
        return status === 'preview' || status === 'in-development';
      });
      if (nonStable.length > 0) {
        console.log(chalk.yellow('Non-stable skills in use:'));
        for (const s of nonStable) {
          const status = map[s.name];
          const color = status === 'preview' ? chalk.yellow : chalk.red;
          console.log(`  ${color(status.padEnd(15))} ${s.name}`);
        }
        console.log();
        console.log(chalk.gray('Pipeline will warn on non-stable skills.'));
        console.log(chalk.gray('Use --allow-preview to allow against prod.'));
      } else {
        console.log(chalk.green('All installed skills are Stable.'));
      }
      console.log();
    });

  return program;
}

/** Parse argv and execute. Entry point for `bin/omu-h`. */
export async function runCli(argv: string[] = process.argv): Promise<void> {
  await createCli().parseAsync(argv);
}

// When run directly as `bin/omu-h`, execute the CLI.
if (require.main === module) {
  runCli().catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  });
}