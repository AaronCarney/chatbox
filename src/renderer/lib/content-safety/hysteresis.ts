const NSFWJS_FLAG = { Porn: 0.2, Hentai: 0.3, Sexy: 0.4 } as const
const NSFWJS_UNFLAG = { Porn: 0.1, Hentai: 0.15, Sexy: 0.2 } as const
const CLEAN_FRAMES_REQUIRED = 5
const HARD_BLOCK_CATEGORIES = ['sexual/minors', 'self-harm/instructions'] as const

type NsfwjsResult = { source: 'nsfwjs'; classes: Record<string, number> }
type OpenaiResult = { source: 'openai'; categories: Record<string, boolean>; categoryScores: Record<string, number> }
export type ClassifyResult = NsfwjsResult | OpenaiResult
export type Action = 'blur' | 'unblur' | 'hard_block' | 'none'

export class SafetyStateMachine {
  state: 'clean' | 'flagged' = 'clean'
  private cleanCount = 0

  update(result: ClassifyResult): Action {
    if (result.source === 'openai') return this.handleOpenai(result)
    return this.handleNsfwjs(result)
  }

  private handleNsfwjs(result: NsfwjsResult): Action {
    const { classes } = result
    const flagged = (classes.Porn ?? 0) > NSFWJS_FLAG.Porn
      || (classes.Hentai ?? 0) > NSFWJS_FLAG.Hentai
      || (classes.Sexy ?? 0) > NSFWJS_FLAG.Sexy

    if (this.state === 'clean') {
      if (flagged) {
        this.state = 'flagged'
        this.cleanCount = 0
        return 'blur'
      }
      return 'none'
    }

    // state === 'flagged'
    const belowUnflag = (classes.Porn ?? 0) < NSFWJS_UNFLAG.Porn
      && (classes.Hentai ?? 0) < NSFWJS_UNFLAG.Hentai
      && (classes.Sexy ?? 0) < NSFWJS_UNFLAG.Sexy

    if (belowUnflag) {
      this.cleanCount++
    } else {
      this.cleanCount = 0
    }

    if (this.cleanCount >= CLEAN_FRAMES_REQUIRED) {
      this.state = 'clean'
      this.cleanCount = 0
      return 'unblur'
    }
    return 'none'
  }

  private handleOpenai(result: OpenaiResult): Action {
    const { categories, categoryScores } = result
    for (const cat of HARD_BLOCK_CATEGORIES) {
      if ((categoryScores[cat] ?? 0) > 0.01) return 'hard_block'
    }
    const anyFlagged = Object.values(categories).some(v => v)
    if (anyFlagged && this.state === 'clean') {
      this.state = 'flagged'
      this.cleanCount = 0
      return 'blur'
    }
    return 'none'
  }
}
