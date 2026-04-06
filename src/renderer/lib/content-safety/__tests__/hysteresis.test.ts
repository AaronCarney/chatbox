import { describe, it, expect } from 'vitest'
import { SafetyStateMachine } from '../hysteresis'

describe('SafetyStateMachine', () => {
  it('starts in CLEAN state', () => {
    const sm = new SafetyStateMachine()
    expect(sm.state).toBe('clean')
  })

  it('flags immediately when NSFWJS score exceeds threshold', () => {
    const sm = new SafetyStateMachine()
    const action = sm.update({ source: 'nsfwjs', classes: { Porn: 0.3, Sexy: 0.1, Hentai: 0.05, Drawing: 0.3, Neutral: 0.25 } })
    expect(action).toBe('blur')
    expect(sm.state).toBe('flagged')
  })

  it('stays clean when scores are below threshold', () => {
    const sm = new SafetyStateMachine()
    const action = sm.update({ source: 'nsfwjs', classes: { Porn: 0.05, Sexy: 0.1, Hentai: 0.1, Drawing: 0.5, Neutral: 0.25 } })
    expect(action).toBe('none')
    expect(sm.state).toBe('clean')
  })

  it('requires 5 consecutive clean frames to unblur', () => {
    const sm = new SafetyStateMachine()
    sm.update({ source: 'nsfwjs', classes: { Porn: 0.5, Sexy: 0, Hentai: 0, Drawing: 0, Neutral: 0.5 } })
    expect(sm.state).toBe('flagged')
    const clean = { source: 'nsfwjs' as const, classes: { Porn: 0.05, Sexy: 0.05, Hentai: 0.05, Drawing: 0.5, Neutral: 0.35 } }
    for (let i = 0; i < 4; i++) {
      expect(sm.update(clean)).toBe('none')
      expect(sm.state).toBe('flagged')
    }
    expect(sm.update(clean)).toBe('unblur')
    expect(sm.state).toBe('clean')
  })

  it('resets clean count if a dirty frame appears during recovery', () => {
    const sm = new SafetyStateMachine()
    sm.update({ source: 'nsfwjs', classes: { Porn: 0.5, Sexy: 0, Hentai: 0, Drawing: 0, Neutral: 0.5 } })
    const clean = { source: 'nsfwjs' as const, classes: { Porn: 0.05, Sexy: 0.05, Hentai: 0.05, Drawing: 0.5, Neutral: 0.35 } }
    sm.update(clean); sm.update(clean); sm.update(clean)
    sm.update({ source: 'nsfwjs', classes: { Porn: 0.3, Sexy: 0, Hentai: 0, Drawing: 0, Neutral: 0.7 } })
    expect(sm.state).toBe('flagged')
    for (let i = 0; i < 4; i++) sm.update(clean)
    expect(sm.state).toBe('flagged')
    expect(sm.update(clean)).toBe('unblur')
  })

  it('flags on OpenAI moderation flagged categories', () => {
    const sm = new SafetyStateMachine()
    const action = sm.update({
      source: 'openai',
      categories: { violence: true, sexual: false },
      categoryScores: { violence: 0.9, sexual: 0.01 },
    })
    expect(action).toBe('blur')
  })

  it('hard blocks on sexual/minors above 0.01', () => {
    const sm = new SafetyStateMachine()
    const action = sm.update({
      source: 'openai',
      categories: { 'sexual/minors': false },
      categoryScores: { 'sexual/minors': 0.02 },
    })
    expect(action).toBe('hard_block')
    expect(sm.state).toBe('hard_blocked')
  })

  it('reset() returns to clean state', () => {
    const sm = new SafetyStateMachine()
    sm.update({ source: 'nsfwjs', classes: { Porn: 0.5, Sexy: 0, Hentai: 0, Drawing: 0, Neutral: 0.5 } })
    expect(sm.state).toBe('flagged')
    sm.reset()
    expect(sm.state).toBe('clean')
    // First clean frame after reset should not trigger unblur (no hysteresis needed)
    const action = sm.update({ source: 'nsfwjs', classes: { Porn: 0.01, Sexy: 0.01, Hentai: 0.01, Drawing: 0.5, Neutral: 0.47 } })
    expect(action).toBe('none')
  })

  it('hard_blocked is terminal — ignores all subsequent updates', () => {
    const sm = new SafetyStateMachine()
    sm.update({
      source: 'openai',
      categories: { 'sexual/minors': false },
      categoryScores: { 'sexual/minors': 0.02 },
    })
    expect(sm.state).toBe('hard_blocked')

    const clean = { source: 'nsfwjs' as const, classes: { Porn: 0, Sexy: 0, Hentai: 0, Drawing: 0.5, Neutral: 0.5 } }
    for (let i = 0; i < 10; i++) {
      expect(sm.update(clean)).toBe('none')
    }
    expect(sm.state).toBe('hard_blocked')
  })
})
