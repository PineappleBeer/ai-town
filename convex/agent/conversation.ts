import { v } from 'convex/values';
import { Id } from '../_generated/dataModel';
import { ActionCtx, internalQuery } from '../_generated/server';
import { LLMMessage, chatCompletion } from '../util/openai';
import { UseOllama, ollamaChatCompletion } from '../util/ollama';
import * as memory from './memory';
import { api, internal } from '../_generated/api';
import * as embeddingsCache from './embeddingsCache';
import { GameId, conversationId, playerId } from '../aiTown/ids';
import { NUM_MEMORIES_TO_SEARCH } from '../constants';

const selfInternal = internal.agent.conversation;
const completionFn = UseOllama ? ollamaChatCompletion : chatCompletion;

export async function startConversationMessage(
  ctx: ActionCtx,
  worldId: Id<'worlds'>,
  conversationId: GameId<'conversations'>,
  playerId: GameId<'players'>,
  otherPlayerId: GameId<'players'>,
) {
  const { player, otherPlayer, agent, otherAgent, lastConversation } = await ctx.runQuery(
    selfInternal.queryPromptData,
    {
      worldId,
      playerId,
      otherPlayerId,
      conversationId,
    },
  );
  const embedding = await embeddingsCache.fetch(
    ctx,
    `你对${otherPlayer.name}有什么看法？`,
  );

  const memories = await memory.searchMemories(
    ctx,
    player.id as GameId<'players'>,
    embedding,
    NUM_MEMORIES_TO_SEARCH(),
  );

  const memoryWithOtherPlayer = memories.find(
    (m) => m.data.type === 'conversation' && m.data.playerIds.includes(otherPlayerId),
  );
  const prompt = [
    `你是${player.name}，你刚刚开始和${otherPlayer.name}进行对话。`,
  ];
  prompt.push(...agentPrompts(otherPlayer, agent, otherAgent ?? null));
  prompt.push(...previousConversationPrompt(otherPlayer, lastConversation));
  prompt.push(...relatedMemoriesPrompt(memories));
  if (memoryWithOtherPlayer) {
    prompt.push(
      `确保在你的问候中包含关于之前对话的一些细节或问题。`,
    );
  }
  prompt.push(`${player.name}：`);

  const { content } = await completionFn({
    messages: [
      {
        role: 'user',
        content: prompt.join('\n'),
      },
    ],
    max_tokens: 300,
    stream: true,
    stop: stopWords(otherPlayer.name, player.name),
  });
  return content;
}

export async function continueConversationMessage(
  ctx: ActionCtx,
  worldId: Id<'worlds'>,
  conversationId: GameId<'conversations'>,
  playerId: GameId<'players'>,
  otherPlayerId: GameId<'players'>,
) {
  const { player, otherPlayer, conversation, agent, otherAgent } = await ctx.runQuery(
    selfInternal.queryPromptData,
    {
      worldId,
      playerId,
      otherPlayerId,
      conversationId,
    },
  );
  const now = Date.now();
  const started = new Date(conversation.created);
  const embedding = await embeddingsCache.fetch(
    ctx,
    `你对${otherPlayer.name}有什么看法？`,
  );
  const memories = await memory.searchMemories(ctx, player.id as GameId<'players'>, embedding, 3);
  const prompt = [
    `你是${player.name}，你当前正在和${otherPlayer.name}进行对话。`,
    `对话开始于${started.toLocaleString()}。现在是${now.toLocaleString()}。`,
  ];
  prompt.push(...agentPrompts(otherPlayer, agent, otherAgent ?? null));
  prompt.push(...relatedMemoriesPrompt(memories));
  prompt.push(
    `以下是你和${otherPlayer.name}的当前聊天历史。`,
    `不要再次问候他们。不要过于频繁地使用"Hey"。你的回应应该简短，且在200个字符以内。`,
  );

  const llmMessages: LLMMessage[] = [
    {
      role: 'user',
      content: prompt.join('\n'),
    },
    ...(await previousMessages(
      ctx,
      worldId,
      player,
      otherPlayer,
      conversation.id as GameId<'conversations'>,
    )),
  ];
  llmMessages.push({ role: 'user', content: `${player.name}：` });

  const { content } = await completionFn({
    messages: llmMessages,
    max_tokens: 300,
    stream: true,
    stop: stopWords(otherPlayer.name, player.name),
  });
  return content;
}

export async function leaveConversationMessage(
  ctx: ActionCtx,
  worldId: Id<'worlds'>,
  conversationId: GameId<'conversations'>,
  playerId: GameId<'players'>,
  otherPlayerId: GameId<'players'>,
) {
  const { player, otherPlayer, conversation, agent, otherAgent } = await ctx.runQuery(
    selfInternal.queryPromptData,
    {
      worldId,
      playerId,
      otherPlayerId,
      conversationId,
    },
  );
  const prompt = [
    `你是${player.name}，你当前正在和${otherPlayer.name}进行对话。`,
    `你已决定离开问题，并希望礼貌地告诉他们你将离开对话。`,
  ];
  prompt.push(...agentPrompts(otherPlayer, agent, otherAgent ?? null));
  prompt.push(
    `以下是你和${otherPlayer.name}的当前聊天历史。`,
    `你想怎样告诉他们你将离开？你的回应应该简短，且在200个字符以内。`,
  );
  const llmMessages: LLMMessage[] = [
    {
      role: 'user',
      content: prompt.join('\n'),
    },
    ...(await previousMessages(
      ctx,
      worldId,
      player,
      otherPlayer,
      conversation.id as GameId<'conversations'>,
    )),
  ];
  llmMessages.push({ role: 'user', content: `${player.name}：` });

  const { content } = await completionFn({
    messages: llmMessages,
    max_tokens: 300,
    stream: true,
    stop: stopWords(otherPlayer.name, player.name),
  });
  return content;
}

function agentPrompts(
  otherPlayer: { name: string },
  agent: { identity: string; plan: string } | null,
  otherAgent: { identity: string; plan: string } | null,
): string[] {
  const prompt = [];
  if (agent) {
    prompt.push(`关于你：${agent.identity}`);
    prompt.push(`你的对话目标：${agent.plan}`);
  }
  if (otherAgent) {
    prompt.push(`关于${otherPlayer.name}：${otherAgent.identity}`);
  }
  return prompt;
}

function previousConversationPrompt(
  otherPlayer: { name: string },
  conversation: { created: number } | null,
): string[] {
  const prompt = [];
  if (conversation) {
    const prev = new Date(conversation.created);
    const now = new Date();
    prompt.push(
      `你上次和${otherPlayer.name}聊天是在${prev.toLocaleString()}。现在是${now.toLocaleString()}。`,
    );
  }
  return prompt;
}

function relatedMemoriesPrompt(memories: memory.Memory[]): string[] {
  const prompt = [];
  if (memories.length > 0) {
    prompt.push(`以下是一些相关的记忆，按相关性递减的顺序排列：`);
    for (const memory of memories) {
      prompt.push(' - ' + memory.description);
    }
  }
  return prompt;
}

async function previousMessages(
  ctx: ActionCtx,
  worldId: Id<'worlds'>,
  player: { id: string; name: string },
  otherPlayer: { id: string; name: string },
  conversationId: GameId<'conversations'>,
) {
  const llmMessages: LLMMessage[] = [];
  const prevMessages = await ctx.runQuery(api.messages.listMessages, { worldId, conversationId });
  for (const message of prevMessages) {
    const author = message.author === player.id ? player : otherPlayer;
    const recipient = message.author === player.id ? otherPlayer : player;
    llmMessages.push({
      role: 'user',
      content: `${author.name} 对 ${recipient.name}：${message.text}`,
    });
  }
  return llmMessages;
}

export const queryPromptData = internalQuery({
  args: {
    worldId: v.id('worlds'),
    playerId,
    otherPlayerId: playerId,
    conversationId,
  },
  handler: async (ctx, args) => {
    const world = await ctx.db.get(args.worldId);
    if (!world) {
      throw new Error(`未找到世界${args.worldId}`);
    }
    const player = world.players.find((p) => p.id === args.playerId);
    if (!player) {
      throw new Error(`未找到玩家${args.playerId}`);
    }
    const playerDescription = await ctx.db
      .query('playerDescriptions')
      .withIndex('worldId', (q) => q.eq('worldId', args.worldId).eq('playerId', args.playerId))
      .first();
    if (!playerDescription) {
      throw new Error(`未找到玩家${args.playerId}的描述`);
    }
    const otherPlayer = world.players.find((p) => p.id === args.otherPlayerId);
    if (!otherPlayer) {
      throw new Error(`未找到玩家${args.otherPlayerId}`);
    }
    const otherPlayerDescription = await ctx.db
      .query('playerDescriptions')
      .withIndex('worldId', (q) => q.eq('worldId', args.worldId).eq('playerId', args.otherPlayerId))
      .first();
    if (!otherPlayerDescription) {
      throw new Error(`未找到玩家${args.otherPlayerId}的描述`);
    }
    const conversation = world.conversations.find((c) => c.id === args.conversationId);
    if (!conversation) {
      throw new Error(`未找到对话${args.conversationId}`);
    }
    const agent = world.agents.find((a) => a.playerId === args.playerId);
    if (!agent) {
          throw new Error(`未找到玩家${args.playerId}的代理`);
    }
    const otherAgent = world.agents.find((a) => a.playerId === args.otherPlayerId);
    const lastConversation = await ctx.db
      .query('conversations')
      .withIndex('worldId', (q) =>
        q
          .eq('worldId', args.worldId)
          .eq('playerIds', [args.playerId, args.otherPlayerId].sort())
          .lt('id', args.conversationId),
      )
      .first();
    return {
      player: {
        ...player,
        name: playerDescription.name,
      },
      otherPlayer: {
        ...otherPlayer,
        name: otherPlayerDescription.name,
      },
      agent: {
        identity: agent.identity,
        plan: agent.plan,
      },
      otherAgent: otherAgent
        ? {
            identity: otherAgent.identity,
            plan: otherAgent.plan,
          }
        : null,
      lastConversation,
    };
  },
});

