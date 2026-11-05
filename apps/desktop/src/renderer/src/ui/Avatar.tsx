import { cx } from './cx'

export function Avatar({ url, small }: { url: string | null; small?: boolean }) {
  if (!url) return null
  return <img className={cx('flex-none rounded-full', small ? 'size-4' : 'size-5')} src={url} alt="" />
}
