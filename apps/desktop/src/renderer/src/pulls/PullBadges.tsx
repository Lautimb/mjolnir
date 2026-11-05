import type { ChecksState, PullRequestDetail, PullRequestSummary, ReviewDecision } from '@mjolnir/core/browser'
import { useI18n } from '../i18n/I18nProvider'
import { Badge, type Tone } from '../ui/Badge'

type DisplayState = PullRequestSummary['state'] | 'draft'

const STATE_TONE: Record<DisplayState, Tone> = { open: 'success', merged: 'merged', closed: 'danger', draft: 'muted' }
const CHECKS_TONE: Record<ChecksState, Tone> = { success: 'success', failure: 'danger', pending: 'accent' }
const REVIEW_TONE: Record<ReviewDecision, Tone> = { approved: 'success', changes_requested: 'danger', review_required: 'accent' }

export function StateBadge({ pull }: { pull: PullRequestSummary }) {
  const { t } = useI18n()
  const state: DisplayState = pull.draft && pull.state === 'open' ? 'draft' : pull.state
  return <Badge tone={STATE_TONE[state]}>{t(`pulls.states.${state}`)}</Badge>
}

export function DetailBadges({ pull }: { pull: PullRequestDetail }) {
  const { t } = useI18n()
  return (
    <>
      <StateBadge pull={pull} />
      {pull.checks && <Badge tone={CHECKS_TONE[pull.checks]}>{t(`pulls.checks.${pull.checks}`)}</Badge>}
      {pull.reviewDecision && <Badge tone={REVIEW_TONE[pull.reviewDecision]}>{t(`pulls.review.${pull.reviewDecision}`)}</Badge>}
    </>
  )
}
