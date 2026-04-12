# Easner mobile — motion tokens

## When to animate

- **Do:** Short parallel opacity and/or a small vertical offset (about 8–12pt) on screen enter for non–money-critical chrome; list rows without staggered delays; nav transitions under ~250ms.
- **Skip decorative motion** when the user has **Reduce motion** enabled (`shouldPlayDecorativeMotionEnter()` / `useCalmParallelEnterWhen`).
- **Always allow** functional motion (PIN shake, explicit success feedback).

## Token names (`mobile/src/theme/motion.ts`)

| Token | Role |
|--------|------|
| `screenEnterMs` | Default parallel enter duration for headers + body |
| `screenEnterTranslateY` | Interpolation magnitude for translateY on enter |
| `listRowEnterMs` / `listRowTranslateY` | Transaction-style list rows |
| `skeletonPulseMs` | Shimmer / skeleton loop period |
| `sheetMs` | Sheets and large surfaces |
| `tapMs` | Micro-interactions |

Global timing lives in `mobile/src/theme/index.ts` (`duration`, `easing`). Stack transitions use `mobile/src/navigation/transitionPresets.ts` so nav stays consistent with product policy.
