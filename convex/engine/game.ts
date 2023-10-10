import { Infer, Validator } from 'convex/values';
import { Id } from '../_generated/dataModel';
import { MutationCtx } from '../_generated/server';
import { ENGINE_WAKEUP_THRESHOLD } from './constants';
import { FunctionReference } from 'convex/server';
import * as agentScheduling from '../agent/scheduling';
import { AgentRunReference } from '../agent/scheduling';

export type InputHandler<Args extends any, ReturnValue extends any> = {
  args: Validator<Args, false, any>;
  returnValue: Validator<ReturnValue, false, any>;
};

export type InputHandlers = Record<string, InputHandler<any, any>>;

type StepReference = FunctionReference<
  'mutation',
  'internal',
  { engineId: Id<'engines'>; runId: Id<'engineScheduledRuns'> },
  null
>;

export abstract class Game<Handlers extends InputHandlers> {
  abstract engineId: Id<'engines'>;

  abstract tickDuration: number;
  abstract stepDuration: number;
  abstract maxTicksPerStep: number;
  abstract maxInputsPerStep: number;

  constructor(public agentRunReference: AgentRunReference) {}

  abstract handleInput(
    now: number,
    name: keyof Handlers,
    args: Infer<Handlers[typeof name]['args']>,
  ): Promise<Infer<Handlers[typeof name]['returnValue']>>;

  abstract tick(now: number): void;
  abstract save(ctx: MutationCtx): Promise<void>;
  idleUntil(now: number): null | number {
    return null;
  }

  async runStep(ctx: MutationCtx, stepReference: StepReference, runId: Id<'engineScheduledRuns'>) {
    const now = Date.now();
    const engine = await ctx.db.get(this.engineId);
    if (!engine) {
      throw new Error(`Invalid engine ID: ${this.engineId}`);
    }
    if (!engine.running) {
      console.debug(`Engine ${this.engineId} is not active, returning immediately.`);
      return;
    }
    if (engine.currentTime && now < engine.currentTime) {
      throw new Error(`Server time moving backwards: ${now} < ${engine.currentTime}`);
    }
    const run = await ctx.db.get(runId);
    if (!run) {
      console.debug(`Scheduled run ${runId} not found, returning immediately.`);
      return;
    }
    await ctx.db.delete(runId);

    // Collect the inputs for our step, sorting them by receipt time.
    const inputs = await ctx.db
      .query('inputs')
      .withIndex('byInputNumber', (q) =>
        q.eq('engineId', this.engineId).gt('number', engine.processedInputNumber ?? -1),
      )
      .take(this.maxInputsPerStep);

    const lastStepTs = engine.currentTime;
    const startTs = lastStepTs ? lastStepTs + this.tickDuration : now;
    let currentTs = startTs;
    let inputIndex = 0;
    let numTicks = 0;
    let processedInputNumber = engine.processedInputNumber;
    while (true) {
      if (numTicks > this.maxTicksPerStep) {
        break;
      }
      numTicks += 1;

      // Collect all of the inputs for this tick.
      const tickInputs = [];
      while (inputIndex < inputs.length) {
        const input = inputs[inputIndex];
        if (input.received > currentTs) {
          break;
        }
        inputIndex += 1;
        processedInputNumber = input.number;
        tickInputs.push(input);
      }

      // Feed the inputs to the game.
      for (const input of tickInputs) {
        try {
          const value = await this.handleInput(currentTs, input.name, input.args);
          input.returnValue = { kind: 'ok', value };
        } catch (e: any) {
          console.error(`Input ${input._id} failed: ${e.message}`);
          input.returnValue = { kind: 'error', message: e.message };
        }
        await ctx.db.replace(input._id, input);
        await agentScheduling.wakeupInput(ctx, this.agentRunReference, input);
      }

      // Simulate the game forward one tick.
      this.tick(currentTs);

      // Decide how to advance time.
      let candidateTs = currentTs + this.tickDuration;
      let idleUntil = this.idleUntil(currentTs);
      if (idleUntil) {
        if (inputIndex < inputs.length) {
          idleUntil = Math.min(idleUntil, inputs[inputIndex].received);
        }
        // Clamp the idle time to between the next tick and now.
        idleUntil = Math.max(candidateTs, Math.min(idleUntil, now));
        console.log(`Engine idle, advancing time to ${idleUntil}`);
        candidateTs = idleUntil;
      }
      if (now < candidateTs) {
        break;
      }
      currentTs = candidateTs;
    }

    let stepNextRun = this.idleUntil(currentTs);

    // Force an immediate wakeup if we have more inputs to process or more time to simulate.
    if (inputs.length === this.maxInputsPerStep) {
      console.warn(`Received max inputs (${this.maxInputsPerStep}) for step`);
      stepNextRun = null;
    }
    if (numTicks === this.maxTicksPerStep) {
      console.warn(`Only simulating ${currentTs - startTs}ms due to max ticks per step limit.`);
      stepNextRun = null;
    }
    stepNextRun = stepNextRun ?? now + this.stepDuration;

    // Commit the step by moving time forward, consuming our inputs, and saving the game's state.
    await this.save(ctx);
    await ctx.db.patch(engine._id, {
      currentTime: currentTs,
      lastStepTs,
      processedInputNumber,
      // Use the generation number to serialize all instances of `runStep`.
      generationNumber: engine.generationNumber + 1,
    });

    await scheduleEngineRun(ctx, stepReference, this.engineId, stepNextRun);

    console.log(`Simulated from ${startTs} to ${currentTs} (${currentTs - startTs}ms)`);
  }
}

async function scheduleEngineRun(
  ctx: MutationCtx,
  stepReference: StepReference,
  engineId: Id<'engines'>,
  runTimestamp: number,
  force?: boolean,
) {
  const nextScheduledRun = await ctx.db
    .query('engineScheduledRuns')
    .withIndex('engineId', (q) => q.eq('engineId', engineId))
    .order('asc')
    .first();
  let nextRun = nextScheduledRun?.runTimestamp;
  if (!nextRun || runTimestamp + ENGINE_WAKEUP_THRESHOLD < nextRun || force) {
    const waitDuration = (runTimestamp - Date.now()) / 1000;
    console.log(`Waking up ${engineId} in ${waitDuration.toFixed(2)}s`);
    const runId = await ctx.db.insert('engineScheduledRuns', {
      engineId,
      runTimestamp,
    });
    await ctx.scheduler.runAt(runTimestamp, stepReference, { engineId, runId });
  }
}

export async function insertInput(
  ctx: MutationCtx,
  stepReference: StepReference,
  engineId: Id<'engines'>,
  name: string,
  args: any,
): Promise<Id<'inputs'>> {
  const now = Date.now();
  const engine = await ctx.db.get(engineId);
  if (!engine) {
    throw new Error(`Invalid engine ID: ${engineId}`);
  }
  if (!engine.running) {
    throw new Error(`engine ${engineId} is not active.`);
  }
  const prevInput = await ctx.db
    .query('inputs')
    .withIndex('byInputNumber', (q) => q.eq('engineId', engineId))
    .order('desc')
    .first();
  const number = prevInput ? prevInput.number + 1 : 0;
  const inputId = await ctx.db.insert('inputs', {
    engineId,
    number,
    name,
    args,
    received: now,
  });
  await scheduleEngineRun(ctx, stepReference, engineId, now);
  return inputId;
}

export async function createEngine(ctx: MutationCtx, stepReference: StepReference) {
  const now = Date.now();
  const engineId = await ctx.db.insert('engines', {
    currentTime: now,
    generationNumber: 0,
    running: true,
  });
  await scheduleEngineRun(ctx, stepReference, engineId, now);
  return engineId;
}

export async function startEngine(
  ctx: MutationCtx,
  stepReference: StepReference,
  engineId: Id<'engines'>,
) {
  const engine = await ctx.db.get(engineId);
  if (!engine) {
    throw new Error(`Invalid engine ID: ${engineId}`);
  }
  if (engine.running) {
    throw new Error(`Engine ${engineId} isn't currently stopped`);
  }
  const now = Date.now();
  await ctx.db.patch(engineId, {
    // Forcibly advance time to the present. This does mean we'll skip
    // simulating the time the engine was stopped, but we don't want
    // to have to simulate a potentially large stopped window and send
    // it down to clients.
    lastStepTs: engine.currentTime,
    currentTime: now,
    running: true,
  });
  await scheduleEngineRun(ctx, stepReference, engineId, now, true);
}

export async function kickEngine(
  ctx: MutationCtx,
  stepReference: StepReference,
  engineId: Id<'engines'>,
) {
  const engine = await ctx.db.get(engineId);
  if (!engine) {
    throw new Error(`Invalid engine ID: ${engineId}`);
  }
  if (!engine.running) {
    throw new Error(`Engine ${engineId} isn't currently running`);
  }
  await scheduleEngineRun(ctx, stepReference, engineId, Date.now(), true);
}

export async function stopEngine(ctx: MutationCtx, engineId: Id<'engines'>) {
  const engine = await ctx.db.get(engineId);
  if (!engine) {
    throw new Error(`Invalid engine ID: ${engineId}`);
  }
  if (!engine.running) {
    throw new Error(`Engine ${engineId} isn't currently running`);
  }
  await ctx.db.patch(engineId, { running: false });
}
