import type { PullRequestDetail, PullRequestSummary } from '@mjolnir/core/browser'
import { useI18n } from '../i18n/I18nProvider'

export function StateBadge({ pull }: { pull: PullRequestSummary }) {
  const { t } = useI18n()
  const state = pull.draft && pull.state === 'open' ? 'draft' : pull.state
  return <span className={`pull-badge state-${state}`}>{t(`pulls.states.${state}`)}</span>
}

export function DetailBadges({ pull }: { pull: PullRequestDetail }) {
  const { t } = useI18n()
  return (
    <>
      <StateBadge pull={pull} />
      {pull.checks && <span className={`pull-badge checks-${pull.checks}`}>{t(`pulls.checks.${pull.checks}`)}</span>}
      {pull.reviewDecision && (
        <span className={`pull-badge review-${pull.reviewDecision}`}>{t(`pulls.review.${pull.reviewDecision}`)}</span>
      )}
    </>
  )
}
