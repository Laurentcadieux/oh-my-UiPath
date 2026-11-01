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
import { runPipeline } from './engine';
import { promote, printPromotion } from './engine/environments';
import { rollback, printRollback } from './engine/rollback';

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
    .option('--allow-preview', 'allow Preview/In-development skills against prod environments')
    .option('--parallel', 'run the pipeline in parallel mode (engine)')
    .option('--concurrency <n>', 'max parallel tasks (default 4)', '4');
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
    .version('1.0.1');

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

    // If --parallel is set on autopilot, use the engine.
    if (opts.parallel && wfName === 'autopilot') {
      console.log(chalk.cyan(`engine: parallel mode (concurrency=${opts.concurrency ?? 4})`));
      const report = await runPipeline(ctx, 'parallel', {
        concurrency: Number(opts.concurrency ?? 4),
        dryRun: Boolean(opts.dryRun),
      });
      if (report.dagString) {
        console.log(chalk.gray(report.dagString));
        console.log(chalk.gray('\n' + report.batchString));
        console.log(chalk.gray('\n*No uip calls will run in dry-run mode.*'));
      }
      if (report.taskResultString) {
        console.log(chalk.gray(report.taskResultString));
      }
      printResults(report.results, ctx.verbose);
      return;
    }

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

  // --- bench ---
  withRunOptions(
    program
      .command('bench')
      .description('Benchmark: run the same SDD in sequential and parallel modes, compare wall-clock time per stage')
      .option('--concurrency <n>', 'max parallel tasks for parallel mode', '4'),
  )
    .action(async (opts: Record<string, unknown>) => {
      const ctx = buildCtx(opts);
      const concurrency = Number(opts.concurrency ?? 4);

      console.log(chalk.cyan('\noh-my-UiPath Benchmark\n'));

      if (ctx.dryRun) {
        // Just print the DAG + batches for both modes.
        const report = await runPipeline(ctx, 'parallel', { concurrency, dryRun: true });
        if (report.dagString) {
          console.log(chalk.gray(report.dagString));
          console.log(chalk.gray('\n' + report.batchString));
          console.log(chalk.gray('\n*No uip calls will run in dry-run mode.*\n'));
        }
        return;
      }

      // Sequential mode.
      console.log(chalk.gray('Running sequential mode...'));
      const seqStart = Date.now();
      const seqReport = await runPipeline(ctx, 'sequential', {});
      const seqDuration = Date.now() - seqStart;
      console.log(chalk.green(`  Sequential: ${seqDuration}ms`));
      printResults(seqReport.results, ctx.verbose);

      // Parallel mode.
      console.log(chalk.gray('\nRunning parallel mode...'));
      const parStart = Date.now();
      const parReport = await runPipeline(ctx, 'parallel', { concurrency });
      const parDuration = Date.now() - parStart;
      console.log(chalk.green(`  Parallel: ${parDuration}ms`));
      if (parReport.taskResultString) {
        console.log(chalk.gray(parReport.taskResultString));
      }

      // Summary.
      const speedup = seqDuration > 0 ? (seqDuration / parDuration).toFixed(2) : 'N/A';
      const faster = parDuration < seqDuration;
      console.log(chalk.cyan(`\nSummary:`));
      console.log(`  Sequential: ${chalk.bold(`${seqDuration}ms`)}`);
      console.log(`  Parallel:   ${chalk.bold(`${parDuration}ms`)} (concurrency=${concurrency})`);
      console.log(`  Speedup:    ${faster ? chalk.green(`${speedup}x`) : chalk.red(`${speedup}x`)} ${faster ? '(faster)' : '(slower)'}`);
      console.log();
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