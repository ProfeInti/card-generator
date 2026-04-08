# Math Dungeons Beta Checklist

## Suggested Seed

- Context: [math-dungeons-vault-context.json](/C:/Users/Kory/generador-cartas/card-generator/docs/beta/math-dungeons-vault-context.json)
- Challenges: [math-dungeons-challenges.json](/C:/Users/Kory/generador-cartas/card-generator/docs/beta/math-dungeons-challenges.json)
- Rewards: [math-dungeons-rewards.json](/C:/Users/Kory/generador-cartas/card-generator/docs/beta/math-dungeons-rewards.json)

## Teacher Setup

1. Create or open a Math Dungeons teacher draft.
2. Paste the dungeon context JSON into the dungeon editor.
3. Create two challenges and import one challenge JSON into each challenge card.
4. Add the two rewards manually or copy the reward JSON into the reward editor.
5. Publish the dungeon.

## Student Flow

1. Create one `scribe` character and start a run.
2. In `entrance`, inspect the room and verify the hidden key can be revealed.
3. Move to `archive-of-factors` and engage the factoring challenge.
4. Send a detailed command such as: `Agrupo la expresion en dos binomios y propongo $(x+2)(x+3)$.`.
5. Send a vague command such as: `Lo resuelvo.` and verify the runtime asks for more specificity.
6. Press `Conectar con tu ingenio e inventiva` once and verify the hint is concise.
7. Move to `guardian-gate` and engage the enemy challenge.
8. Send a detailed step such as: `Aplico la regla del producto a $x^3\\sin(x)$ sin derivar todavia.`.
9. Answer one related question directly, for example: `La derivada de \\sin(x) es \\cos(x).`
10. Check the `Run History` panel after each interaction.

## What To Observe

- Exploration narration stays grounded in the current room.
- Puzzle/combat execution does not skip steps.
- The runtime asks for clarification when the student is vague.
- Hints appear only through the dedicated button.
- Math facts shown in the challenge match the imported JSON.
- Enemy related questions remain tied to the challenge topic.
- The response remains short and structured instead of overly verbose.

## Known Manual Shortcuts In Current Beta

- `Mark Success` and `Mark Failure` still exist as fallback controls.
- Combat damage mitigation is not fully automated yet.
- Reward consumption effects are still minimal.
